"""
Multi-provider AI client for trip extraction.

Two-stage pipeline:
  Stage 1 (classify): Gemini Flash on compressed text — cheap yes/no detection
  Stage 2 (extract):  Claude Sonnet on full body — specialized extraction prompt
  Stage 3 (verify):   Claude Sonnet verify pass when fields are null

Provider waterfall for extraction:
  1. Claude Haiku (primary, tool_use JSON schema)
     Auto-escalates to Claude Sonnet when Haiku returns all-low-confidence
  2. Gemini 2.5 Flash (fallback: 15 RPM)
  3. Groq llama-3.3-70b (fallback: 14,400 RPD)
  4. OpenRouter (last resort)
"""

import asyncio
import json
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_BACKOFF = 1.0

# ── Relevant-line pre-extraction (used only in classify stage) ────────────────

_SIGNAL_PATTERNS = [
    re.compile(r'\b[A-Z]{2}\s?\d{1,4}\b'),
    re.compile(r'\([A-Z]{3}\)'),
    re.compile(r'\b[A-Z]{3}\s*[→\-–>]\s*[A-Z]{3}\b'),
    re.compile(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}', re.I),
    re.compile(r'\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)', re.I),
    re.compile(r'\b20[2-9]\d[-/.]\d{1,2}[-/.]\d{1,2}\b'),
    re.compile(r'\bpnr\b|\bconfirmation\b|\bbooking\s*(?:ref|number|code)\b|\brecord\s+locator\b', re.I),
    re.compile(r'\bpassenger\b|\btravell?er\b|\bdear\s+[A-Z]', re.I),
    re.compile(r'\bdepart(?:ure|ing|s)?\b|\barriv(?:al|es?)?\b|\bboarding\b', re.I),
    re.compile(r'\baircraft\b|\bequipment\b|\bBoeing\b|\bAirbus\b', re.I),
    re.compile(r'\bitinerary\b|\be-?ticket\b', re.I),
    re.compile(r'\|'),
]


def extract_relevant_lines(text: str, max_lines: int = 60) -> str:
    """Return only lines likely to contain flight booking data (~400 tokens max)."""
    relevant = [
        line.strip() for line in text.split('\n')
        if len(line.strip()) >= 4 and any(p.search(line.strip()) for p in _SIGNAL_PATTERNS)
    ]
    return '\n'.join(relevant[:max_lines]) if relevant else text[:2000]


# ── Prompts ───────────────────────────────────────────────────────────────────

CLASSIFY_PROMPT = """You classify emails: is this a CONFIRMED flight booking?

ACCEPT (is_flight: true) — email contains ALL THREE: flight number OR IATA codes + booking reference/PNR + departure date.
REJECT (is_flight: false) — any of these categories:
  price-alert: "prices dropped", "deal alert", "from $X", Google Flights/Kayak promo
  hotel-only: hotel confirmation with no flight
  car-only: rental car with no flight
  loyalty-statement: miles/points balance, tier status, award activity
  newsletter: promotional email, unsubscribe link only, no booking
  boarding-pass: already-used boarding pass or gate change (no new booking)
  voucher-credit: flight credit, voucher, refund — not a new booking
  seat-upgrade: upgrade confirmation for a flight already booked — not a new booking
  check-in-reminder: online check-in opened, please check in now — not a booking

UNCERTAIN — has some flight signals but missing one of the three required elements → return is_flight: true (escalate to extraction).

--- EXAMPLE 1: ACCEPT ---
Input: PNR ABCDEF / TK 1 / Istanbul (IST) → New York (JFK) / 14 Mar 2024 / Passenger: John Smith
Output: {"is_flight": true, "confidence": "certain", "rejection_reason": null}

--- EXAMPLE 2: REJECT ---
Input: Price alert: Flights NYC→IST from $389! Book on Google Flights
Output: {"is_flight": false, "confidence": "certain", "rejection_reason": "price-alert"}

--- EXAMPLE 3: REJECT ---
Input: Your Marriott reservation is confirmed. Check-in: March 14. No flight details.
Output: {"is_flight": false, "confidence": "certain", "rejection_reason": "hotel-only"}

--- EXAMPLE 4: REJECT (voucher-credit) ---
Input: Your flight credit of $245 is ready. Use code CREDIT2024 to book a future flight on American Airlines. Valid through Dec 31 2024.
Output: {"is_flight": false, "confidence": "certain", "rejection_reason": "voucher-credit"}

--- EXAMPLE 5: REJECT (seat-upgrade) ---
Input: Congratulations! Your seat upgrade request for AA 100 JFK→LHR on Jun 15 2024 has been confirmed. You are now in Business Class. PNR: XYZ123
Output: {"is_flight": false, "confidence": "certain", "rejection_reason": "seat-upgrade"}

--- EXAMPLE 6: REJECT (check-in-reminder) ---
Input: Online check-in is now open for your flight UA 23 / JFK→LAX / Mar 20 2024 departing 08:00. Check in now to choose your seat.
Output: {"is_flight": false, "confidence": "certain", "rejection_reason": "check-in-reminder"}

--- EXAMPLE 7: ACCEPT (forwarded email) ---
Input: ---------- Forwarded message --------- From: noreply@thy.com / PNR XYZABC / TK 1 | New York (JFK) | Istanbul (IST) | 14 Mar 2024
Output: {"is_flight": true, "confidence": "certain", "rejection_reason": null}

--- EXAMPLE 8: ACCEPT (non-English booking) ---
Input: Rezervasyon Kodu: ABC123 / Yolcu: Mehmet Yilmaz / TK 789 | Istanbul (IST) | Frankfurt (FRA) | 20 Mart 2024
Output: {"is_flight": true, "confidence": "certain", "rejection_reason": null}

--- EXAMPLE 9: ACCEPT (budget airline, no IATA codes) ---
Input: Booking confirmed! Ryanair FR 1234 / London Stansted to Barcelona El Prat / Reference: RY9X2K / Departure: 15 Jun 2024 06:30 / Passenger: Jane Smith
Output: {"is_flight": true, "confidence": "certain", "rejection_reason": null}

--- EXAMPLE 10: ACCEPT (aggregator / Expedia) ---
Input: Expedia Itinerary # 71999888777 / Traveler: Alex Chen / AA 100 | New York (JFK) | London (LHR) | Mar 20, 2024 09:00 / Booking confirmed
Output: {"is_flight": true, "confidence": "certain", "rejection_reason": null}

Respond with JSON only: {"is_flight": bool, "confidence": "certain"|"uncertain", "rejection_reason": string|null}"""

DESTINATION_COUNTRY_HINTS = """IATA→Country (use this, do not guess):
JFK/EWR/LGA/ORD/LAX/SFO/MIA/BOS/ATL/DFW/DEN/SEA/IAD/PHX/MSP/DTW/CLT/LAS/MCO/FLL→United States
LHR/LGW/LTN/STN/MAN/EDI/BHX→United Kingdom
CDG/ORY/NCE/MRS/LYS→France
FRA/MUC/DUS/TXL/BER/HAM/STR/CGN→Germany
FCO/MXP/LIN/VCE/NAP→Italy
MAD/BCN/AGP/VLC/PMI→Spain
AMS→Netherlands
BRU→Belgium
ZRH/GVA→Switzerland
VIE→Austria
CPH→Denmark
ARN/GOT→Sweden
OSL→Norway
HEL→Finland
WAW/KRK→Poland
PRG→Czech Republic
BUD→Hungary
ATH→Greece
LIS/OPO→Portugal
DUB→Ireland
IST/SAW/ADB/ESB→Turkey
DXB/DWC/AUH/SHJ→United Arab Emirates
DOH→Qatar
RUH/JED/DMM→Saudi Arabia
TLV→Israel
CAI/HRG/SSH→Egypt
CMN/RAK/FEZ→Morocco
JNB/CPT→South Africa
NBO→Kenya
ADD→Ethiopia
LOS/ABV→Nigeria
NRT/HND/KIX/CTS/OKA→Japan
ICN/GMP/PUS→South Korea
PVG/SHA/PEK/PKX/CTU/CAN/SZX→China
HKG→Hong Kong
TPE/TSA→Taiwan
SIN→Singapore
BKK/DMK/HKT/CNX→Thailand
KUL/SZB/PEN→Malaysia
CGK/DPS→Indonesia
MNL/CEB→Philippines
SGN/HAN→Vietnam
BOM/DEL/MAA/BLR/HYD/CCU→India
KHI/LHE/ISB→Pakistan
DAC→Bangladesh
CMB→Sri Lanka
SYD/MEL/BNE/PER/ADL→Australia
AKL/CHC/WLG→New Zealand
YYZ/YUL/YVR/YYC/YEG/YOW→Canada
MEX/GDL/MTY→Mexico
CUN/SJD/PVR/ZLO→Mexico
GRU/GIG/CGH/BSB/SSA/FOR→Brazil
EZE/AEP→Argentina
SCL→Chile
BOG→Colombia
LIM→Peru
UIO→Ecuador
PTY→Panama
SJO→Costa Rica
GUA→Guatemala
HAV→Cuba
MBJ/KIN→Jamaica
NAS→Bahamas"""

EXTRACT_PROMPT = f"""You extract flight booking data for USCIS N-400 travel records.

{DESTINATION_COUNTRY_HINTS}

Extract all fields from the email. Input may be HTML-stripped with pipe-separated table rows.
Pipe rows like "TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024" — read as: flight | origin | destination | date.

Fields to extract per trip:
- departure_date, return_date: YYYY-MM-DD (null if absent)
- destination_country: non-US country (use IATA hints above; "United States" only if truly domestic)
- origin_country: derive from origin airport IATA using the hints block above; default to "United States" only when origin IATA is absent or maps to US
- airline, confirmation_number, passenger_name
- flight_number: normalize to "TK 1" format (carrier + space + digits)
- aircraft_type: e.g. "Boeing 777-300ER" (null if not mentioned)
- confidence: "high" if departure_date+destination_country both non-null, else "low"
- trip_type: "round-trip" if return date present, "one-way" if stated, else null

Multi-leg itineraries: emit one trip object per leg. Each leg's origin_country is derived from its own origin IATA — the destination of the previous leg becomes the origin of the next leg. Never merge legs into a single trip object.

--- EXAMPLE 1: Turkish Airlines round-trip ---
Input: Booking Ref ABCDEF / Passenger: John Smith / TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024 | 09:00 / TK 2 | New York (JFK) | Istanbul (IST) | 28 Mar 2024
Output: {{"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{{"departure_date":"2024-03-14","return_date":"2024-03-28","trip_type":"round-trip","origin_country":"United States","destination_country":"Turkey","airline":"Turkish Airlines","flight_number":"TK 1","aircraft_type":null,"confirmation_number":"ABCDEF","passenger_name":"John Smith","confidence":"high"}}]}}

--- EXAMPLE 2: Emirates one-way ---
Input: Emirates booking EK 201 / Confirmation: XYZ789 / New York (JFK) to Dubai (DXB) / Departure: 05 Apr 2024
Output: {{"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{{"departure_date":"2024-04-05","return_date":null,"trip_type":"one-way","origin_country":"United States","destination_country":"United Arab Emirates","airline":"Emirates","flight_number":"EK 201","aircraft_type":null,"confirmation_number":"XYZ789","passenger_name":null,"confidence":"high"}}]}}

--- EXAMPLE 3: Multi-city itinerary ---
Input: PNR: MULTI1 / Leg 1: JFK→CDG AF 007 Mar 10 2024 / Leg 2: CDG→FRA LH 1234 Mar 15 / Leg 3: FRA→JFK LH 400 Mar 20
Output: {{"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{{"departure_date":"2024-03-10","return_date":null,"trip_type":"one-way","origin_country":"United States","destination_country":"France","airline":"Air France","flight_number":"AF 007","aircraft_type":null,"confirmation_number":"MULTI1","passenger_name":null,"confidence":"high"}},{{"departure_date":"2024-03-15","return_date":null,"trip_type":"one-way","origin_country":"France","destination_country":"Germany","airline":"Lufthansa","flight_number":"LH 1234","aircraft_type":null,"confirmation_number":"MULTI1","passenger_name":null,"confidence":"high"}},{{"departure_date":"2024-03-20","return_date":null,"trip_type":"one-way","origin_country":"Germany","destination_country":"United States","airline":"Lufthansa","flight_number":"LH 400","aircraft_type":null,"confirmation_number":"MULTI1","passenger_name":null,"confidence":"high"}}]}}

--- EXAMPLE 4: Non-English (Turkish) ---
Input: Rezervasyon Kodu: ABC123 / Yolcu: Mehmet Yilmaz / TK 789 | Istanbul (IST) | Frankfurt (FRA) | 20 Mart 2024
Output: {{"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{{"departure_date":"2024-03-20","return_date":null,"trip_type":"one-way","origin_country":"Turkey","destination_country":"Germany","airline":"Turkish Airlines","flight_number":"TK 789","aircraft_type":null,"confirmation_number":"ABC123","passenger_name":"Mehmet Yilmaz","confidence":"high"}}]}}

--- EXAMPLE 5: Forwarded email with noise ---
Input: ----Forwarded Message---- From: noreply@aa.com / Your trip / AA 100 | Miami (MIA) | London (LHR) | Jun 15 2024 / Booking ref: LMN456 / Dear Sarah Johnson
Output: {{"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{{"departure_date":"2024-06-15","return_date":null,"trip_type":"one-way","origin_country":"United States","destination_country":"United Kingdom","airline":"American Airlines","flight_number":"AA 100","aircraft_type":null,"confirmation_number":"LMN456","passenger_name":"Sarah Johnson","confidence":"high"}}]}}

--- EXAMPLE 6: Date in unusual position ---
Input: Dear Traveler, Your flight is confirmed. Please arrive 2 hours early. [lots of legal text] Flight: QR 701 Doha (DOH) to New York (JFK) Booking: QR99X Date of Departure: 2024-08-12
Output: {{"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{{"departure_date":"2024-08-12","return_date":null,"trip_type":"one-way","origin_country":"Qatar","destination_country":"United States","airline":"Qatar Airways","flight_number":"QR 701","aircraft_type":null,"confirmation_number":"QR99X","passenger_name":null,"confidence":"high"}}]}}

Respond with JSON only. Always set is_confirmed_flight_booking. If not a flight booking, set it false with rejection_reason and empty trips array."""

VERIFY_PROMPT = """You are fixing an incomplete flight extraction. Find the missing fields in the email.

The extraction below has null values. Search the email carefully — the date or country may be:
- In an unusual position (bottom of email, after legal text)
- In a different format ("15th of March" not "Mar 15")
- Encoded as IATA code (use the country hints in your knowledge)
- Spread across multiple lines

Return the same JSON structure with the null fields filled in if found, or unchanged if truly absent.
Also set "_verified": true in your response to indicate this was a verify pass.

Respond with JSON only."""


class RateLimitError(Exception):
    pass


class ProviderError(Exception):
    pass


# ── Retry wrapper ─────────────────────────────────────────────────────────────

async def _with_retry(provider_fn, provider_name: str):
    for attempt in range(MAX_RETRIES):
        try:
            return await provider_fn()
        except RateLimitError:
            if attempt < MAX_RETRIES - 1:
                wait = BASE_BACKOFF * (2 ** attempt)
                logger.info("[%s] rate limited, retrying in %.0fs (attempt %d/%d)",
                            provider_name, wait, attempt + 1, MAX_RETRIES)
                await asyncio.sleep(wait)
            else:
                logger.warning("[%s] rate limited after %d attempts", provider_name, MAX_RETRIES)
                raise
        except ProviderError as e:
            logger.warning("[%s] provider error: %s", provider_name, e)
            raise


# ── Response parser ───────────────────────────────────────────────────────────

def _parse_json_response(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"trips": []}


# ── Provider: Anthropic Claude ───────────────────────────────────────────────

_CONFIDENCE_FIELD = {
    "type": "string",
    "enum": ["high", "medium", "low"],
    "description": "Confidence in the extracted value",
}

_TRIP_TOOL = {
    "name": "record_trips",
    "description": "Output flight booking classification and extracted trips.",
    "input_schema": {
        "type": "object",
        "required": ["is_confirmed_flight_booking", "trips"],
        "properties": {
            "is_confirmed_flight_booking": {"type": "boolean"},
            "rejection_reason": {
                "type": ["string", "null"],
                "enum": [
                    "price-alert", "hotel-only", "car-only",
                    "loyalty-statement", "newsletter", "boarding-pass",
                    "voucher-credit", "seat-upgrade", "check-in-reminder",
                    None,
                ],
            },
            "trips": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["departure_date", "destination_country", "confidence"],
                    "properties": {
                        "departure_date":      {"type": ["string", "null"]},
                        "return_date":         {"type": ["string", "null"]},
                        "trip_type":           {"type": ["string", "null"], "enum": ["round-trip", "one-way", None]},
                        "origin_country":      {"type": ["string", "null"]},
                        "destination_country": {"type": ["string", "null"]},
                        "airline":             {"type": ["string", "null"]},
                        "flight_number":       {"type": ["string", "null"]},
                        "aircraft_type":       {"type": ["string", "null"]},
                        "confirmation_number": {"type": ["string", "null"]},
                        "passenger_name":      {"type": ["string", "null"]},
                        "confidence":          _CONFIDENCE_FIELD,
                        "field_confidence": {
                            "type": "object",
                            "description": "Per-field confidence scores",
                            "properties": {
                                "departure_date":      _CONFIDENCE_FIELD,
                                "destination_country": _CONFIDENCE_FIELD,
                                "flight_number":       _CONFIDENCE_FIELD,
                            },
                        },
                    },
                },
            },
        },
    },
}


async def _call_claude(text: str, model: str = "claude-haiku-4-5-20251001", system_prompt: str = None) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ProviderError("ANTHROPIC_API_KEY not set")

    prompt = system_prompt or EXTRACT_PROMPT

    async def _call():
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 1024,
                    "temperature": 0,
                    "system": prompt,
                    "tools": [_TRIP_TOOL],
                    "tool_choice": {"type": "tool", "name": "record_trips"},
                    "messages": [
                        {"role": "user", "content": f"Extract all trips from this email:\n\n{text}"},
                    ],
                },
            )
        if res.status_code == 429:
            raise RateLimitError()
        if not res.is_success:
            raise ProviderError(f"Claude HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        for block in data.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == "record_trips":
                return block["input"]
        return {"trips": []}

    result = await _with_retry(_call, f"claude-{model}")
    result["_provider"] = model
    return result


# ── Provider: Google Gemini ───────────────────────────────────────────────────

async def _call_gemini(text: str, system_prompt: str = None) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ProviderError("GEMINI_API_KEY not set")

    prompt = system_prompt or EXTRACT_PROMPT
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent"
    )
    payload = {
        "system_instruction": {"parts": [{"text": prompt}]},
        "contents": [{"parts": [{"text": f"Extract all trips from this email:\n\n{text}"}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 1024,
            "temperature": 0.1,
        },
    }

    async def _call():
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                url, json=payload,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            )
        if res.status_code == 429:
            raise RateLimitError()
        if not res.is_success:
            raise ProviderError(f"Gemini HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        raw = data["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_json_response(raw)

    result = await _with_retry(_call, "gemini")
    result["_provider"] = "gemini-2.5-flash"
    return result


# ── Provider: Groq ────────────────────────────────────────────────────────────

async def _call_groq(text: str, system_prompt: str = None) -> dict:
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ProviderError("GROQ_API_KEY not set")

    prompt = system_prompt or EXTRACT_PROMPT

    async def _call():
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": f"Extract all trips from this email:\n\n{text}"},
                    ],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 1024,
                    "temperature": 0.1,
                },
            )
        if res.status_code == 429:
            raise RateLimitError()
        if not res.is_success:
            raise ProviderError(f"Groq HTTP {res.status_code}: {res.text[:200]}")
        raw = res.json()["choices"][0]["message"]["content"]
        return _parse_json_response(raw)

    result = await _with_retry(_call, "groq")
    result["_provider"] = "groq-llama-3.3-70b"
    return result


# ── Provider: OpenRouter ──────────────────────────────────────────────────────

async def _call_openrouter(text: str, system_prompt: str = None) -> dict:
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        raise ProviderError("OPENROUTER_API_KEY not set")

    prompt = system_prompt or EXTRACT_PROMPT

    async def _call():
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://triptrace.app",
                    "X-Title": "TripTrace",
                },
                json={
                    "model": "meta-llama/llama-3.3-70b-instruct:free",
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": f"Extract all trips from this email:\n\n{text}"},
                    ],
                    "max_tokens": 1024,
                },
            )
        if res.status_code == 429:
            raise RateLimitError()
        if res.status_code == 402:
            raise ProviderError("OpenRouter out of credits")
        if not res.is_success:
            raise ProviderError(f"OpenRouter HTTP {res.status_code}: {res.text[:200]}")
        raw = res.json()["choices"][0]["message"]["content"]
        return _parse_json_response(raw)

    result = await _with_retry(_call, "openrouter")
    result["_provider"] = "openrouter-llama-3.3-70b"
    return result


# ── Stage 1: Classify ─────────────────────────────────────────────────────────

def _normalise_classify_result(result: dict) -> dict:
    """Coerce any provider response into the classify schema {is_flight, confidence, rejection_reason}."""
    if "is_flight" in result:
        return result
    # Provider returned extraction schema instead — map it
    if "is_confirmed_flight_booking" in result:
        is_flight = result.get("is_confirmed_flight_booking", True)
        return {
            "is_flight": bool(is_flight),
            "confidence": "certain" if not is_flight else "uncertain",
            "rejection_reason": result.get("rejection_reason"),
        }
    return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}


async def _classify_with_gemini(compressed_text: str) -> dict:
    """Call Gemini Flash with CLASSIFY_PROMPT and return normalised classify result."""
    result = await _call_gemini(compressed_text, system_prompt=CLASSIFY_PROMPT)
    return _normalise_classify_result(result)


async def _classify_with_haiku(compressed_text: str) -> dict:
    """
    Call Claude Haiku without tool_use — plain text output parsed as JSON.
    Used as the second classifier when Gemini returns uncertain.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ProviderError("ANTHROPIC_API_KEY not set")

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 128,
                "temperature": 0,
                "system": CLASSIFY_PROMPT,
                "messages": [{"role": "user", "content": compressed_text}],
            },
        )
    if res.status_code == 429:
        raise RateLimitError()
    if not res.is_success:
        raise ProviderError(f"Haiku classify HTTP {res.status_code}")
    raw = res.json()["content"][0]["text"]
    result = _parse_json_response(raw)
    return _normalise_classify_result(result)


async def classify_email(compressed_text: str) -> dict:
    """
    Stage 1: Dual-classifier ensemble for yes/no classification.

    Gate logic:
    1. Gemini Flash (primary, cheap) — if certain either way, trust it immediately.
    2. If Gemini is uncertain, call Claude Haiku for a second opinion.
       - Either says is_flight=True  → pass through (uncertain)
       - Both false + Haiku certain  → drop (both classifiers agree, certain=false)
       - Both false + Haiku uncertain→ pass through (safety: never drop on doubt)
    3. Any Gemini error              → return uncertain-true (never lose real flights).

    Returns {is_flight: bool, confidence: "certain"|"uncertain", rejection_reason: str|None}.
    """
    # Step 1 — Gemini primary
    try:
        gemini = await _classify_with_gemini(compressed_text)
    except Exception as e:
        logger.warning("Gemini classify failed, defaulting to uncertain: %s", e)
        return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}

    # Certain on either side — trust Gemini immediately, no second call
    if gemini.get("confidence") == "certain":
        return gemini

    # Step 2 — Haiku tiebreaker (Gemini was uncertain)
    try:
        haiku = await _classify_with_haiku(compressed_text)
    except Exception as e:
        logger.info("Haiku classify failed, safety pass-through: %s", e)
        return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}

    # If either classifier says it's a flight, always pass through
    if gemini.get("is_flight") or haiku.get("is_flight"):
        return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}

    # Both say false — only drop when Haiku is also certain
    if haiku.get("confidence") == "certain":
        return {
            "is_flight": False,
            "confidence": "certain",
            "rejection_reason": haiku.get("rejection_reason") or gemini.get("rejection_reason"),
        }

    # Both uncertain-false → safety pass-through
    return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}


# ── Stage 2: Extract ──────────────────────────────────────────────────────────

async def _extract_email_inner(full_text: str) -> dict:
    """
    Provider waterfall for extraction on the full email body.

    Primary:  Claude Sonnet — justified because the classifier already gated
              most non-flights, so Sonnet only runs on confirmed/uncertain emails.
    Fallbacks: Gemini → Groq → OpenRouter
    """
    capped = full_text[:15000]
    errors = []

    def _is_high_confidence(result: dict) -> bool:
        trips = result.get("trips", [])
        return bool(trips) and all(t.get("confidence") == "high" for t in trips)

    # Claude Sonnet primary (tool_use guarantees JSON schema)
    try:
        result = await _call_claude(capped, model="claude-sonnet-4-6", system_prompt=EXTRACT_PROMPT)
        if result.get("is_confirmed_flight_booking") is not None:
            return result
    except (ProviderError, RateLimitError) as e:
        errors.append(f"sonnet: {e}")

    # Gemini fallback
    try:
        result = await _call_gemini(capped, system_prompt=EXTRACT_PROMPT)
        if result.get("is_confirmed_flight_booking") is False or _is_high_confidence(result):
            return result
    except (ProviderError, RateLimitError) as e:
        errors.append(f"gemini: {e}")

    # Groq fallback
    try:
        result = await _call_groq(capped, system_prompt=EXTRACT_PROMPT)
        if result.get("is_confirmed_flight_booking") is False or _is_high_confidence(result):
            return result
    except (ProviderError, RateLimitError) as e:
        errors.append(f"groq: {e}")

    # OpenRouter last resort
    try:
        return await _call_openrouter(capped, system_prompt=EXTRACT_PROMPT)
    except Exception as e:
        errors.append(f"openrouter: {e}")

    raise RuntimeError(
        "All AI providers rate-limited or unavailable — wait a minute and try again. "
        f"Details: {'; '.join(errors)}"
    )


# ── Date sanity check ────────────────────────────────────────────────────────

def _date_sanity_check(trip: dict) -> dict:
    """Null out departure_date values that fall outside a plausible window.

    Valid window: (today - 10 years) to (today + 2 years).
    Malformed strings are also nulled.  Sets _needs_review=True on failure.
    Pre-existing null departure_date is left untouched (no flag set).
    """
    from datetime import date
    raw = trip.get("departure_date")
    if raw is None:
        return trip
    try:
        d = date.fromisoformat(raw)
    except (ValueError, TypeError):
        trip = dict(trip, departure_date=None, _needs_review=True)
        return trip
    today = date.today()
    lo = today.replace(year=today.year - 10)
    hi = today.replace(year=today.year + 2)
    if d < lo or d > hi:
        trip = dict(trip, departure_date=None, _needs_review=True)
    return trip


# ── Stage 3: Verify ───────────────────────────────────────────────────────────

async def _verify_extraction(trip: dict, full_text: str) -> dict:
    """
    Stage 3: When departure_date or destination_country is null, run a verify pass.
    Uses Claude Sonnet with the full body for maximum accuracy.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return trip  # skip verify if no Claude key

    incomplete = {k: v for k, v in trip.items() if not k.startswith("_")}
    user_msg = (
        f"Incomplete extraction:\n{json.dumps(incomplete, indent=2)}\n\n"
        f"Full email:\n{full_text[:12000]}\n\n"
        "Fill in any null fields you can find. Return the complete trip JSON with _verified: true."
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 512,
                    "temperature": 0,
                    "system": VERIFY_PROMPT + "\n\n" + DESTINATION_COUNTRY_HINTS,
                    "messages": [{"role": "user", "content": user_msg}],
                },
            )
        if not res.is_success:
            return trip
        raw = res.json()["content"][0]["text"]
        verified = _parse_json_response(raw)
        if isinstance(verified, dict) and ("departure_date" in verified or "destination_country" in verified):
            merged = {**trip, **{k: v for k, v in verified.items() if v is not None}}
            merged["_verified"] = True
            return merged
    except Exception as e:
        logger.warning("verify_extraction failed: %s", e)

    return trip


# ── Public interface ──────────────────────────────────────────────────────────

async def extract_trips(email_text: str, tier: str = "free") -> dict:
    """
    Two-stage pipeline:
    1. Classify (Gemini Flash, compressed) — skip extraction if certain non-flight
    2. Extract (provider waterfall, full body up to 15k chars)
    3. Verify (Claude Sonnet) if null fields remain
    """
    compressed = extract_relevant_lines(email_text)
    logger.debug("Compressed email from %d→%d chars", len(email_text), len(compressed))

    # Stage 1: classify
    classification = await classify_email(compressed)
    if not classification.get("is_flight") and classification.get("confidence") == "certain":
        logger.info("Stage 1 rejected email: %s", classification.get("rejection_reason"))
        return {
            "is_confirmed_flight_booking": False,
            "rejection_reason": classification.get("rejection_reason"),
            "trips": [],
            "_provider": "gemini-2.5-flash",
        }

    # Stage 2: extract (full body)
    result = await _extract_email_inner(email_text)

    # Stage 3: verify if any primary fields are null
    trips = result.get("trips", [])
    if trips and result.get("is_confirmed_flight_booking") is not False:
        verified_trips = []
        for trip in trips:
            fc = trip.get("field_confidence", {})
            needs_verify = (
                not trip.get("departure_date")
                or not trip.get("destination_country")
                or fc.get("departure_date", "high") != "high"
                or fc.get("destination_country", "high") != "high"
            )
            if needs_verify:
                trip = await _verify_extraction(trip, email_text)
                # Update confidence after verify
                if trip.get("departure_date") and trip.get("destination_country"):
                    trip["confidence"] = "high"
            trip = _date_sanity_check(trip)
            if not trip.get("departure_date") or not trip.get("destination_country"):
                trip = dict(trip, _needs_review=True)
            verified_trips.append(trip)
        result["trips"] = verified_trips
        if any(t.get("_verified") for t in verified_trips):
            result["_verified"] = True

    return result

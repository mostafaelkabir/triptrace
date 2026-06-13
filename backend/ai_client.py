"""
Multi-provider AI client for trip extraction.

Provider waterfall (in priority order):
  1. Claude Haiku (claude-haiku-4-5-20251001) — highest accuracy, tool_use for forced JSON schema
     Auto-escalates to Claude Sonnet (claude-sonnet-4-6) when Haiku returns all-low-confidence
  2. Gemini 2.5 Flash        — free tier fallback: 15 RPM, native JSON schema
  3. Groq llama-3.3-70b      — fast inference fallback: 1,000 RPD, JSON mode
  4. OpenRouter               — last resort: 200 RPD, many free models

Each provider is skipped if its API key is not set.
Within each provider, up to MAX_RETRIES attempts with exponential backoff on 429.
"""

import asyncio
import json
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

MAX_RETRIES = 3          # per provider before giving up and trying the next
BASE_BACKOFF = 1.0       # seconds — doubles each attempt: 1s, 2s, 4s

# ── Relevant-line pre-extraction ──────────────────────────────────────────────

_SIGNAL_PATTERNS = [
    re.compile(r'\b[A-Z]{2}\s?\d{1,4}\b'),                          # flight numbers
    re.compile(r'\([A-Z]{3}\)'),                                     # IATA in parens
    re.compile(r'\b[A-Z]{3}\s*[→\-–>]\s*[A-Z]{3}\b'),          # IATA→IATA
    re.compile(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}', re.I),
    re.compile(r'\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)', re.I),
    re.compile(r'\b20[2-9]\d[-/.]\d{1,2}[-/.]\d{1,2}\b'),           # ISO dates
    re.compile(r'\bpnr\b|\bconfirmation\b|\bbooking\s*(?:ref|number|code)\b|\brecord\s+locator\b', re.I),
    re.compile(r'\bpassenger\b|\btravell?er\b|\bdear\s+[A-Z]', re.I),
    re.compile(r'\bdepart(?:ure|ing|s)?\b|\barriv(?:al|es?)?\b|\bboarding\b', re.I),
    re.compile(r'\baircraft\b|\bequipment\b|\bBoeing\b|\bAirbus\b', re.I),
    re.compile(r'\bitinerary\b|\be-?ticket\b', re.I),
    re.compile(r'\|'),                                               # pipe-separated table rows
]


def extract_relevant_lines(text: str, max_lines: int = 60) -> str:
    """Return only lines likely to contain flight booking data (~400 tokens max)."""
    relevant = [
        line.strip() for line in text.split('\n')
        if len(line.strip()) >= 4 and any(p.search(line.strip()) for p in _SIGNAL_PATTERNS)
    ]
    return '\n'.join(relevant[:max_lines]) if relevant else text[:2000]


SYSTEM_PROMPT = """You are a flight booking extractor for USCIS N-400 travel records.

STEP 1 — CLASSIFY: Is this a CONFIRMED FLIGHT BOOKING?
YES if: has flight number (e.g. TK 1) OR IATA airport codes (JFK, IST) + a booking reference + a departure date.
NO (return is_confirmed_flight_booking:false) if: flight credit/voucher, price alert/deal email, hotel-only, car-only, loyalty points statement, gate change/delay, boarding pass, baggage fee receipt, unsubscribe/newsletter.

STEP 2 — EXTRACT (only if YES):
Input may be messy HTML-stripped email with pipe-separated table rows — extract anyway.
- departure_date, return_date: YYYY-MM-DD
- destination_country: non-US country visited (you know geography — IST=Turkey, DXB=UAE, LHR=UK, DOH=Qatar, etc.)
- origin_country: almost always "United States"
- airline, confirmation_number, passenger_name: extract from email context
- flight_number: normalize to "TK 1" format (carrier code + space + digits; "TK1"→"TK 1")
- aircraft_type: e.g. "Boeing 777-300ER", null if not mentioned
- confidence: "high" if departure_date+destination_country both found, else "low"
- trip_type: "round-trip" if return date present, "one-way" if stated, else null

Pipe-separated lines are table rows: "TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024" — read each field as flight data.

--- EXAMPLE 1: Turkish Airlines confirmation (ACCEPT) ---
Input: Booking Confirmation PNR ABCDEF / Passenger: John Smith / TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024 | Boeing 777-300ER / TK 2 | New York (JFK) | Istanbul (IST) | 28 Mar 2024
Output: {"is_confirmed_flight_booking":true,"rejection_reason":null,"trips":[{"departure_date":"2024-03-14","return_date":"2024-03-28","trip_type":"round-trip","origin_country":"United States","destination_country":"Turkey","airline":"Turkish Airlines","flight_number":"TK 1","aircraft_type":"Boeing 777-300ER","confirmation_number":"ABCDEF","passenger_name":"John Smith","confidence":"high"}]}

--- EXAMPLE 2: Price alert (REJECT) ---
Input: Price alert: New York to Istanbul / Prices have dropped! Flights from $420 / Book now on Google Flights
Output: {"is_confirmed_flight_booking":false,"rejection_reason":"price alert","trips":[]}
"""

USER_PROMPT = "Extract all trips from this email:\n\n{text}"


class RateLimitError(Exception):
    pass


class ProviderError(Exception):
    pass


# ── Retry wrapper ─────────────────────────────────────────────────────────────

async def _with_retry(provider_fn, provider_name: str):
    """Run provider_fn up to MAX_RETRIES times, backing off on 429."""
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


# ── Response parser (shared) ──────────────────────────────────────────────────

def _parse_json_response(raw: str) -> dict:
    """Strip markdown fences and parse the JSON response from any provider."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"trips": []}


# ── Provider: Anthropic Claude ───────────────────────────────────────────────

# JSON schema enforced via tool_use — guarantees schema compliance without post-processing.
_TRIP_TOOL = {
    "name": "record_trips",
    "description": "Output flight booking classification and extracted trips.",
    "input_schema": {
        "type": "object",
        "required": ["is_confirmed_flight_booking", "rejection_reason", "trips"],
        "properties": {
            "is_confirmed_flight_booking": {"type": "boolean"},
            "rejection_reason":            {"type": ["string", "null"]},
            "trips": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["departure_date", "destination_country", "confidence"],
                    "properties": {
                        "departure_date":      {"type": ["string", "null"]},
                        "return_date":         {"type": ["string", "null"]},
                        "trip_type":           {"type": ["string", "null"]},
                        "origin_country":      {"type": ["string", "null"]},
                        "destination_country": {"type": ["string", "null"]},
                        "airline":             {"type": ["string", "null"]},
                        "flight_number":       {"type": ["string", "null"]},
                        "aircraft_type":       {"type": ["string", "null"]},
                        "confirmation_number": {"type": ["string", "null"]},
                        "passenger_name":      {"type": ["string", "null"]},
                        "confidence":          {"type": "string", "enum": ["high", "low"]},
                    },
                },
            },
        },
    },
}


async def _call_claude(text: str, model: str = "claude-haiku-4-5-20251001") -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ProviderError("ANTHROPIC_API_KEY not set")

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
                    "system": SYSTEM_PROMPT,
                    "tools": [_TRIP_TOOL],
                    "tool_choice": {"type": "tool", "name": "record_trips"},
                    "messages": [
                        {"role": "user", "content": USER_PROMPT.format(text=text)},
                    ],
                },
            )
        if res.status_code == 429:
            raise RateLimitError()
        if not res.is_success:
            raise ProviderError(f"Claude HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        # tool_use response: content[0].type == "tool_use", content[0].input is the parsed dict
        for block in data.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == "record_trips":
                return block["input"]
        return {"trips": []}

    result = await _with_retry(_call, f"claude-{model}")
    result["_provider"] = model
    return result


# ── Provider: Google Gemini ───────────────────────────────────────────────────

async def _call_gemini(text: str) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ProviderError("GEMINI_API_KEY not set")

    # google-genai SDK is sync; use httpx directly to stay async
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent"
        f"?key={api_key}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": USER_PROMPT.format(text=text)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 1024,
            "temperature": 0.1,
        },
    }

    async def _call():
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, json=payload)
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

async def _call_groq(text: str) -> dict:
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ProviderError("GROQ_API_KEY not set")

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
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": USER_PROMPT.format(text=text)},
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

async def _call_openrouter(text: str) -> dict:
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        raise ProviderError("OPENROUTER_API_KEY not set")

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
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": USER_PROMPT.format(text=text)},
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


# ── Public interface ──────────────────────────────────────────────────────────

async def extract_trips(email_text: str, tier: str = "free") -> dict:
    """
    Tiered routing: Gemini free → Groq free → Claude Haiku (paid, stubborn only).

    Free-tier results are accepted when the provider gives a definitive rejection
    (is_confirmed_flight_booking: false) or all trips are high-confidence.
    Low-confidence or empty results escalate to the next tier.
    """
    compressed = extract_relevant_lines(email_text)
    logger.debug("Compressed email from %d→%d chars", len(email_text), len(compressed))
    errors = []

    def _is_high_confidence(result: dict) -> bool:
        trips = result.get("trips", [])
        return bool(trips) and all(t.get("confidence") == "high" for t in trips)

    # ── Tier 1: Gemini Flash (free, 15 RPM) ──────────────────────────────────
    try:
        result = await _call_gemini(compressed)
        if result.get("is_confirmed_flight_booking") is False or _is_high_confidence(result):
            return result
        # Low-confidence or empty — escalate
    except (ProviderError, RateLimitError) as e:
        errors.append(f"gemini: {e}")
    except Exception as e:
        errors.append(f"gemini: {e}")

    # ── Tier 2: Groq llama-3.3-70b (free, 14,400 RPD) ────────────────────────
    try:
        result = await _call_groq(compressed)
        if result.get("is_confirmed_flight_booking") is False or _is_high_confidence(result):
            return result
    except (ProviderError, RateLimitError) as e:
        errors.append(f"groq: {e}")
    except Exception as e:
        errors.append(f"groq: {e}")

    # ── Tier 3: Claude Haiku (paid — only stubborn/escalation cases) ──────────
    try:
        result = await _call_claude(compressed, model="claude-haiku-4-5-20251001")
        trips = result.get("trips", [])
        # Escalate to Sonnet only when Haiku returns empty AND not a clear rejection
        if not trips and result.get("is_confirmed_flight_booking") is not False:
            try:
                sonnet = await _call_claude(compressed, model="claude-sonnet-4-6")
                if sonnet.get("trips"):
                    return sonnet
            except Exception as esc_err:
                logger.info("Sonnet escalation skipped: %s", esc_err)
        return result
    except (ProviderError, RateLimitError) as e:
        errors.append(f"claude: {e}")
    except Exception as e:
        errors.append(f"claude: {e}")

    # ── Last resort: OpenRouter ───────────────────────────────────────────────
    try:
        return await _call_openrouter(compressed)
    except Exception as e:
        errors.append(f"openrouter: {e}")

    raise RuntimeError(
        "All AI providers rate-limited or unavailable — wait a minute and try again. "
        f"Details: {'; '.join(errors)}"
    )

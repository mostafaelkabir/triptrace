# TripTrace — AI Extraction Engine Spec

## Goal

Near-100% accuracy extracting confirmed flight bookings from email, at ≤ **$0.10 per user scanning 1,000 emails**.

---

## Current State & Problems

### What works
- 12 regex parsers (Turkish Airlines, Lufthansa, United, Delta, American, Emirates, Air France, British Airways, Expedia, Kayak, Google Flights, Booking.com)
- `looksLikeConfirmation()` pre-filter with hard-rejects for credits/alerts/hotels
- Claude Haiku via `tool_use` for forced JSON schema output
- Two-stage prompt: classify first, then extract
- `preserveTableRows()` preprocessing for HTML table emails

### The cost problem

Current cost per AI call:
- System prompt: ~2,400 tokens (massive IATA tables + 5 examples)
- Tool schema: ~400 tokens  
- Email body: ~2,000 tokens (8K chars / 4)
- Output: ~200 tokens
- **Total: ~4,800 input tokens → $0.0046/call (Haiku)**

If 30% of 1,000 emails hit AI → 300 × $0.0046 = **$1.38** — 13× over budget.

### The accuracy problem

1. **Regex parsers miss fields**: `destinationIATA` regex fails on non-standard email layouts → `destination_country: null` → confidence "low" → goes to AI anyway
2. **System prompt is too long**: IATA tables and city tables Claude already knows are wasted tokens
3. **Email body is too long**: 8,000 chars sent verbatim; AI drowns in untracked link URLs, header boilerplate, footer legalese — only ~500 chars actually contain flight data
4. **No subject-line pre-filter**: Subject alone can identify 80% of false positives before body is fetched (saving the API call for body retrieval)
5. **No flight-number extraction in regex parsers**: Parsers don't extract `flight_number` or `aircraft_type` — always null, can't be filled without AI

---

## Target Architecture

### Budget math

| Layer | Emails handled | Cost |
|---|---|---|
| Layer 1: Regex parsers (known domains) | ~65% → 650 emails | $0 |
| Layer 2: Subject-line hard-reject | ~10% → 100 emails | $0 |
| Layer 3: Gemini 2.5 Flash (free tier) | ~15% → 150 emails | $0 |
| Layer 4: Groq llama-3.3-70b (free tier) | ~7% → 70 emails | $0 |
| Layer 5: Claude Haiku (paid, stubborn cases only) | ~3% → 30 emails | 30 × $0.0012 = **$0.036** |
| **Total** | 1,000 emails | **~$0.04** |

With optimized token usage (compact prompt + pre-extracted lines):
- Compact system prompt: ~300 tokens (down from 2,400)
- Pre-extracted email lines: ~400 tokens (down from 2,000)
- Tool schema: ~250 tokens (simplified)
- Output: ~150 tokens
- **Per Haiku call: ~$0.0012** (down from $0.0046)

---

## Implementation Plan

### S1 — Subject-line pre-filter (before body fetch)

**Where:** `extension/src/scan.js`, between `getEmailHeaders()` and `getEmailBody()`

**What:** Check subject header alone for hard-reject patterns. If matched, skip body fetch entirely. This saves one API call per rejected email (Gmail/Outlook charges against quota per body fetch too).

```js
const SUBJECT_HARD_REJECTS = [
  /\bprice\s*(alert|drop|watch)\b/i,
  /\bfare\s*alert\b/i,
  /\bflight\s*credit\b/i,
  /\btravel\s*credit\b/i,
  /\bmiles?\s*(earned|credited|statement)\b/i,
  /\bpoints?\s*(earned|credited)\b/i,
  /\bgate\s*change\b/i,
  /\bflight\s*status\b/i,
  /\bdelay\s*notification\b/i,
  /\bboarding\s*pass\b/i,       // already boarded — not a new booking
  /\bcheck.?in\s*(open|reminder)\b/i,
  /\bbaggage\s*fee\b/i,
  /\bupgrade\s*confirmation\b/i, // seat upgrade only, not booking
  /\bunsubscribe\b/i,
];

export function subjectIsHardReject(subject) {
  return SUBJECT_HARD_REJECTS.some((re) => re.test(subject));
}
```

**Acceptance criteria:**
- Subject "Price Alert: NYC to Istanbul" → `subjectIsHardReject` returns true, body not fetched
- Subject "Your Flight Confirmation - PNR ABCDEF" → returns false, processing continues
- Subject "Gate Change Notice - TK 1" → returns true

---

### S2 — Regex parser coverage expansion

**Where:** `extension/src/parsers/` (new files + existing updates)

**Target airlines to add** (cover 90% of international travel from US):

| Airline | Domain | Priority |
|---|---|---|
| Southwest Airlines | southwest.com | High (domestic US) |
| JetBlue | jetblue.com, email.jetblue.com | High (domestic US) |
| Alaska Airlines | alaskaair.com, alaskaairlines.com | High (domestic US + international) |
| Qatar Airways | qatarairways.com | High (Middle East) |
| Etihad Airways | etihad.com | High (UAE) |
| Singapore Airlines | singaporeair.com | High (Asia) |
| Thai Airways | thaiairways.com | Medium |
| KLM | klm.com, email.klm.com | Medium (already partially via airFrance) |
| Swiss (SWISS) | swiss.com | Medium |
| Austrian Airlines | austrian.com | Medium |
| Pegasus | flypgs.com | Medium (Turkey) |
| SunExpress | sunexpress.com | Medium (Turkey charter) |
| Cheap OAir | cheapoair.com | High (OTA, source of many false positives — add to parse OR add to hard-reject) |
| Priceline | priceline.com | Medium (OTA) |
| Travelport/Sabre agent emails | — | Low |

**Fields to add to ALL parsers:**
```js
extractors: {
  ...existing,
  flightNumber: /\b([A-Z]{2})\s?(\d{1,4})\b/,  // capture carrier + number
  aircraftType: /(?:aircraft|equipment|operated\s+(?:by|on))[:\s]+([A-Za-z0-9\s\-]+(?:737|777|787|A3[0-9]{2}|A2[0-9]{2})[A-Za-z0-9\s\-]*)/i,
  passengerName: /(?:passenger|traveler|booked\s+for|dear)\s*[:\s]+([A-Z][a-z]+\s+[A-Z][A-Za-z]+)/i,
}
```

**Acceptance criteria:**
- Qatar Airways confirmation email → `airline: "Qatar Airways"`, `destination_country: "Qatar"`, `confidence: "high"`
- Southwest confirmation → `airline: "Southwest Airlines"`, `confidence: "high"`
- Regex hit rate increases from ~65% to ~80% of real flight emails

---

### S3 — Pre-extraction: send only relevant lines to AI

**Where:** `backend/ai_client.py`, new `extract_relevant_lines()` function called before any AI provider

**What:** Instead of sending 8,000 chars verbatim, extract only lines that contain flight-relevant signals. A real confirmation email has 20–50 relevant lines buried in 200+ lines of HTML cruft.

```python
import re

_RELEVANT_LINE_PATTERNS = [
    re.compile(r'\b[A-Z]{2}\s?\d{1,4}\b'),                    # flight numbers
    re.compile(r'\([A-Z]{3}\)'),                               # IATA in parens
    re.compile(r'\b[A-Z]{3}\s*[→\-–>]\s*[A-Z]{3}\b'),         # IATA → IATA
    re.compile(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}', re.I),
    re.compile(r'\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)', re.I),
    re.compile(r'\b20[2-9]\d[-/.]\d{1,2}[-/.]\d{1,2}\b'),     # ISO dates
    re.compile(r'\bpnr\b|\bconfirmation\b|\bbooking\s*(?:ref|number|code)\b|\brecord\s+locator\b', re.I),
    re.compile(r'\bpassenger\b|\btraveler\b|\bdear\s+[A-Z]', re.I),
    re.compile(r'\bdepart(?:ure|ing|s)?\b|\barriv(?:al|ing|es?)?\b|\bboarding\b', re.I),
    re.compile(r'\baircraft\b|\bequipment\b|\bBoeing\b|\bAirbus\b', re.I),
    re.compile(r'\bitinerary\b|\be-?ticket\b', re.I),
    re.compile(r'\|'),  # pipe-separated table rows from preserveTableRows()
]

def extract_relevant_lines(text: str, max_lines: int = 60) -> str:
    """Return only lines likely to contain flight booking data. ~400 tokens max."""
    lines = text.split('\n')
    relevant = []
    for line in lines:
        stripped = line.strip()
        if not stripped or len(stripped) < 4:
            continue
        if any(p.search(stripped) for p in _RELEVANT_LINE_PATTERNS):
            relevant.append(stripped)
        if len(relevant) >= max_lines:
            break
    return '\n'.join(relevant) if relevant else text[:2000]
```

**Token impact:**
- Before: avg 8,000 chars → ~2,000 tokens
- After: avg ~1,600 chars → ~400 tokens
- Saving: 1,600 tokens × $0.80/1M = **$0.00128 per call**
- Over 30 Haiku calls: saves $0.038

**Acceptance criteria:**
- Turkish Airlines HTML email (10,000 chars) → `extract_relevant_lines()` returns ≤60 lines containing flight number, IATA codes, dates, PNR
- The extracted lines contain all fields Claude needs to extract
- Pure marketing email → returns empty or near-empty (will be caught by pre-filter anyway)

---

### S4 — Compact system prompt (≤300 tokens)

**Where:** `backend/ai_client.py`, replace `SYSTEM_PROMPT`

**Current problem:** 2,400 tokens for IATA tables and city→country tables Claude already knows. These waste tokens and cost money.

**New compact prompt (~300 tokens):**

```
You are a flight booking extractor for USCIS N-400 travel records.

STEP 1 — CLASSIFY: Is this a CONFIRMED FLIGHT BOOKING?
YES if: has flight number (e.g. TK 1) OR IATA codes (JFK, IST) + a booking reference + a departure date.
NO (return is_confirmed_flight_booking:false) if: flight credit/voucher, price alert/deal email, hotel-only, car-only, loyalty points statement, gate change/delay, boarding pass, baggage fee receipt, unsubscribe email.

STEP 2 — EXTRACT (only if YES):
- departure_date, return_date: ISO YYYY-MM-DD
- destination_country: the non-US country visited (you know geography — IST=Turkey, DXB=UAE, LHR=UK, etc.)
- origin_country: almost always "United States"
- airline, flight_number (normalize: "TK1"→"TK 1"), aircraft_type, confirmation_number, passenger_name
- confidence: "high" if departure_date+destination_country both found, else "low"
- trip_type: "round-trip" if return date present, "one-way" if stated, else null
```

**Why this works:** Claude Haiku already knows that IST is Istanbul, Turkey; that DXB is Dubai, UAE; that LHR is London, UK. We don't need to teach it geography in the prompt. The IATA table in the old prompt was written for weaker models (Gemma-2-9b, llama). With Haiku/Gemini Flash, those tokens are pure waste.

**Token savings:** 2,400 → 300 tokens = **2,100 tokens saved per call**
- Over 30 Haiku calls: 2,100 × 30 × $0.80/1M = **$0.05 saved**

**Acceptance criteria:**
- `len(SYSTEM_PROMPT) // 4 < 350` (token estimate)
- Claude still correctly extracts Turkey from IST, UAE from DXB, UK from LHR
- Claude still rejects flight credits and price alerts

---

### S5 — Simplified tool schema (≤200 tokens)

**Where:** `backend/ai_client.py`, `_TRIP_TOOL`

**Current problem:** Full JSON Schema with descriptions on every field = ~400 tokens. Claude doesn't need descriptions to understand field names.

**Simplified schema (~200 tokens):**

```python
_TRIP_TOOL = {
    "name": "record_trips",
    "description": "Output flight booking classification and extracted trips.",
    "input_schema": {
        "type": "object",
        "required": ["is_confirmed_flight_booking", "rejection_reason", "trips"],
        "properties": {
            "is_confirmed_flight_booking": {"type": "boolean"},
            "rejection_reason": {"type": ["string", "null"]},
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
                        "confidence":          {"type": "string"}
                    }
                }
            }
        }
    }
}
```

**Token savings:** 400 → 200 tokens = **200 tokens per call**

---

### S6 — Regex parser: add flight_number + aircraft_type extraction

**Where:** All parser files + `engine.js`

**What:** Add `flightNumber` and `aircraftType` extractors to each parser so the AI doesn't need to be called for these fields on known senders.

```js
// In engine.js runPipeline():
const flightNumber = raw.flightNumber
  ? raw.flightNumber.replace(/([A-Z]{2})\s?(\d+)/, '$1 $2')  // normalize TK1 → TK 1
  : null;
const aircraftType = raw.aircraftType?.trim() ?? null;

return {
  ...existing fields,
  flight_number: flightNumber,
  aircraft_type: aircraftType,
};
```

**Acceptance criteria:**
- Turkish Airlines email with "Flight TK 1" → `flight_number: "TK 1"` from regex, no AI needed
- United email with "Aircraft: Boeing 737-800" → `aircraft_type: "Boeing 737-800"` from regex

---

### S7 — Tiered provider routing by confidence

**Where:** `backend/ai_client.py`, `extract_trips()`

**Current problem:** Every unmatched email goes to Claude Haiku immediately, even easy ones that Gemini Flash can handle.

**New routing logic:**

```python
async def extract_trips(email_text: str, tier: str = "free") -> dict:
    # Pre-process: extract only relevant lines
    compressed = extract_relevant_lines(email_text)
    
    # Tier 1: Gemini Flash (free, 15 RPM) — handles 80% of AI cases
    try:
        result = await _call_gemini(compressed)
        trips = result.get("trips", [])
        # Accept if high confidence or clearly rejected
        if result.get("is_confirmed_flight_booking") == False:
            return result  # definitive rejection, trust it
        if trips and all(t.get("confidence") == "high" for t in trips):
            return result  # high confidence extraction, done
        # Low confidence or empty → escalate to Groq
    except (ProviderError, RateLimitError):
        pass

    # Tier 2: Groq llama-3.3-70b (free, 14,400 RPD)
    try:
        result = await _call_groq(compressed)
        trips = result.get("trips", [])
        if result.get("is_confirmed_flight_booking") == False:
            return result
        if trips and all(t.get("confidence") == "high" for t in trips):
            return result
    except (ProviderError, RateLimitError):
        pass

    # Tier 3: Claude Haiku (paid, only for stubborn cases)
    # At this point: either both free tiers failed/rate-limited, or both returned low-confidence
    try:
        result = await _call_claude(compressed, model="claude-haiku-4-5-20251001")
        trips = result.get("trips", [])
        # Escalate to Sonnet only if Haiku returns empty (not low-confidence — Haiku is accurate enough)
        if not trips and result.get("is_confirmed_flight_booking") != False:
            sonnet = await _call_claude(compressed, model="claude-sonnet-4-6")
            if sonnet.get("trips"):
                return sonnet
        return result
    except (ProviderError, RateLimitError) as e:
        raise RuntimeError(f"All providers exhausted: {e}")
```

**Acceptance criteria:**
- Easy Turkish Airlines email (clean table rows) → handled by Gemini, Claude not called
- Ambiguous Expedia email (garbled HTML) → Gemini returns low-confidence → Groq called → if still low → Haiku called
- All-providers exhausted → 503 with clear error message

---

## Token Budget Summary (after all optimizations)

| Component | Before | After | Saving |
|---|---|---|---|
| System prompt | 2,400 tokens | 300 tokens | 2,100 |
| Tool schema | 400 tokens | 200 tokens | 200 |
| Email body sent | 2,000 tokens | 400 tokens | 1,600 |
| Output | 200 tokens | 150 tokens | 50 |
| **Total input** | **4,800 tokens** | **900 tokens** | **3,900 (81% reduction)** |
| **Haiku cost/call** | **$0.0046** | **$0.0009** | **80% cheaper** |

### Per-user cost for 1,000 emails (after all optimizations)

| Layer | Count | Cost |
|---|---|---|
| Regex parsers (80% hit rate) | 800 emails | $0 |
| Subject hard-reject (skipped) | 50 emails | $0 |
| Gemini free tier (AI, high-conf) | 120 emails | $0 |
| Groq free tier (AI, escalation) | 20 emails | $0 |
| Claude Haiku (stubborn cases) | 10 emails | 10 × $0.0009 = **$0.009** |
| **Total** | 1,000 emails | **~$0.01** |

**10× under the $0.10 budget.** The budget slack means the system can handle heavier users (more emails per scan) without blowing the budget.

---

## Accuracy Target

### Why near-100% is achievable

Real flight confirmation emails are highly structured. They always contain:
1. A booking/PNR reference (6-char alphanumeric or 11-digit OTA number)
2. A flight number (2-letter IATA code + 1–4 digits)
3. IATA airport codes in parentheses or plain
4. A specific departure date
5. A passenger name

This structure is machine-readable. An LLM with a clear schema and pre-extracted lines should hit >99% accuracy on genuine confirmations.

The remaining <1% are:
- Emails in languages other than English (rare for US-based filers)
- Heavily obfuscated HTML where body extraction itself fails (fix: improve `stripHtml`)
- Forwarded emails with mixed content (fix: Claude handles these well)

### False positive elimination

| Type | Layer that eliminates it |
|---|---|
| Price alerts / fare alerts | S1 subject filter + S4 Claude classification |
| Flight credits / vouchers | S1 subject filter + S4 Claude classification |
| Hotel-only bookings | `looksLikeConfirmation()` body filter + S4 Claude classification |
| Car-only rentals | `looksLikeConfirmation()` body filter + S4 Claude classification |
| Loyalty statements | S1 subject filter + `looksLikeConfirmation()` |
| Marketing emails | `looksLikeConfirmation()` promotional penalty |
| Gate changes / delays | S1 subject filter |

---

## Implementation Order

```
S4 (compact prompt)     → immediate cost reduction, no behavior change risk
S5 (simplified schema)  → 2-line change, further cost reduction
S3 (pre-extract lines)  → biggest single cost reduction (80% token cut)
S1 (subject pre-filter) → saves body-fetch API calls too
S7 (tiered routing)     → routes cheap emails to free tier, Claude only for hard cases
S6 (regex flight_num)   → improves coverage, reduces AI call rate
S2 (parser expansion)   → increases regex hit rate from 65% → 80%
```

S4 + S5 + S3 together bring the per-Haiku-call cost from $0.0046 to $0.0009. Do those first.

---

## What NOT to do

| Idea | Why not |
|---|---|
| Fine-tune a local model | Needs labeled dataset + GPU. Haiku already extracts correctly when given clean input. |
| Send full email to Claude every time | 4,800 tokens × $0.0046 = $4.60 per 1,000 emails |
| Use GPT-4o | More expensive than Haiku, same accuracy for structured extraction |
| Skip the free-tier providers | They handle 80%+ of AI cases for free — removing them 10× the cost |
| Keep the IATA tables in the prompt | Claude already knows geography. These are wasted tokens from when we used Gemma-2-9b. |

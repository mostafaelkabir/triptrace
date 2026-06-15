# Accuracy Plan — Near-Perfect Ticket Extraction

## Vision

100% recall on real flight confirmations, near-zero false positives,
and a human review queue that catches whatever the models miss.
The approach: tighten each gate so the most expensive model only
sees emails that are almost certainly real bookings.

---

## Architecture: The Four-Gate Pipeline

```
Email (raw)
  │
  ├─ [Gate 0 · Client · Free]
  │   Subject hard-reject + looksLikeConfirmation()
  │   → Certain non-flights dropped immediately, body never fetched
  │
  ├─ [Gate 1 · Client · Free]
  │   Regex parser (14 airlines + engine.js)
  │   → HIGH CONFIDENCE: all 3 fields populated → DONE, skip all LLM
  │   → LOW CONFIDENCE / UNMATCHED: continue to Gate 2
  │
  ├─ [Gate 2 · Backend · Cheap — Gemini Flash]
  │   LLM Classifier on compressed text (~400 tokens)
  │   → CERTAIN NON-FLIGHT: DROP (save Sonnet cost entirely)
  │   → UNCERTAIN or IS-FLIGHT: continue to Gate 3
  │
  ├─ [Gate 3 · Backend · Premium — Claude Sonnet primary]
  │   Structured extraction on full body
  │   → All fields with per-field confidence scores
  │   → If any field null or confidence < high → Gate 4
  │
  └─ [Gate 4 · Backend · Premium — Claude Sonnet verify]
      Targeted verify pass for null/low-confidence fields only
      → Returns completed trip + _verified flag
      → If still null after verify → NEEDS_REVIEW flag
          │
          └─ [Human Review Queue · UI]
              User sees "Needs Review" badge, inline snippet
              → Confirm / Edit / Delete
```

**Why this works economically:**
- A user's 5-year inbox has ~20,000 emails total
- Gate 0 (subject + body heuristics) drops ~85% → ~3,000 remaining
- Gate 1 (regex, high-confidence) resolves ~30% of those → ~2,100 go to LLM
- Gate 2 (Gemini classifier) drops ~70% → ~630 to Sonnet
- Sonnet extraction at ~$3/MTok input, average 2k tokens = ~$0.006/email × 630 = **~$4 per user scan**
- Paid tier ($4.99) covers costs; free tier (6-month scan) = ~$0.50

---

## Phase A — Regex Layer Fixes (no LLM cost)

### ACC-1: Forwarded email re-sender detection
**File:** `extension/src/parsers/engine.js`

When `findParser(fromHeader)` returns null, scan body for the standard Gmail
forward header (`From: noreply@thy.com`) and retry `findParser` on it.
This fixes the only failing eval fixture (`forwarded-with-noise`).

```js
function extractForwardedSender(text) {
  // Match "From: address@domain.com" in forwarded body headers
  const m = text.match(/^From:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?\s*$/im);
  return m ? m[1].trim() : null;
}

export function findParser(fromHeader, bodyText = "") {
  // ... existing direct match ...
  if (direct) return direct;
  const forwardedFrom = extractForwardedSender(bodyText ?? "");
  if (forwardedFrom) {
    const fwd = forwardedFrom.toLowerCase();
    return parsers.find(p => p.senderDomains.some(d => fwd.includes(d.toLowerCase()))) ?? null;
  }
  return null;
}
```

Update `runPipeline(emailText, fromHeader)` to pass `emailText` as second arg to `findParser`.

**Acceptance criteria:**
- `[forwarded-with-noise]` eval fixture passes
- Eval: 45/45

**Files:** `engine.js` (2 function changes), `gmail.js` / `scan.js` (caller update)
**Size:** S

---

### ACC-2: Origin country from IATA (remove "United States" hardcode)
**File:** `extension/src/parsers/engine.js` `runPipeline()`

Parsers already extract `originIATA`. Wire it to `iataToCountry`:

```js
// After existing destination resolution:
if (raw.originIATA) {
  trip.origin_country = iataToCountry(raw.originIATA) ?? "United States";
}
```

**Acceptance criteria:**
- Email with origin IST → `origin_country: "Turkey"`
- Email with origin JFK → `origin_country: "United States"`
- Eval stays 45/45

**Files:** `engine.js`
**Size:** XS

---

### ACC-3: IATA map gap fill
**File:** `extension/src/utils/iataToCountry.js`

Add missing airports in these regions (check each for gaps first):
- Africa: ADD (Ethiopia), NBO (Kenya), LOS/ABV (Nigeria), JNB/CPT (South Africa), CMN/RAK/FEZ (Morocco), CAI/HRG/SSH (Egypt), DAR (Tanzania), ACC (Ghana), LFW (Togo), ABJ (Côte d'Ivoire)
- South Asia: BOM/DEL/MAA/BLR/HYD/CCU (India), KHI/LHE/ISB (Pakistan), DAC (Bangladesh), CMB (Sri Lanka), KTM (Nepal)
- SE Asia: CGK/DPS (Indonesia), MNL/CEB (Philippines), BKK/DMK/HKT/CNX (Thailand), KUL/SZB/PEN (Malaysia), SGN/HAN (Vietnam), RGN (Myanmar), REP (Cambodia), VTE (Laos)
- Latin America: GRU/GIG/CGH/BSB/SSA (Brazil), EZE/AEP (Argentina), SCL (Chile), BOG/MDE (Colombia), LIM (Peru), UIO (Ecuador), PTY (Panama), GUA (Guatemala), SAL (El Salvador), TGU (Honduras), MGA (Nicaragua), SJO (Costa Rica), GCM (Cayman Islands), MBJ/KIN (Jamaica), NAS (Bahamas), POS (Trinidad)
- Central Asia: ALA (Kazakhstan), TAS (Uzbekistan), FRU (Kyrgyzstan)

**Acceptance criteria:**
- `iataToCountry("BOM")` → `"India"`
- `iataToCountry("ADD")` → `"Ethiopia"`
- `iataToCountry("GRU")` → `"Brazil"`

**Files:** `iataToCountry.js`
**Size:** S

---

**Checkpoint A:** `npm run eval` → 45/45, all per-field scores ≥98%

---

## Phase B — Classifier Hardening (Gate 2)

The classifier must achieve **100% recall** (no real flight ever dropped)
and high precision (no junk reaches Sonnet).
Current: Gemini Flash only, single call, falls back to `uncertain=true`.

### ACC-C1: Dual-classifier ensemble for uncertain cases
**File:** `backend/ai_client.py`

Current logic: one Gemini call, if uncertain → pass through to extraction.
New logic: if Gemini returns `uncertain`, run a second quick call with Claude Haiku
to break the tie. Only drop the email if **both** classifiers say `certain: false`.

```python
async def classify_email(compressed_text: str) -> dict:
    gemini_result = await _classify_with_gemini(compressed_text)
    
    # Certain on either side — trust it
    if gemini_result.get("confidence") == "certain":
        return gemini_result
    
    # Uncertain: get a second opinion from Haiku
    haiku_result = await _classify_with_haiku(compressed_text)
    
    # If either says is_flight=true, pass through
    if gemini_result.get("is_flight") or haiku_result.get("is_flight"):
        return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}
    
    # Both say false, but neither is certain → pass through (safety)
    if haiku_result.get("confidence") != "certain":
        return {"is_flight": True, "confidence": "uncertain", "rejection_reason": None}
    
    # Both are certain false → drop
    return {"is_flight": False, "confidence": "certain",
            "rejection_reason": haiku_result.get("rejection_reason")}
```

**Why:** A single classifier can hallucinate. Requiring two independent `certain: false`
verdicts before dropping an email guarantees near-zero false negatives.

**Acceptance criteria:**
- In testing: no real flight confirmation email is ever dropped by classify stage
- Classifier still drops >80% of newsletter/hotel/price-alert emails
- Latency impact: uncertain cases add 1 Haiku call (~200ms) — acceptable

**Files:** `backend/ai_client.py`
**Size:** M

---

### ACC-C2: Enrich CLASSIFY_PROMPT with failure-mode examples
**File:** `backend/ai_client.py` `CLASSIFY_PROMPT`

Current prompt has 3 examples. Expand to 10, covering observed failure modes:
- Trip credit email (rejected) — people confuse these with bookings
- Seat upgrade confirmation (rejected) — flight-adjacent but not a booking
- Check-in reminder (rejected) — flight-adjacent but not a booking
- Partial forward with noise (accepted) — forwarded through personal email
- Non-English booking (accepted) — Turkish, Arabic, French
- Multi-leg itinerary (accepted) — complex but real booking
- Budget airline (accepted) — no IATA codes, just city names
- Aggregator booking (accepted) — Expedia/Booking.com format

**Acceptance criteria:**
- After prompt update, re-run 45 eval fixtures through classify stage
- 0 real flight fixtures get `certain: false` from classify
- ≥90% of non-flight fixtures get `certain: false`

**Files:** `backend/ai_client.py`
**Size:** S

---

## Phase C — Extractor Upgrade (Gate 3)

### ACC-E1: Claude Sonnet as primary extractor (not Haiku)
**File:** `backend/ai_client.py` `_extract_email_inner()`

Current: Haiku → escalate to Sonnet only if Haiku returns zero trips.
New: Sonnet as primary. Justified because Gate 2 already filtered ~70% of emails —
the extractor only runs on confirmed/uncertain flight emails.

```python
async def _extract_email_inner(full_text: str) -> dict:
    capped = full_text[:15000]
    
    # Sonnet primary — justified because classifier already gated this
    try:
        result = await _call_claude(capped, model="claude-sonnet-4-6", system_prompt=EXTRACT_PROMPT)
        if result.get("is_confirmed_flight_booking") is not None:
            return result
    except (ProviderError, RateLimitError) as e:
        errors.append(f"sonnet: {e}")
    
    # Gemini fallback
    # ... Groq fallback ...
    # ... OpenRouter last resort ...
```

**Acceptance criteria:**
- `_aiProvider` field in response is `"claude-sonnet-4-6"` for primary extraction
- Eval: 45/45 (regression check)
- Backend test: 10 saved email fixtures → all produce high-confidence extraction

**Files:** `backend/ai_client.py`
**Size:** S

---

### ACC-E2: Structured tool_use output (enforce JSON schema)
**File:** `backend/ai_client.py` `_call_claude()`

Replace free-form JSON parsing with Anthropic tool_use / forced JSON schema.
This eliminates hallucinated field names and invalid enum values.

```python
TRIP_TOOL = {
    "name": "record_trips",
    "description": "Record all flight trips found in this email",
    "input_schema": {
        "type": "object",
        "properties": {
            "is_confirmed_flight_booking": {"type": "boolean"},
            "rejection_reason": {"type": ["string", "null"],
                "enum": ["price-alert", "hotel-only", "car-only",
                         "loyalty-statement", "newsletter",
                         "seat-upgrade", "check-in-reminder",
                         "boarding-pass", "voucher-credit", None]},
            "trips": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["departure_date", "destination_country", "confidence"],
                    "properties": {
                        "departure_date": {"type": ["string", "null"], "pattern": "^\\d{4}-\\d{2}-\\d{2}$|^$"},
                        "return_date": {"type": ["string", "null"]},
                        "trip_type": {"type": ["string", "null"], "enum": ["round-trip", "one-way", None]},
                        "origin_country": {"type": ["string", "null"]},
                        "destination_country": {"type": ["string", "null"]},
                        "airline": {"type": ["string", "null"]},
                        "flight_number": {"type": ["string", "null"]},
                        "aircraft_type": {"type": ["string", "null"]},
                        "confirmation_number": {"type": ["string", "null"]},
                        "passenger_name": {"type": ["string", "null"]},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                        "field_confidence": {
                            "type": "object",
                            "description": "Per-field confidence",
                            "properties": {
                                "departure_date": {"type": "string", "enum": ["high", "medium", "low"]},
                                "destination_country": {"type": "string", "enum": ["high", "medium", "low"]},
                                "flight_number": {"type": "string", "enum": ["high", "medium", "low"]}
                            }
                        }
                    }
                }
            }
        },
        "required": ["is_confirmed_flight_booking", "trips"]
    }
}
```

Force tool use: `tool_choice={"type": "tool", "name": "record_trips"}`.
The model cannot deviate from the schema — hallucinated fields are impossible.

**Acceptance criteria:**
- Claude calls never raise JSON parse errors
- `field_confidence` is present in every trip
- Regression: eval 45/45

**Files:** `backend/ai_client.py`
**Size:** M

---

### ACC-E3: Origin country in EXTRACT_PROMPT
**File:** `backend/ai_client.py` EXTRACT_PROMPT

Update prompt: `origin_country` already exists but currently defaults to "United States".
Change instruction to: derive from origin airport IATA using the hints block,
not from assumption. Update all 6 examples to show non-US origin where applicable.

**Acceptance criteria:**
- AI extraction of IST→JFK email returns `origin_country: "Turkey"`
- AI extraction of JFK→IST email returns `origin_country: "United States"`

**Files:** `backend/ai_client.py`
**Size:** XS

---

### ACC-E4: Multi-leg extraction rule
**File:** `backend/ai_client.py` EXTRACT_PROMPT

Add explicit instruction:
```
Multi-leg itineraries: return each leg as a SEPARATE trip object.
For a 3-leg trip (JFK→CDG→IST), return 2 trip objects:
  Leg 1: origin=United States, dest=France
  Leg 2: origin=France, dest=Turkey
Each leg gets its own departure_date and flight_number.
```

**Acceptance criteria:**
- `[multi-city-three-legs]` fixture: produces 2 trip objects, correct per-leg countries
- Single-leg emails still produce 1 trip object

**Files:** `backend/ai_client.py`
**Size:** XS

---

**Checkpoint B:** Run 45 eval fixtures through the full backend stack.
All 45 pass. `field_confidence` present on all trips. No JSON parse errors.

---

## Phase D — Cross-Validation Layer (Gate 4)

### ACC-V1: Verify pass for ALL trips (not just null-field)
**File:** `backend/ai_client.py` `extract_trips()`

Currently verify runs only when `departure_date` or `destination_country` is null.
Extend: also run verify when `field_confidence.departure_date != "high"` or
`field_confidence.destination_country != "high"`.

```python
needs_verify = (
    not trip.get("departure_date") or
    not trip.get("destination_country") or
    trip.get("field_confidence", {}).get("departure_date", "high") != "high" or
    trip.get("field_confidence", {}).get("destination_country", "high") != "high"
)
```

**Acceptance criteria:**
- A trip with `departure_date` set but `field_confidence.departure_date = "low"` triggers verify
- Verify correctly corrects the date or keeps it if it was right

---

### ACC-V2: Date sanity check
**File:** `backend/ai_client.py` `extract_trips()`

After extraction + verify, apply a sanity check:
- `departure_date` must be within ±3 years of today
- `departure_date` must not be in the future by more than 2 years
- If date fails sanity → set to null and set `_needs_review: True`

This catches the "2084-03-14" hallucination class.

```python
from datetime import date, timedelta

def _date_is_sane(date_str: str) -> bool:
    try:
        d = date.fromisoformat(date_str)
        today = date.today()
        return date(today.year - 10, 1, 1) <= d <= date(today.year + 2, 12, 31)
    except Exception:
        return False
```

**Acceptance criteria:**
- Trip with `departure_date: "2084-03-14"` → `departure_date: null, _needs_review: True`
- Trip with `departure_date: "2024-03-14"` → unchanged

---

### ACC-V3: Flag trips for human review
**File:** `backend/ai_client.py`

After all verify passes, mark trips that still have gaps:

```python
def _needs_human_review(trip: dict) -> bool:
    return (
        not trip.get("departure_date") or
        not trip.get("destination_country") or
        trip.get("confidence") == "low" or
        trip.get("_needs_review")
    )

if _needs_human_review(trip):
    trip["_needs_review"] = True
```

Frontend reads `_needs_review` and shows a "Needs Review" badge.

**Acceptance criteria:**
- A trip with `destination_country: null` after verify → `_needs_review: True`
- A high-confidence trip → `_needs_review` absent or False

---

## Phase E — Human Review Queue (UI)

### ACC-H1: "Needs Review" badge in ReviewTable
**File:** `extension/src/components/ReviewTable.jsx`

For any trip with `_needs_review: true`:
- Show amber "⚠ Needs Review" badge next to the trip row
- Expand the row with a "What we found" snippet (first 200 chars of email body)
- Show a "Confirm anyway" button (marks `confirmed: true`, removes badge)
- Pre-populate the inline edit form for the missing fields

**Acceptance criteria:**
- A `_needs_review: true` trip shows the amber badge
- Clicking "Confirm anyway" marks it confirmed and removes the badge
- Missing fields are highlighted in the inline edit form

**Files:** `ReviewTable.jsx`
**Size:** M

---

### ACC-H2: Email snippet preview inline
**File:** `extension/src/components/ReviewTable.jsx`

Store `_snippet` (first 300 chars of cleaned email body) on each trip during scan.
Show it in a collapsible `<details>` under the "Needs Review" row so the user can
read the source email without leaving the extension.

```jsx
{trip._needs_review && trip._snippet && (
  <details className="mt-1">
    <summary className="text-xs text-amber-600 cursor-pointer">Show email snippet</summary>
    <pre className="text-[10px] text-gray-500 mt-1 whitespace-pre-wrap leading-tight max-h-32 overflow-auto">
      {trip._snippet}
    </pre>
  </details>
)}
```

**Files:** `ReviewTable.jsx`, `scan.js` (add `_snippet` field to trip object)
**Size:** S

---

**Checkpoint E:** End-to-end test with 5 real user emails that previously had errors.
All 5 either extract correctly or appear in the Needs Review queue.

---

## Phase F — Eval Growth to 60

### ACC-F1: 15 additional fixtures
**File:** `extension/src/emailClients/__tests__/eval/fixtures.js`

Add fixtures covering the scenarios the current 45 do not test:

| id | Description | Expected |
|----|-------------|----------|
| `connection-flight` | JFK→FRA→IST, 2 legs | 2 trip objects, correct origins |
| `codeshare-marketed` | "AA 6999 operated by BA" | flight_number: "AA 6999" |
| `ryanair-no-iata` | Budget airline, city names only | AI extracts via Sonnet |
| `hotel-plus-flight` | Combined booking, hotel+flight | Extract only flight |
| `seat-upgrade` | Upgrade confirmation | `is_flight: false` |
| `checkin-reminder` | Check-in opens reminder | `is_flight: false` |
| `bookingcom-flights` | Booking.com flight itinerary | Extract correctly |
| `tripcom-itinerary` | Trip.com aggregator | Extract correctly |
| `two-passengers` | 2 pax, same flight | 1 trip object, first pax name |
| `infant-on-ticket` | Adult + infant | 1 trip object, adult name |
| `sparse-see-pdf` | Body only says "see attached" | `_needs_review: true` |
| `amtrak-rail` | Amtrak train booking | `is_flight: false` |
| `cruise-ship` | Cruise confirmation | `is_flight: false` |
| `forwarded-gmail-noise` | More forwarded email variants | Extracted correctly |
| `non-iata-airport` | Small airport, no IATA in map | `_needs_review: true` OR AI resolves |

**Acceptance criteria:**
- All 15 pass immediately on add (or corresponding fix already in place)
- `npm run eval` → ≥59/60 (goal: 60/60)

---

## Dependency Order

```
ACC-3 (IATA map) — quick win, do first
ACC-1 (forwarded sender) — fixes last failing fixture → 45/45
ACC-2 (origin IATA) — tiny change, do with ACC-1
       │
       ▼
Checkpoint A (eval 45/45)
       │
ACC-C2 (enrich CLASSIFY_PROMPT) — no code change, just prompt
ACC-C1 (dual classifier) — after C2
       │
ACC-E1 (Sonnet as primary) — independent
ACC-E2 (structured tool_use) — after E1 (builds on call structure)
ACC-E3 (origin in LLM prompt) — after E2
ACC-E4 (multi-leg instruction) — after E2
       │
Checkpoint B (backend tests, 45/45 through full stack)
       │
ACC-V1 (verify for low confidence) — after E2 (needs field_confidence)
ACC-V2 (date sanity) — independent
ACC-V3 (needs_review flag) — after V1+V2
       │
ACC-H1 (Needs Review UI) — after V3
ACC-H2 (snippet preview) — after H1
       │
Checkpoint E (end-to-end with real emails)
       │
ACC-F1 (15 new fixtures) — after all above confirmed
```

---

## Accuracy Targets

| Metric | Current | After Phase A | After Phase C | After Phase E |
|--------|---------|---------------|---------------|---------------|
| Eval fixtures pass | 44/45 (98%) | 45/45 (100%) | 45/45 (100%) | 60/60 (100%) |
| departure_date accuracy | 97% | 97% | 99% | 99% |
| destination_country accuracy | 97% | 97% | 99% | 99% |
| origin_country accuracy | ~50% (hardcoded US) | ~80% (IATA) | 95% (LLM) | 95% |
| False positive rate | <1% | <1% | <0.5% | <0.1% (human queue) |
| Recall on real flights | ~99% | ~99% | ~99.5% | ~100% (human queue catches remainder) |

The human review queue is the final safety net: anything that survives all four
automated gates but is still uncertain gets surfaced to the user with one click
to confirm. This achieves the practical definition of 100% — the user sees every
real flight, and nothing is silently dropped.

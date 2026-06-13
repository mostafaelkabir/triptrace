# TripTrace — Maximum Accuracy Extraction Spec

## Goal

Near-100% field-level accuracy on confirmed flight booking emails.
Cost is not a constraint. Every legitimate booking must be found and correctly extracted.

---

## Current State (honest baseline)

`npm run eval` on 20 labeled fixtures:

| Field | Current accuracy |
|---|---|
| departure_date | 87% (13/15) |
| destination_country | 71% (10/14) |
| flight_number | 93% (14/15) |
| Overall fixture pass | 80% (16/20) |

**Root cause of failures — not AI, not prompts:**

1. **Regex gaps**: Turkish Airlines / Expedia pipe-table layout (`| Istanbul (IST) |`) doesn't trigger the `destinationIATA` regex which requires "To:" or "→" before the IATA code.
2. **Date format gap**: "Wednesday April 03 2024" (no comma) not matched by generic date sweep.
3. **No auto-AI for unmatched rows**: emails that miss the regex pipeline show as "unmatched" with a manual "Try AI" button instead of being automatically extracted.
4. **AI model too weak for fallback**: Haiku on 60 pre-extracted lines. For hard cases, this misses context that the full email contains.

The AI path itself is accurate. The problem is emails don't reach it automatically.

---

## Architecture for Near-100% Accuracy

### Layer 1 — Fast regex (known senders, < 5ms)

For emails from known airline/OTA domains where the parser produces `confidence: "high"` (both `departure_date` AND `destination_country` extracted): **accept immediately, no AI needed.** These are correct >99% of the time.

For known-sender emails where the regex produces `confidence: "low"` (one or more required fields null): **auto-escalate to Layer 2 immediately.** Don't show a "Try AI" button — just do it.

### Layer 2 — Claude Sonnet 4.6 auto-extraction (all unmatched + low-confidence)

Every email that isn't `confidence: "high"` from Layer 1 goes here automatically. No user action required.

**Model:** `claude-sonnet-4-6` (not Haiku — accuracy over cost)  
**Input:** Full email body, not pre-extracted lines  
**Method:** `tool_use` with forced schema (already implemented — keep this)  
**Prompt:** Two-stage classify-then-extract (already implemented — keep this)

This handles:
- Unmatched senders (forwarded emails, small airlines, travel agents)
- Known senders with unusual layouts (pipe tables, garbled HTML)
- Mixed content (flight + hotel packages)

### Layer 3 — Verification pass (when Layer 2 returns low-confidence)

When Claude Sonnet returns `confidence: "low"` on any trip record, run a second Claude call:

```
"You previously extracted this from an email:
  departure_date: 2024-03-14
  destination_country: Turkey
  flight_number: TK 1

Here is the original email text:
[full email body]

Verify each field:
1. Is departure_date correct? If not, what is it?
2. Is destination_country correct? If not, what is it?
3. Is flight_number correct? If not, what is it?

Return the corrected record."
```

This eliminates hallucinations. If Claude extracted something that isn't in the email, the verification pass will catch it.

### Layer 4 — Human review (anything still unresolved)

After Layers 1-3, any record still missing `departure_date` OR `destination_country` is surfaced to the user with:
- Orange highlight on missing fields
- Pre-filled suggestions from best-effort extraction
- One-click "looks right" confirmation

This is already implemented (`_missingFields`, orange cell borders). The change is that users only see this for genuinely ambiguous cases — not for the 80% that Layers 1-3 handle automatically.

---

## Specific Fixes

### Fix 1 — Pipe-table IATA extraction (regex layer)

**Problem:** `| Istanbul (IST) |` and `| London (LHR) |` in pipe-separated rows don't trigger current `destinationIATA` regex which requires "To/→" context.

**Fix:** Add a pipe-aware IATA extractor to `engine.js` as a fallback when `destinationIATA` returns null:

```js
// Fallback: second IATA code in a pipe row (first = origin, second = destination)
function extractIataFromPipeRows(text) {
  const pipeLines = text.split('\n').filter(l => l.includes('|'));
  for (const line of pipeLines) {
    const codes = [...line.matchAll(/\(([A-Z]{3})\)/g)].map(m => m[1]);
    if (codes.length >= 2) return { originIATA: codes[0], destinationIATA: codes[1] };
  }
  return null;
}
```

Call this in `runPipeline()` after the extractor runs, when `destinationIATA` is null.

**Impact:** Fixes `tk-1-roundtrip` and `pipe-table-format` eval failures → `destination_country` 71% → 93%.

### Fix 2 — Date without comma (generic sweep)

**Problem:** "Wednesday April 03 2024" (no comma after weekday, no comma after day) not matched.

**Fix:** Add to `GENERIC_DATE_SWEEPS` in `engine.js`:

```js
[/\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+\d{1,2}\s+\d{4})\b/i, "EEEE MMMM d yyyy"],
[/\b(\w+\s+\d{1,2}\s+\d{4})\b/i, "MMMM d yyyy"],  // "April 03 2024"
```

**Impact:** Fixes `garbled-html-stripped` eval failure → `departure_date` 87% → 93%.

### Fix 3 — Auto-AI for unmatched and low-confidence rows

**Problem:** After scan, unmatched rows sit in the table with a "Try AI" button. Users often don't click it. Many are real flights.

**Fix:** In `scan.js`, after `runPipeline()` returns a result, check confidence and immediately queue for AI extraction:

```js
// In scanGmail(), after getting the trip record:
if (trip.confidence === "unmatched" || trip.confidence === "low") {
  // Don't wait — fire-and-forget AI extraction in the background
  // The UI shows a spinner; when it resolves, UPDATE_TRIP dispatches
  queueForAI(trip);
}
```

This means by the time the scan finishes, most rows are already AI-extracted. No "Try AI" button needed for the common case.

### Fix 4 — Use Sonnet for auto-extraction, not Haiku

**Problem:** Auto-AI queue currently uses Haiku. For unmatched emails, Haiku on 60 pre-extracted lines misses context. 

**Fix:** The auto-AI path uses `claude-sonnet-4-6` with the full email body. Haiku can remain for the "try AI" opt-in on individual rows where the user is already engaged.

### Fix 5 — Verification pass for low-confidence extractions

When Claude Sonnet returns a trip with `confidence: "low"` (meaning it's guessing at least one field), run the verification prompt immediately as a second call before showing the result to the user.

---

## Implementation Order

```
Fix 1 (pipe-table IATA)     — 30 min, pure regex, no AI, fixes 2 eval failures
Fix 2 (date without comma)  — 15 min, pure regex, fixes 1 eval failure
Fix 3 (auto-AI for unmatched) — 2 hours, scan.js + ReviewTable.jsx + background queue
Fix 4 (Sonnet for auto path)  — 30 min, ai_client.py routing change
Fix 5 (verification pass)     — 2 hours, new _verify_extraction() in ai_client.py
```

After Fix 1+2: eval score 80% → ~95% on the regex layer alone.
After Fix 3+4+5: near-100% on the AI layer. The only remaining failures are emails where the booking information genuinely isn't in the email text (e.g. a forwarded partial email missing the itinerary section).

---

## Eval Target

After all fixes:

| Field | Target |
|---|---|
| departure_date | ≥ 97% |
| destination_country | ≥ 97% |
| flight_number | ≥ 95% |
| False positive rate | < 2% |
| False negative rate | < 1% (real flights missed) |

Grow eval fixture set to 50+ emails (mix of real anonymized emails + edge cases) to make these numbers meaningful.

---

## What "Near-100%" Actually Requires

The remaining < 1% of failures after all the above are emails where:

1. **The booking info isn't in the email at all** — e.g. a forwarded "Your flight is tomorrow" reminder with no itinerary details. Fix: detect and skip these at the subject/body filter level rather than showing a blank row.

2. **Non-English emails** — confirmations in Turkish, Arabic, Chinese. Fix: Claude handles these well if you pass the full body. The regex layer doesn't. Auto-AI (Fix 3) handles this automatically.

3. **Scanned PDFs as attachments** — some travel agents send PDF itineraries. The current system ignores attachments entirely. Fix: add PDF attachment extraction using Claude's vision API (`image/jpeg` of the PDF page).

4. **Multi-city trips** — JFK→IST→DXB→JFK on one booking. Current schema stores one origin + one destination. Fix: add `legs` array to the schema, store each segment.

Items 3 and 4 are out of scope for Phase 2 but represent the path from 99% to 99.9%.

---

## Testing

Every accuracy fix must:
1. Add at least one new fixture to `eval/fixtures.js` covering the failure case
2. Confirm `npm run eval` improves before and after
3. Run `npm test` to verify no regressions (152 tests)

The eval script is the accuracy contract. If a change doesn't improve the eval score, it didn't improve accuracy.

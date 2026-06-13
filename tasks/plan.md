# TripTrace — High-Accuracy AI Parsing Plan

## Goal
Maximize extraction accuracy for all flight fields — including the new `flight_number` and `aircraft_type` fields — while keeping costs manageable. The current setup (Gemini Flash-Lite → Groq llama-3.3-70b → OpenRouter Gemma-2-9b) is ordered cheapest-first, which trades accuracy for cost. For a legal-use product (USCIS N-400), accuracy must come first.

---

## Why the Current Setup Falls Short

| Problem | Root cause |
|---|---|
| Flight number / aircraft never extracted | Not in the schema or prompt at all |
| Gemma-2-9b (OpenRouter fallback) misses structured data | Weak instruction following on small open model |
| Groq llama-3.3-70b is inconsistent on messy HTML | No few-shot examples in the prompt |
| Table-structured emails lose row/cell context after stripHtml | `\n` insertion is coarse — flight number, seat, date end up on separate lines with no column relationship |
| Email truncated to 4,000 chars client-side | Some confirmations put the itinerary table in the second half of the email |
| No caching — same email re-parsed on every "Try AI" click | Wasted API calls |

---

## Recommended Model Stack

### Primary: Claude Haiku (`claude-haiku-4-5-20251001`)
- **Why**: Best structured-extraction accuracy below $1/1M tokens. Natively handles messy HTML artifacts. Tool use forces JSON schema compliance — no parse errors.
- **Cost**: ~$0.0008 per email (≈3,000 input + 200 output tokens)
- **Rate limit**: 1,000 RPM on paid tier — no issue for this use case

### Escalation: Claude Sonnet (`claude-sonnet-4-6`)
- Called automatically only when Haiku returns `confidence: "low"` on ALL trips or an empty trips array
- Fires for ~10–15% of emails (complex multi-leg itineraries, heavily encoded tables)
- Cost: ~$0.009 per email — still cheap given low escalation rate

### Free-tier fallback (no Anthropic key): Gemini 2.5 Flash
- Upgrade from `gemini-2.5-flash-lite` to `gemini-2.5-flash` for better accuracy
- 15 RPM free — sufficient for manual "Try AI" clicks by free users
- Keep Groq llama-3.3-70b and OpenRouter as further fallbacks

### Monthly cost estimate
- 1,000 AI-parsed emails/month (typical paid user): ~$0.80 Haiku + ~$0.12 Sonnet escalation = **~$0.92/user/month**
- A $19 one-time payment covers ~20 months of AI parsing costs

---

## New Fields: `flight_number` + `aircraft_type`

Add to the AI output schema and ReviewTable:

| Field | Format | Example |
|---|---|---|
| `flight_number` | IATA carrier code + space + numeric | `"TK 1"`, `"AA 123"`, `"LH 400"` |
| `aircraft_type` | Free text from email | `"Boeing 777-300ER"`, `"Airbus A321neo"` |

Both fields are nullable. Both appear as editable columns in ReviewTable and in the CSV export.

---

## Tasks

### A1 — Add Claude API provider to `backend/ai_client.py`

**What:** Add `_call_claude(text, model)` using the Anthropic SDK. Insert it as the first provider in `_PROVIDER_CHAIN`.

**Key implementation details:**
- Use `tool_use` to force structured output — define a tool `record_trips` with a JSON schema. This is more reliable than asking Claude to return raw JSON because the schema is enforced at the API level.
- Model param defaults to `claude-haiku-4-5-20251001`
- Temperature 0, max_tokens 1024
- API key: `ANTHROPIC_API_KEY`

**Tool schema for forced output:**
```python
TRIP_TOOL = {
    "name": "record_trips",
    "description": "Record all flight trips found in this email",
    "input_schema": {
        "type": "object",
        "properties": {
            "trips": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "departure_date":      {"type": ["string","null"]},
                        "return_date":         {"type": ["string","null"]},
                        "trip_type":           {"type": ["string","null"], "enum": ["one-way","round-trip",None]},
                        "origin_country":      {"type": ["string","null"]},
                        "destination_country": {"type": ["string","null"]},
                        "airline":             {"type": ["string","null"]},
                        "flight_number":       {"type": ["string","null"]},
                        "aircraft_type":       {"type": ["string","null"]},
                        "confirmation_number": {"type": ["string","null"]},
                        "passenger_name":      {"type": ["string","null"]},
                        "confidence":          {"type": "string", "enum": ["high","low"]}
                    },
                    "required": ["departure_date","destination_country","confidence"]
                }
            }
        },
        "required": ["trips"]
    }
}
```

**Acceptance criteria:**
- `ANTHROPIC_API_KEY` set → Claude Haiku is the first provider tried
- `flight_number` and `aircraft_type` populated when present
- Response always has valid `trips` array (no JSON parse errors — tool_use guarantees it)
- `_provider` field returns `"claude-haiku-4-5"`

---

### A2 — Haiku → Sonnet escalation in `extract_trips()`

**What:** After Haiku returns, check if the result is weak. If so, escalate to Sonnet before trying Gemini.

**Logic:**
```python
result = await _call_claude(text, model="claude-haiku-4-5-20251001")
result["_provider"] = "claude-haiku-4-5"

trips = result.get("trips", [])
all_low = trips and all(t.get("confidence") == "low" for t in trips)
if not trips or all_low:
    try:
        sonnet = await _call_claude(text, model="claude-sonnet-4-6")
        sonnet["_provider"] = "claude-sonnet-4-6"
        result = sonnet
    except Exception:
        pass  # keep Haiku result, continue waterfall
```

**Acceptance criteria:**
- Email where Haiku returns empty → second call goes to Sonnet
- Email where Haiku returns `confidence: "high"` on any trip → no escalation
- `_provider` badge in ReviewTable shows `"claude-haiku-4-5"` or `"claude-sonnet-4-6"` correctly

---

### A3 — Rewrite `SYSTEM_PROMPT` with few-shot examples + new fields

**What:** Add explicit extraction rules for `flight_number` and `aircraft_type`, and two concrete few-shot examples showing before/after. The current prompt has no examples — adding even two increases accuracy on novel formats by 30–50% (well-documented in instruction-following literature).

**Flight number extraction rules to add:**
```
FLIGHT NUMBER:
- Format: 2-letter IATA carrier code + space + 1-4 digits: "TK 1", "AA 100", "LH 400", "UA 1234"
- Appears as: "Flight TK1", "TK 1 Istanbul", "Flight Number: TK 1", "operated by Turkish Airlines TK1"
- ALWAYS include a space between carrier code and number in output (normalize "TK1" → "TK 1")
- If multiple flights (outbound + return), extract the OUTBOUND flight number

AIRCRAFT TYPE:
- Appears as: "Aircraft: Boeing 777-300ER", "Equipment: Airbus A320", "operated on a 737 MAX"
- Return exactly as written in the email, e.g. "Boeing 777-300ER", "Airbus A321neo"
- null if not mentioned
```

**Few-shot examples (2 min, 3 max to stay within token budget):**

Example 1 — Turkish Airlines (clean): shows flight number + aircraft in table row
Example 2 — Expedia (messy HTML stripped): shows how to handle garbled text, multi-leg, partial info

**Acceptance criteria:**
- Prompt stays under 5,000 tokens total (system prompt)
- `flight_number` extracted from `"TK1"`, `"AA 100"`, `"Flight LH 400"` patterns
- `aircraft_type` extracted from `"Boeing 737-800"`, `"Airbus A321"` patterns
- Existing extraction rules (IATA→country table, date formats) unchanged

---

### A4 — Table-aware HTML preprocessing in `gmail.js`

**What:** Add a `preserveTableRows()` step before `stripHtml`. Flight itinerary tables look like:

```html
<tr>
  <td>TK 1</td><td>Istanbul (IST)</td><td>New York (JFK)</td>
  <td>14 Mar 2024 22:15</td><td>Boeing 777-300ER</td>
</tr>
```

After current `stripHtml`: `"\nTK 1\nIstanbul (IST)\nNew York (JFK)\n14 Mar 2024 22:15\nBoeing 777-300ER\n"` — model loses the row relationship; `TK 1` looks unrelated to the date.

After `preserveTableRows()`: `"TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024 22:15 | Boeing 777-300ER"` — one line per row, columns pipe-separated.

**Implementation (add before `stripHtml` call):**
```js
function preserveTableRows(html) {
  return html.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, inner) => {
    const cells = [];
    inner.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (__, cell) => {
      const text = cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) cells.push(text);
    });
    return cells.join(" | ") + "\n";
  });
}
```

**File:** `extension/src/emailClients/gmail.js` — call `preserveTableRows(html)` before `stripHtml(html)`.

**Acceptance criteria:**
- A Turkish Airlines HTML email with a table itinerary → each flight row appears as one `|`-separated line
- `looksLikeConfirmation()` still passes on the preprocessed output
- All existing `gmail.test.js` tests pass

---

### A5 — Increase email send size: 4,000 → 8,000 chars

**What:** Change `body.slice(0, 4000)` → `body.slice(0, 8000)` in `ReviewTable.jsx` where the email body is passed to `parseWithAI()`.

**Why:** United, Delta, and some Expedia confirmations put the full itinerary table below the fold (>4,000 chars). Haiku's 200K context window makes 8,000 chars negligible cost-wise (~500 extra tokens = ~$0.0001).

**File:** `extension/src/components/ReviewTable.jsx`, in `runAIById()`.

**Acceptance criteria:**
- Emails >4,000 chars get their itinerary table included
- No change to backend (it already accepts any length)

---

### A6 — Add `flight_number` and `aircraft_type` to ReviewTable + ExportBar

**What:**
- Two new columns in the review table: **Flight #** and **Aircraft** (after existing "Source" column)
- `EditableCell` for both — user can manually fill in if AI missed them
- Add to CSV export in `ExportBar.jsx`
- Add default `null` values to `ADD_TRIP` action in `App.jsx`

**Column order in CSV:** Country Visited · Departure Date · Return Date · Days Abroad · Flight # · Aircraft · Airline · Confirmation #

**Acceptance criteria:**
- Columns visible in ReviewTable
- AI-parsed values appear immediately after "Try AI"
- Manual editing works
- CSV includes both fields

---

### A7 — Client-side email parse cache (`chrome.storage.local`)

**What:** Cache the AI parse result per `emailId` so clicking "Try AI" twice doesn't cost 2× API calls.

**Implementation in `ReviewTable.jsx`, `runAIById()`:**
```js
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getCachedResult(emailId) {
  if (typeof chrome === "undefined" || !chrome.storage) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get([`ai_${emailId}`], (r) => {
      const entry = r[`ai_${emailId}`];
      if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return resolve(null);
      resolve(entry.result);
    });
  });
}

async function setCachedResult(emailId, result) {
  if (typeof chrome === "undefined" || !chrome.storage) return;
  chrome.storage.local.set({ [`ai_${emailId}`]: { result, ts: Date.now() } });
}
```

Call `getCachedResult` at the top of `runAIById`; call `setCachedResult` after a successful parse.

**Acceptance criteria:**
- Second "Try AI" click on same row → no network call, instant result
- Cache expires after 7 days (old entry ignored)
- Works in non-Chrome environments (dev/test) by returning null gracefully

---

### A8 — Update `.env.example` and docs

**What:**
- Add `ANTHROPIC_API_KEY=sk-ant-...` to `backend/.env.example` with priority comment
- Add comment block explaining the provider waterfall and cost estimates
- Remove stale Nylas variables from `.env.example`

---

## Dependency Order

```
A4 (table preprocessing)   ← no deps, highest ROI, do first
A5 (8K char limit)         ← no deps, 2-line change
A3 (prompt rewrite)        ← no deps, do before A1 so Claude gets the improved prompt
A1 (Claude provider)       ← depends on A3
A2 (Haiku→Sonnet)          ← depends on A1
A6 (new table columns)     ← depends on A1 (schema), independent of A2
A7 (caching)               ← depends on A1
A8 (docs)                  ← last
```

**Minimum viable slice (biggest accuracy gain, least code):** A4 → A3 → A1 → A6

**Full plan:** A4 → A5 → A3 → A1 → A2 → A6 → A7 → A8

---

## What NOT to Do

| Idea | Why not |
|---|---|
| Fine-tune a local model | Requires labeled dataset + GPU. Overkill — Claude Haiku already extracts well. |
| Use GPT-4o as primary | More expensive than Haiku, no accuracy advantage for structured extraction |
| Send raw HTML to Claude | 10–50× longer than stripped text; burns tokens on `<style>` and tracking pixels |
| Per-airline custom prompts | The 8 regex parsers already handle known senders. AI only runs on unmatched/low rows. |
| Vector DB / RAG | Email bodies are self-contained — no retrieval needed |

---

## End-to-End Acceptance Criteria

1. Turkish Airlines email → `flight_number: "TK 1"`, `aircraft_type: "Boeing 777-300ER"`, `confidence: "high"` — all fields populated
2. Delta HTML table email → flight number extracted, not null
3. Expedia multi-leg itinerary → `confirmation_number` matches 11-digit itinerary number
4. Clicking "Try AI" twice → only 1 backend call (cache hit on second)
5. `ANTHROPIC_API_KEY` not set → falls through to Gemini → Groq waterfall (regression safe)
6. All 142 existing tests pass
7. `npm run build` clean

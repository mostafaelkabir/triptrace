# TripTrace

> Chrome extension that scans Gmail and Outlook for flight confirmation emails and builds your **USCIS N-400 Part 9 travel history** — automatically.

**Non-commercial use only.** See [LICENSE](LICENSE) for details.

---

## What it does

1. **Connect** your Gmail or Outlook account (OAuth — your emails never leave your browser)
2. **Scan** — searches for flight confirmation emails from 14+ airlines and OTAs
3. **Parse** — regex parsers extract departure date, destination, flight number, aircraft type; AI fallback for unrecognized senders
4. **Review** — editable table with confidence badges; inline AI for any row
5. **Export** — CSV or copy-as-table, confirmed trips only

---

## Roadmap

### ✅ Done

- Gmail OAuth + full scan pipeline
- Outlook (Microsoft Graph) OAuth + scan
- `.eml` file import (iCloud, any provider)
- 14 regex parsers: Turkish Airlines, Lufthansa, United, Delta, American, Emirates, Air France, British Airways, Qatar Airways, Southwest, JetBlue, Alaska Airlines, Etihad Airways, Singapore Airlines
- OTA parsers: Expedia, Kayak, Google Flights, Booking.com
- AI waterfall: Gemini 2.5 Flash (free) → Groq llama-3.3-70b (free) → Claude Haiku (paid)
- Subject-line pre-filter (skips body fetch for price alerts, gate changes, boarding passes)
- Pre-extract relevant lines before AI call (81% token reduction)
- `flight_number` + `aircraft_type` extracted by regex parsers
- Thread-based deduplication + field-level merge
- Inline editable review table with confidence badges
- CSV export (N-400 Part 9 column order)
- Stripe paywall ($19 one-time or $4.99/month)
- 152 tests, `npm run eval` accuracy script (80% baseline, flight_number 93%)

---

### 🔜 Next up (Phase 2)

**Accuracy**
- [ ] Fix pipe-table destination extraction (Turkish Airlines, Expedia table layouts)  
- [ ] Grow eval fixture set from 20 → 100 using real anonymized emails
- [ ] `npm run eval:ai` — measure AI layer accuracy separately from regex layer
- [ ] Add more airline parsers: KLM, Swiss, Austrian, Pegasus, SunExpress, Priceline

**Multi-provider**
- [ ] Outlook PKCE OAuth — document Azure app registration properly
- [ ] Yahoo Mail — IMAP backend route (Yahoo has no REST mail API)
- [ ] iCloud — improve `.eml` export UX with step-by-step in-app guide

**Product**
- [ ] Chrome Web Store listing (requires $5 developer fee + privacy policy)
- [ ] Landing page at `triptrace.app` — SEO, explainer video, "Install" CTA
- [ ] N-400 PDF export — exact field format USCIS uses
- [ ] "Share with attorney" — read-only hosted view of the travel table

---

### 🔭 Phase 3 (After first users)

- [ ] Anonymous telemetry — which emails fail, which parsers miss — use data to improve
- [ ] Multi-leg trip merge UI — join outbound + inbound rows manually or automatically
- [ ] I-131 / DS-5540 export formats (other USCIS/State Dept forms)
- [ ] AR-11 change of address trips (domestic travel history)

---

## Quick start

### Extension

```bash
cd extension
npm install
npm run build          # builds to dist/
npm test               # 152 unit tests
npm run eval           # accuracy script (20 labeled fixtures)
```

**Load in Chrome:**
1. `npm run build`
2. `chrome://extensions/` → Enable Developer mode → Load unpacked → select `extension/dist/`
3. Click the TripTrace icon → Open side panel

**Required one-time setup:**
- Gmail: set your Google OAuth client ID in `extension/public/manifest.json` → [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md)
- Outlook: register an Azure app → [`docs/outlook-oauth-setup.md`](docs/outlook-oauth-setup.md)

### Backend

```bash
cd backend
cp .env.example .env        # fill in your keys
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload
# API docs → http://localhost:8000/docs
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Optional | Claude Haiku for AI fallback (~$0.001/email) |
| `GEMINI_API_KEY` | Optional | Gemini 2.5 Flash — free tier, tried first |
| `GROQ_API_KEY` | Optional | Groq llama-3.3-70b — free tier, tried second |
| `OPENROUTER_API_KEY` | Optional | Last-resort fallback |
| `STRIPE_SECRET_KEY` | For paywall | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For paywall | Stripe webhook signing secret |
| `STRIPE_PRICE_ONETIME` | For paywall | Price ID for $19 one-time |
| `STRIPE_PRICE_MONTHLY` | For paywall | Price ID for $4.99/month |
| `JWT_SECRET` | For paywall | Random secret for license tokens |

---

## Architecture

```
extension/
├── src/
│   ├── emailClients/
│   │   ├── gmail.js          # Gmail REST API, looksLikeConfirmation, subjectIsHardReject
│   │   ├── outlook.js        # Microsoft Graph API
│   │   └── emlParser.js      # .eml file import
│   ├── parsers/
│   │   ├── engine.js         # findParser + runPipeline
│   │   ├── turkishAirlines.js
│   │   ├── ... (14 parsers total)
│   │   └── aggregators.js    # Expedia, Kayak, Google Flights, Booking.com
│   ├── components/
│   │   ├── ConnectStep.jsx   # OAuth connect screen
│   │   ├── ScanStep.jsx      # Scan progress
│   │   ├── ReviewTable.jsx   # Editable trip table
│   │   └── ExportBar.jsx     # CSV / copy export
│   └── scan.js               # Full scan pipeline + deduplication
backend/
├── ai_client.py              # Multi-provider AI waterfall + line pre-extraction
├── routes/
│   ├── parse.py              # POST /parse — AI trip extraction
│   ├── payments.py           # POST /checkout
│   └── license.py            # POST /verify-license
```

**Privacy model:** All email reading happens in-browser via direct OAuth to Gmail/Outlook APIs. Email bodies are never sent to TripTrace servers. The backend only receives pre-extracted trip records when you explicitly click "Try AI" on a row.

---

## Adding a parser

Each parser in `extension/src/parsers/` is a plain object:

```js
export default {
  id: "my-airline",
  name: "My Airline",
  senderDomains: ["myairline.com"],
  subjectPatterns: [/booking confirmation/i],
  extractors: {
    confirmationNumber: /PNR[:\s]+([A-Z0-9]{4,8})/i,
    departureDate:      /Departure[:\s]+(\d{1,2}\s+\w{3}\s+\d{4})/i,
    returnDate:         /Return[:\s]+(\d{1,2}\s+\w{3}\s+\d{4})/i,
    destinationIATA:    /to\s+[A-Za-z ]+\(([A-Z]{3})\)/i,
    originIATA:         /from\s+[A-Za-z ]+\(([A-Z]{3})\)/i,
    passengerName:      /Passenger[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/,
    flightNumber:       /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType:       /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["d MMM yyyy", "MMMM d, yyyy"],
};
```

Register it in `parsers/index.js` and add the sender domain to `AIRLINE_DOMAINS` in `emailClients/gmail.js`.

---

## Testing

```bash
# Unit tests (152)
cd extension && npm test

# Accuracy eval (20 labeled fixtures)
npm run eval

# Backend
cd backend && python -m pytest
```

---

## License

Non-commercial use only. See [LICENSE](LICENSE).  
For commercial licensing: melkabir91@gmail.com

TripTrace does not provide legal advice. Always verify all travel records with a qualified immigration attorney before submitting to USCIS.

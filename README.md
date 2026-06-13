# TripTrace

> Chrome Extension + FastAPI backend that scans Gmail or Outlook for flight confirmation emails and builds your USCIS N-400 travel history table.

## Project structure

```
triptrace/
├── extension/   React 18 + Vite + Tailwind Chrome MV3 extension
├── backend/     FastAPI Python backend (AI fallback + Stripe + license)
└── docs/        Setup guides
```

## Quick start

### Extension

```bash
cd extension
npm install --cache /tmp/npm-cache
npm run dev        # Vite dev server (UI preview only)
npm run build      # Build to dist/ for loading as unpacked extension
npm test           # Run Vitest unit tests
```

**Load in Chrome:**
1. `npm run build`
2. Go to `chrome://extensions/` → Enable Developer mode → Load unpacked → select `extension/dist/`
3. Click the TripTrace icon → Open side panel

**Required setup (choose your provider):**
- Gmail: set your Google OAuth client ID in `manifest.json` → see [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md)
- Outlook: register an Azure app and paste the client ID in `background.js` → see [`docs/outlook-oauth-setup.md`](docs/outlook-oauth-setup.md)

### Backend

```bash
cd backend
cp .env.example .env       # fill in your keys
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload
# API docs at http://localhost:8000/docs
```

### Environment variables (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | For AI fallback parsing (opt-in only) |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode: `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard webhook settings |
| `STRIPE_PRICE_ONETIME` | Stripe Price ID for $19 one-time |
| `STRIPE_PRICE_MONTHLY` | Stripe Price ID for $4.99/month |
| `JWT_SECRET` | Random secret for signing license tokens |

## How it works

1. **Connect** — Gmail OAuth (`gmail.readonly`) or Outlook OAuth (`Mail.Read`) — choose at the connect screen
2. **Scan** — Gmail API or Microsoft Graph API searches for flight confirmation subjects from known airline/OTA domains
3. **Parse** — Static regex parsers run in-browser (no AI at runtime for supported airlines)
4. **Review** — Editable table; unmatched rows can opt-in to AI parsing
5. **Export** — CSV or copy-as-table, confirmed trips only

## Parser library

Airline parsers live in `extension/src/parsers/`. Currently implemented:
- Turkish Airlines (`turkishAirlines.js`)
- Lufthansa (`lufthansa.js`)

To add a new airline, run the dev-time prompt in `SPEC.md §6.2` against 2–3 sample confirmation emails, then add a parser file and register it in `index.js`.

## Legal

TripTrace does not provide legal advice. Always verify all records with a qualified immigration attorney before submitting to USCIS.

# TripTrace — Phase E: Usage-Based Pricing (Credit Packs)

## Overview

Replace the flat "paid / free" license with a **prepaid email-scan credit system**. Users get 100 free AI scans on first install. After that they buy credit packs via Stripe. Pricing is per email scanned.

The N-400 use case is fundamentally a **one-time event**: file once, scan your inbox once. Subscriptions are wrong for this. Credit packs are right: pay once, done.

---

## Pricing Model

| Pack | Emails | Price | Cost (real-world) | Margin |
|---|---|---|---|---|
| Free | 100 | $0 | ~$0.05 | — |
| Starter | 500 | $0.99 | ~$0.25 | 75% |
| Standard | 2,000 | $2.99 | ~$1.00 | 67% |
| Pro | 5,000 | $4.99 | ~$2.50 | 50% |
| Unlimited | 20,000 | $9.99 | ~$10 | breakeven |

Cost basis: ~$0.05/100 emails in real inbox mix (70% regex free, 25% Gemini/Groq free, 5% Haiku/Sonnet paid).

**What counts as 1 scan credit:** One email processed through our pipeline. Simple to explain, simple to enforce.

---

## Architecture Decisions

### Free tier — client-side counter (good enough)
- `chrome.storage.local` stores `{ freeScansUsed: number }`
- Before each email in the scan loop, increment counter. At 100 → pause + paywall
- Server does NOT validate free-tier count. Avoids needing a DB for small numbers
- Acceptable: spoofing 100 free scans is low-value abuse

### Paid credits — server-side SQLite (tamper-proof, zero infra)
- JWT gains two new fields: `jti` (UUID, unique per purchase) + `credits_purchased: 500`
- Backend stores `(jti, email, credits_purchased, credits_used)` in `credits.db` (SQLite)
- Each `/parse` call with a credit JWT calls `consume_credit(jti)` → 402 if exhausted
- SQLite survives backend restarts; no Redis/Postgres needed for v1
- Old flat `tier: "paid"` JWTs continue to work as unlimited (backward compat)

### Credit balance in UI — client-side optimistic counter
- At claim time: `chrome.storage.local.license.credits_purchased = 500`, `credits_used = 0`
- Each scan: client increments `credits_used` locally for display
- Server is authoritative: 402 stops the scan if server count diverges
- No balance-refresh API needed for v1

### Success page — chrome-extension:// URL
- Stripe `success_url = chrome-extension://<id>/success.html?session_id=...`
- Extension sends `chrome.runtime.id` to backend when creating checkout
- Backend embeds it in `success_url`
- `success.html` claims JWT, writes to storage, closes tab

---

## Dependency Graph

```
E1 (SQLite credits DB + /parse credit check)      ← backend, no deps
E2 (JWT schema: jti + credits_purchased)          ← depends on E1
E3 (Stripe: 4 packs + checkout/webhook update)    ← depends on E2
E4 (scan.js: free-tier counter)                   ← frontend, no deps
E5 (PaywallModal: pricing grid + balance display) ← depends on E4
E6 (success.html: claim + activate credits)       ← depends on E3 + E5
```

---

## Task List

---

### E1 — Backend: SQLite credit tracking

**Description:** Add `backend/credits_db.py` with a SQLite-backed credit ledger. On each `/parse` call with a `tier: "credits"` JWT, check and decrement credits. 402 if exhausted.

**Acceptance criteria:**
- [ ] `credits_db.py`: `init_db()`, `register_pack(jti, email, credits_purchased)`, `consume_credit(jti) -> bool` (True = ok, False = exhausted), `get_balance(jti) -> dict`
- [ ] `backend/main.py`: calls `init_db()` on startup (creates `credits.db` if missing)
- [ ] `parse.py`: if JWT `tier == "credits"` → `consume_credit(jti)`. If False → 402. Invalid/expired JWT → fall through to free tier (no block).
- [ ] `tier: "paid"` JWTs → skip DB entirely (unlimited, existing behavior)
- [ ] `pytest backend/` passes

**Verification:**
- Manual: `POST /parse` with JWT having `credits_used == credits_purchased` → 402
- Manual: restart uvicorn → credits_used preserved (file persists)
- `pytest backend/` passes

**Files touched:**
- `backend/credits_db.py` (new, ~50 lines)
- `backend/routes/parse.py` (~15 lines)
- `backend/main.py` (~3 lines)

**Estimated scope:** Small

---

### E2 — Backend: JWT schema (jti + credits_purchased)

**Description:** Update `_issue_license()` to accept `credits_purchased` and `jti`. Update `_get_license_tier()` in `parse.py` to decode and return the `jti` alongside the tier for DB lookup.

**Acceptance criteria:**
- [ ] `_issue_license(email, tier, credits_purchased=None, jti=None)` — adds both to payload when provided
- [ ] `_get_license_tier(token)` now returns `(tier, jti, credits_purchased)` tuple instead of just `tier`
- [ ] Old JWTs without `jti` → `jti=None` → treated as unlimited paid
- [ ] `pytest backend/` passes

**Files touched:**
- `backend/routes/payments.py` (~10 lines)
- `backend/routes/parse.py` (~15 lines)

**Estimated scope:** XS

---

### E3 — Backend: Stripe credit pack products

**Description:** Replace `price_type: "onetime"|"monthly"` with `pack: "starter"|"standard"|"pro"|"unlimited"`. Four Stripe products, four env vars. Webhook creates a credit JWT with the right `credits_purchased` and registers it in the DB.

**Acceptance criteria:**
- [ ] `CheckoutRequest` now has `pack: str` and `extension_id: str` (for success URL)
- [ ] Pack → (price env var, credits): `starter→(STRIPE_PRICE_STARTER, 500)`, `standard→(STRIPE_PRICE_STANDARD, 2000)`, `pro→(STRIPE_PRICE_PRO, 5000)`, `unlimited→(STRIPE_PRICE_UNLIMITED, 20000)`
- [ ] `success_url = f"chrome-extension://{req.extension_id}/success.html?session_id={{CHECKOUT_SESSION_ID}}"`
- [ ] Webhook: reads `session.metadata.pack`, maps to credits, calls `_issue_license(email, "credits", credits_purchased=N, jti=str(uuid4()))` and `register_pack(jti, email, N)`
- [ ] `GET /payments/claim/{session_id}` returns `{"token": "...", "credits_purchased": 500, "pack": "starter"}`
- [ ] Old `STRIPE_PRICE_ONETIME` / `STRIPE_PRICE_MONTHLY` env vars removed from code (but document in `.env.example`)

**Files touched:**
- `backend/routes/payments.py` (~60 lines changed)
- `.env.example` (new Stripe env vars)

**Estimated scope:** Small

---

### Checkpoint 1

- [ ] `pytest backend/` passes
- [ ] `POST /parse` with exhausted credit JWT → 402 with clear message
- [ ] `POST /parse` with valid credit JWT → 200, `credits_used` incremented in DB
- [ ] `POST /parse` with old `tier: "paid"` JWT → 200 (unlimited, no DB)
- [ ] Restart uvicorn → credits_used value preserved

---

### E4 — Frontend: scan loop free-tier counter

**Description:** In `scan.js`, track `freeScansUsed` in `chrome.storage.local`. Each email processed increments the counter. When `>= 100` and no credit JWT → throw `ScanCreditError` that pauses the scan.

**Acceptance criteria:**
- [ ] `scan.js`: export `FREE_SCAN_LIMIT = 100`
- [ ] Each call to `processEmail()` (or equivalent inner loop) reads + increments `freeScansUsed` in `chrome.storage.local`
- [ ] When limit hit and `licenseToken` is null or not a credit/paid JWT → emit `{ type: "CREDIT_LIMIT", scansUsed: N }` via the progress callback (or throw a typed error)
- [ ] Paid users (any JWT) → bypass client counter entirely
- [ ] `freeScansUsed` resets to 0 when a credit JWT is successfully activated (on `SET_LICENSE` with `tier: "credits"`)
- [ ] `npm test` — all 158 tests pass (add 2 new tests for the credit limit path)

**Files touched:**
- `extension/src/scan.js` (~30 lines)
- `extension/src/App.jsx` — pass `licenseToken` through `startScanJob` into scan function; handle `CREDIT_LIMIT` progress event → `SHOW_PAYWALL`
- `extension/src/__tests__/scan.test.js` — 2 new test cases

**Estimated scope:** Small

---

### E5 — Frontend: pricing grid + credit balance UI

**Description:** Replace PaywallModal's single "Upgrade" button with a 4-pack grid. Show credit balance in ScanStep for credit users and a free-scan counter for free users.

**Acceptance criteria:**
- [ ] `PaywallModal.jsx`: 4 pack cards with name, price, scan count, and "Buy" button. Clicking calls `createCheckout({ pack, extensionId: chrome.runtime.id })`. Recommended pack highlighted (Standard).
- [ ] Modal trigger message is context-aware: "You've used all 100 free scans" vs "Your credits are exhausted" vs "Upgrade to scan more than 6 months"
- [ ] `ScanStep.jsx`: shows credit line below date range:
  - Free user: `"📧 X of 100 free scans used"` (reads from `chrome.storage.local.freeScansUsed`)
  - Credit user: `"💳 N scans remaining"` (from `state.license.credits_remaining`)
- [ ] `state.license` now stores `{ tier, token, credits_purchased, credits_used }`. `credits_remaining` = `credits_purchased - credits_used`
- [ ] Each email scan dispatches `INCREMENT_CREDITS_USED` which increments `state.license.credits_used` and persists to `chrome.storage.local`
- [ ] `createCheckout` in `api.js` updated to accept `{ pack, extensionId }` instead of `{ price_type }`

**Files touched:**
- `extension/src/components/PaywallModal.jsx` (~60 lines changed)
- `extension/src/components/ScanStep.jsx` (~20 lines)
- `extension/src/App.jsx` — reducer cases `INCREMENT_CREDITS_USED`, updated `SET_LICENSE`
- `extension/src/api.js` — `createCheckout` signature update

**Estimated scope:** Medium

---

### E6 — Frontend: success.html credit activation page

**Description:** Add `success.html` to the extension that Stripe redirects to after purchase. It claims the JWT from the backend, writes it to storage, and closes itself.

**Acceptance criteria:**
- [ ] `extension/public/success.html`: minimal HTML page with a spinner and status message
- [ ] `extension/src/success.js`: reads `session_id` from `?session_id=...` URL param → `GET /payments/claim/{session_id}` → writes `{ license: { tier: "credits", token, credits_purchased, credits_used: 0, pack } }` to `chrome.storage.local` → closes tab after 2s
- [ ] If `session_id` missing or claim fails → shows "Activation failed — contact support@triptrace.app" (does not crash)
- [ ] If page is opened in a normal browser (no `chrome.storage`) → shows "Please open this in the TripTrace extension"
- [ ] `manifest.json`: add `success.html` as an entry point (in `web_accessible_resources` if needed, but chrome-extension:// pages don't need it)
- [ ] `vite.config.js`: add `success` as a second build entry point

**Files touched:**
- `extension/public/success.html` (new)
- `extension/src/success.js` (new)
- `extension/public/manifest.json` — add success.html reference if needed
- `extension/vite.config.js` — second entry point

**Estimated scope:** Small (2 new files, ~60 lines)

---

### Checkpoint 2 (Final)

- [ ] `pytest backend/` passes
- [ ] `npm test` — 160+ tests pass
- [ ] `npm run build` — success.html appears in `dist/`
- [ ] End-to-end (test mode): install → scan 100 emails → paywall opens → buy Starter → success.html activates 500 credits → ScanStep shows "500 scans remaining" → scan 50 more emails → balance shows "450 remaining"
- [ ] Backend restart → balance preserved
- [ ] Old paid JWT still grants unlimited access

---

## Open Questions (resolve before E6)

1. **Extension ID in checkout**: Frontend sends `chrome.runtime.id` in checkout request. Does this work from within the extension popup? Yes — `chrome.runtime.id` is available in all extension contexts including the sidepanel.

2. **Credit balance sync**: Client increments `credits_used` locally per scan. Server may diverge if a scan errors mid-way. Is this ok? Yes for v1 — server 402 is the hard stop. Local counter is display only.

3. **What triggers the paywall?**
   - Free tier: `freeScansUsed >= 100` (client-side, before scan starts email)
   - Credits: backend 402 (during scan, after email is processed)
   - Both: `SHOW_PAYWALL` dispatch with a context message

4. **Unlimited pack ceiling**: 20,000 emails sounds like "unlimited" to most users. But a truly unlimited pack could be a liability. Keep the 20,000 cap server-side; market it as "Unlimited" since 99% of users will never hit 20k flight emails.

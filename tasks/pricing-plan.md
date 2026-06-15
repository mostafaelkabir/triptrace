# TripTrace — Pricing Plan (Period-Based)

## The user's situation

A person filing N-400 needs one thing: their complete travel history for the last 5 years. They have no idea how many emails they have. They don't care. They just want the list of trips. Price-per-email creates anxiety and confusion. Period-based pricing speaks directly to what they came for.

**Typical user:**
- 1–2 email accounts (usually Gmail personal + maybe Outlook work)
- 50–200 flight confirmation emails over 5 years
- Filing N-400 once — they will never come back
- Willing to pay for the exact outcome they need, not a subscription

---

## Pricing Model: Period × Connection

### Dead-simple user-facing model

| Option | What they get | Price |
|---|---|---|
| **Free** | Last 6 months, 1 account | $0 — always |
| **Full History** | Last 5 years, 1 account | **$4.99** one-time |
| **+ Add Account** | Same 5-year range, 1 more account | **+$1.99** |

That's it. Three lines. User understands immediately:

> *"Try it free for the last 6 months. If you want your full 5-year history for N-400, it's $4.99. Have Gmail AND Outlook? Add the second account for $1.99."*

### Why these numbers

| Scenario | Our cost | Revenue | Margin |
|---|---|---|---|
| Free (6 months) | ~$0.02 | $0 | — |
| Full History (5 years, 1 account) | ~$0.20 | $4.99 | **96%** |
| + Second account (5 years) | ~$0.20 | $1.99 | **90%** |
| Both accounts | ~$0.40 | $6.98 | **94%** |

We can afford to price $4.99 because our real AI cost for a 5-year scan is well under $0.25.

### Why NOT per-email credits
- Users don't know how many emails they have
- "Do I need 500 or 2000 credits?" creates decision paralysis
- N-400 is a one-time thing — credits suggest ongoing usage
- Period-based maps directly to what USCIS asks for ("last 5 years")

### Why NOT a monthly subscription
- N-400 filers don't need TripTrace every month
- Subscription churn = refund requests when people forget to cancel
- One-time payment matches the one-time use case perfectly

---

## What "6 months free" gives the user
- They see their most recent 3–8 trips (enough to understand the product)
- They see any upcoming trip from the current period
- The natural paywall moment: "Your N-400 needs 5 years — unlock the rest for $4.99"
- No credit card required to try

## What the $4.99 pass covers
- 5-year scan of **one** email account (Gmail OR Outlook)
- JWT valid for 12 months (in case they want to re-scan with new emails)
- No email count limit — scan everything in that period
- The backend enforces a 15k email soft-cap (invisible, only relevant for truly extreme inboxes)

## What the +$1.99 add-on covers
- A second email account, same 5-year range
- Bought separately when the user connects their second account
- If they only have one account, they never see this option

---

## Implementation: What Changes

### Current state (already built)
- Free = last 6 months date range enforced in ScanStep (`getFreeMonthsCutoff()`)
- Paid (`isUnlocked = true`) = full date range, user chooses start date
- JWT has `tier: "paid"` → `isUnlocked` becomes true

### What needs to change

**1. JWT gains `months_allowed` field**
- Free: no JWT, frontend enforces 6-month cap
- Full History: JWT `{ tier: "paid", months_allowed: 60 }` → 5 years
- Add-on: same JWT type, but the second purchase is tracked by account type in JWT

**2. ScanStep enforces date cap from JWT**
- Currently: `effectiveStartDate = isUnlocked ? startDate : getFreeMonthsCutoff()`  
- New: `effectiveStartDate = max(today - months_allowed, user_selected_start)`
- For paid pass: `months_allowed = 60`, so user can go back 5 years
- Free: `months_allowed = 6` (same behavior as today)

**3. Paywall trigger: user drags date back**
- If user tries to set `startDate` beyond their allowed range → show paywall inline
- Clear message: "Your free plan covers the last 6 months. Unlock 5 years for $4.99."
- The paywall opens exactly when the user hits the limit — perfect moment of intent

**4. Second account paywall**
- When user connects a second account in ScanStep, check if they have a pass for it
- Store which account types the JWT covers: `accounts_covered: ["gmail"]` or `["gmail","outlook"]`
- If second account not covered → small inline card: "Add Outlook scan for $1.99 →"

**5. Two Stripe products (not five)**
- `STRIPE_PRICE_FULLHISTORY` — $4.99 one-time ("Full History Pass")
- `STRIPE_PRICE_ADDACCOUNT` — $1.99 one-time ("Add Account")

---

## Dependency Graph

```
P1 (JWT: months_allowed + accounts_covered)    ← backend, no deps
P2 (ScanStep: date range enforced by JWT)       ← frontend, no deps (uses existing isUnlocked path)
P3 (PaywallModal: period-based copy + 1 CTA)   ← depends on P2
P4 (Second account paywall: +$1.99 inline)     ← depends on P3
P5 (Stripe: 2 products + webhook update)        ← depends on P1
```

---

## Task List

---

### P1 — JWT schema: months_allowed + accounts_covered

**Description:** Update `_issue_license()` to embed `months_allowed: 60` and `accounts_covered: ["gmail"]` in the JWT. The `_get_license_tier()` decoder returns these alongside tier. The frontend reads them and enforces the date cap.

**Acceptance criteria:**
- [ ] `_issue_license(email, tier, months_allowed=60, accounts_covered=None)` — both fields in JWT payload
- [ ] `license/verify` endpoint returns `{ valid, tier, months_allowed, accounts_covered }` in response
- [ ] Old flat JWTs without these fields → backend defaults: `months_allowed=60`, `accounts_covered=["gmail","outlook"]` (backward compat)
- [ ] `pytest backend/` passes

**Files:**
- `backend/routes/payments.py` — `_issue_license()` updated
- `backend/routes/license.py` — verify response includes new fields

**Scope:** XS (~20 lines)

---

### P2 — ScanStep: date range enforcement from JWT

**Description:** Replace the binary `isUnlocked` flag with `monthsAllowed` (6 for free, 60 for paid). The effective start date is enforced as `today - monthsAllowed` regardless of what the user picks. Attempting to set an earlier date shows an inline prompt: "Unlock 5 years for $4.99 →".

**Acceptance criteria:**
- [ ] `ScanStep` receives `monthsAllowed` prop (default 6 for free users)
- [ ] `effectiveStartDate = max(user_selected_start, today - monthsAllowed_months)`
- [ ] Date input `min` attribute = today minus `monthsAllowed` months (prevents user from even picking earlier)
- [ ] Below the date range: free users see `"Free plan: last 6 months · Unlock 5 years for $4.99 →"` (clicking dispatches `SHOW_PAYWALL`)
- [ ] Paid users see `"✓ Full history unlocked (last 5 years)"` 
- [ ] `isUnlocked` prop retained for other downstream uses (AI features, export)

**Files:**
- `extension/src/components/ScanStep.jsx` — date enforcement + inline CTA
- `extension/src/App.jsx` — compute `monthsAllowed` from `state.license?.months_allowed ?? 6` and pass to ScanStep

**Scope:** Small (~30 lines)

---

### P3 — PaywallModal: period-based copy, single CTA

**Description:** The current paywall has two options ($4.99 one-time / monthly). Replace with a single focused CTA: "Unlock 5-year history — $4.99". Secondary link: "Already have a pass? Contact us." No subscription option — it's wrong for this use case.

**Acceptance criteria:**
- [ ] Single primary button: "Unlock Full 5-Year History — $4.99" → calls `createCheckout("fullhistory", extensionId)`
- [ ] Subtext: "One-time payment · No subscription · 12-month license"
- [ ] Context-aware headline: 
  - `reason="date-range"` → "Unlock your full 5-year travel history"
  - `reason="exhausted"` → "Your scan pass has been fully used"
  - `reason="trip-limit"` → "You've seen your free preview"
- [ ] "Continue with free plan (last 6 months)" dismiss link
- [ ] No monthly/subscription option shown

**Files:**
- `extension/src/components/PaywallModal.jsx` — simplified to 1 CTA

**Scope:** Small (~40 lines)

---

### P4 — Second account: inline +$1.99 prompt

**Description:** When a user has a paid pass for Gmail and clicks "Connect & scan Outlook too" (the card added in a previous session), check if `accounts_covered` includes outlook. If not, replace the connect button with: "Add Outlook scan (+$1.99) →" button that goes straight to checkout. After purchase and activation, the scan starts automatically.

**Acceptance criteria:**
- [ ] `ScanStep` receives `accountsCovered: string[]` prop (from JWT, or `[]` for free)
- [ ] The "also scan other provider" card shows "Connect free" if not yet connected, OR "Add [Provider] — $1.99" if user has a pass that doesn't cover it
- [ ] Clicking "Add [Provider] — $1.99" → calls `createCheckout("addaccount", extensionId)` → opens Stripe
- [ ] After `success.html` activates the add-on JWT, `accountsCovered` updates to include the new provider → the connect button becomes a normal connect flow
- [ ] If user has no paid pass at all → clicking "also scan" shows the full $4.99 paywall first (the add-on doesn't make sense without the base pass)

**Files:**
- `extension/src/components/ScanStep.jsx` — conditional button in secondary account card
- `extension/src/App.jsx` — pass `accountsCovered` from `state.license?.accounts_covered ?? []`
- `extension/src/api.js` — `createCheckout` already accepts pack name, no change needed

**Scope:** Small (~25 lines)

---

### P5 — Stripe: 2 products + backend update

**Description:** Simplify payments.py to two products: `fullhistory` ($4.99, 60 months) and `addaccount` ($1.99, 60 months for secondary account). Remove the 5-pack credit system from the previous phase. Webhook issues a JWT with `months_allowed: 60` and `accounts_covered` set appropriately per pack.

**Acceptance criteria:**
- [ ] `PACKS` in `payments.py` simplified to 2 entries: `fullhistory` and `addaccount`
- [ ] `fullhistory` webhook → JWT `{ tier:"paid", months_allowed:60, accounts_covered:["gmail","outlook"] }` (covers both — user paid for the history, not the account type)
- [ ] `addaccount` webhook → also produces `{ tier:"paid", months_allowed:60, accounts_covered:["gmail","outlook"] }` — same JWT, just cheaper because the base pass is already in place. The distinction is marketing, not technical.
- [ ] Env vars: `STRIPE_PRICE_FULLHISTORY`, `STRIPE_PRICE_ADDACCOUNT`
- [ ] Old credit pack env vars (`STRIPE_PRICE_STARTER` etc.) removed from code (can leave in `.env.example` with comments)
- [ ] `pytest backend/` passes

**Files:**
- `backend/routes/payments.py` — PACKS simplified to 2
- `.env.example` — updated

**Scope:** Small (~30 lines changed)

---

### Checkpoint (Final)

- [ ] `pytest backend/` passes
- [ ] `npm test` — 158+ tests pass
- [ ] `npm run build` succeeds
- [ ] Free user: date range capped at 6 months; trying to go earlier shows paywall
- [ ] Paid user: date range shows full 5 years; "✓ Full history unlocked"  
- [ ] PaywallModal shows single CTA with period-based copy
- [ ] Stripe test checkout for `fullhistory` → success.html activates → ScanStep shows 5-year range

---

## What the user experiences (end-to-end)

```
Install extension
    ↓
Connect Gmail  →  [free scan, last 6 months]  →  "Found 4 trips"
    ↓
"I need 5 years for my N-400..."
    ↓
Clicks "From" date → sets it to 5 years ago
    ↓
[Inline prompt]: "Unlock your full 5-year history — $4.99 →"
    ↓
Clicks → Stripe checkout → pays $4.99
    ↓
success.html activates pass → tab closes
    ↓
ScanStep now shows ✓ Full history unlocked · Full 5 years available
    ↓
User clicks Start Scan → finds all 47 trips
    ↓
[optional] User has Outlook too
    ↓
"Also scan Outlook" card → "Add Outlook scan (+$1.99)"  
[but since fullhistory covers both accounts, this is actually FREE for them — skip the $1.99]
```

**Note on the add-account price:** Since `fullhistory` covers both Gmail and Outlook in the JWT, the +$1.99 "add account" only applies if a user bought the `addaccount` pack separately (e.g., they have only a work Outlook account and previously just bought that). In practice, the simplest behavior is: **one $4.99 purchase = scan everything** — all accounts, 5 years. The +$1.99 "add account" product exists for the rare edge case but the primary CTA should always be the $4.99 full pass.

---

## Open questions (for you to decide before implementation)

**Q1: Does $4.99 cover both Gmail AND Outlook, or just one account?**

Recommendation: **Cover both**. One payment, no per-account counting. The user doesn't think in terms of "accounts" — they think "I want all my trips." Trying to charge $1.99 more for the second account adds friction and reduces conversion. The extra $1.99 revenue is not worth the mental complexity.

If you want to keep per-account pricing: the +$1.99 add-on stays, and `accounts_covered` in the JWT gates it. But this complicates the UX.

**Q2: Should the JWT last 12 months or forever?**

Recommendation: **12 months** — so if a user comes back next year to file a renewal or assist a family member, they need to buy again. Keeps revenue recurring without being a subscription. 

**Q3: Free plan — 6 months only, or also limit to N trips?**

Current code limits to both 6 months AND 10 trips (whichever comes first). 

Recommendation: **Remove the trip limit, keep only the date limit.** If someone has 15 trips in the last 6 months, they should see all 15 — it makes the product look more powerful and the $4.99 upgrade is obvious. The trip limit creates confusion ("why can't I see trip 11?").

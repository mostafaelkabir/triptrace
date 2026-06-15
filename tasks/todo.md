# TripTrace — Task List

## Pricing Plan (period-based) — current

- [ ] P1 — JWT: add months_allowed + accounts_covered fields
- [ ] P2 — ScanStep: enforce date range from JWT (monthsAllowed prop)
- [ ] P3 — PaywallModal: single CTA, period-based copy, no subscription
- [ ] P4 — Second account: inline +$1.99 prompt (if keeping per-account pricing)
- [ ] P5 — Stripe: simplify to 2 products (fullhistory + addaccount)

---

## Accuracy Plan — Four-Gate Pipeline (see tasks/accuracy-plan.md)

### Phase A — Regex layer (no LLM cost)
- [x] ACC-3 — Expand IATA map: Africa, South Asia, SE Asia, Latin America gaps
- [x] ACC-1 — Forwarded email re-sender detection → fixes last failing fixture (engine.js)
- [x] ACC-2 — Wire originIATA → origin_country, remove "United States" hardcode
- **Checkpoint A: `npm run eval` → 45/45**

### Phase B — Classifier hardening (Gate 2)
- [x] ACC-C2 — Enrich CLASSIFY_PROMPT with 7 more examples (edge cases)
- [x] ACC-C1 — Dual-classifier ensemble: Gemini + Haiku for uncertain cases

### Phase C — Extractor upgrade (Gate 3)
- [x] ACC-E1 — Promote Claude Sonnet to primary extractor (remove Haiku-first)
- [x] ACC-E2 — Structured tool_use output with JSON schema + per-field confidence
- [x] ACC-E3 — Add origin_country derivation to EXTRACT_PROMPT
- [x] ACC-E4 — Multi-leg instruction: one trip object per leg, correct origins
- **Checkpoint B: full-stack eval 45/45, field_confidence present, no JSON errors**

### Phase D — Cross-validation (Gate 4)
- [x] ACC-V1 — Trigger verify pass on low field_confidence (not just null fields)
- [x] ACC-V2 — Date sanity check: flag/null impossible years (>today+2 or <today-10)
- [x] ACC-V3 — _needs_review flag: set when fields still null after verify

### Phase E — Human review queue (UI)
- [x] ACC-H1 — "Needs Review" amber badge + inline edit pre-fill in ReviewTable
- [x] ACC-H2 — Collapsible email snippet preview for flagged trips
- **Checkpoint E: end-to-end with 5 real user emails that previously had errors**

### Phase F — Eval growth
- [x] ACC-F1 — 15 new eval fixtures (connections, codeshare, budget, non-flights)

---

## Backlog

- [ ] T2  Deploy backend to Railway/Render — MANUAL STEP
- [ ] T4  Onboarding hero section on ConnectStep
- [ ] T5  N-400 Part 9 print view (MM/DD/YYYY, print-ready HTML)
- [ ] T6  Days abroad validation + N-400 summary block (total days, >6mo flag)
- [ ] T7  Chrome Web Store listing (assets, description, privacy policy)

# Session Handoff

**Last revised:** 18 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.18), `ARCHITECTURE.md` (1.12), `DESIGN.md` (1.2),
`ROADMAP.md` (1.21), and `QUESTIONS.md` (1.24).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Onboarding begins 19 October 2026.** Items 44 and 53 are live on Neon and
  pushed (NIN and photograph; free stickers, designations, go-live date).
- **Item 45 (SMS through Termii, PRD 1.18) is built and clicked through,
  committed locally, not released.** Off until switched on in Payments →
  Messages. **Release order:** migration `20261018150000_sms_messages` on Neon
  before the code, because confirming a payment now writes to `sms_message`.
  Then `TERMII_API_KEY`, `TERMII_BASE_URL`, `TERMII_SECRET_KEY` on Render.
- Items 50 and 51 wait on PAY-27's Paystack test, GOV-08, and CARD-09.

Tests: domain 540, contracts 154, api 199, web 88; e2e 547 of 547.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07,
  GOV-18, and GOV-08 are open. The owner's call, recorded.
- **The live API sleeps on Render** (GOV-02).
- Items 46 to 52 change the PRD; MEM-19, ORG-08, CARD-09, CARD-10 block them.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Paystack live works (18 October): a ₦511 test split ₦500 to NURTW.
  Never tried: a payment through the live API, a phone's camera, real Termii.

## Next steps

1. Ask the owner when to release item 45 (recommended: after onboarding day).
2. Owner: Termii's sender name "NURTW" and DND route; the Termii keys on
   Render; the delivery-report address in Termii (`OPERATIONS.md`, "Text
   messages to members"); a test message, then switch on.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Add an SMS placeholder for anything sensitive, or store a whole number.
- Add, rename, or reorder a designation from code again.
- Put a sign-in button's reset back in a `finally`.

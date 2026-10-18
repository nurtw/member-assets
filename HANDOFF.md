# Session Handoff

**Last revised:** 18 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.17), `ARCHITECTURE.md` (1.11), `DESIGN.md` (1.2),
`ROADMAP.md` (1.20), and `QUESTIONS.md` (1.23).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Onboarding begins 19 October 2026.** Item 44 (NIN and photograph) is live:
  migrated to Neon and pushed.
- **Item 53 (onboarding day, PRD 1.17) is done and clicked through:** free
  stickers (VEH-37), the Union's designations (ORG-06), and the go-live date
  (GOV-11). Release on Neon: migration `20261018120000_union_designations`,
  then the push, then the date (`OPERATIONS.md`, "Setting the go-live date")
  and both sticker fees at ₦0 on the Fees screen.
- Items 50 and 51 (the park plan's accounts and card) wait on PAY-27's
  Paystack test, GOV-08, and CARD-09. Item 45 is next after them.

Tests: domain 522, contracts 149, api 199, web 84; e2e 529 of 529.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07,
  GOV-18, and GOV-08 are open. The owner's call, recorded.
- **Only 2 officer accounts on Neon, 1 sticker in stock.** Officers and stock
  are the owner's to add before onboarding.
- **The live API sleeps on Render** (GOV-02).
- Items 45 to 52 change the PRD; MEM-19, ORG-08, CARD-09, CARD-10 block them.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: Paystack, a phone's camera, the site as deployed.

## Next steps

1. Release item 53 on Neon as above, once the owner says so.
2. Owner, before onboarding: `IDENTITY_ENCRYPTION_KEY` on Render; officer
   accounts and roles; scan stickers into stock; try a phone's camera on the
   live site; one real payment (the yearly fee) to prove Paystack.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Add, rename, or reorder a designation from code again.
- Put a sign-in button's reset back in a `finally`.

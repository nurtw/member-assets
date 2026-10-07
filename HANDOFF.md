# Session Handoff

**Last revised:** 7 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.12), `ARCHITECTURE.md` (1.10), `DESIGN.md` (1.2),
`ROADMAP.md` (1.16), and `QUESTIONS.md` (1.16).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is being built.** Item 37 (the member register) is done and
  clicked through. Its commit is local; the plans (`f998b19`) are pushed.
- **Items 38 to 40 are planned and wait for the owner.** The owner agreed
  plan 40's change to who may upload a signature.
- Item 37 needs no migration. Neon has all 28, and the seed.
- Item 15 waits too.
- `auth.mfa_enforced` and `dues.go_live_date` stay off until go-live.

Tests: domain 518, contracts 138, api 195, web 31; e2e 497 of 498.

## Conflicts

- **Nothing amends a migrated member's details** (the amend route is the
  application's). No item covers it.
- **VEH-32 is open** (a second officer for stock). Do not build one.
- The public sticker page waits on GOV-08. Signed stickers stay paused.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password unit tests time out;
  `pay-links.e2e` can fail across an hour boundary: rerun.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: a Paystack payment, a phone's camera.

## Next steps

1. Ask the owner whether to push item 37, and which of 38 to 40 is next
   (38 is recommended).
2. Owner: VEH-32; the settlement account; GOV-08; EXT-05; the GOV-11
   date; PAY-11; ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon legacy rows, or push without a go-ahead.
- Invent a branch, a designation, or a signature (ORG-05, ORG-06, CARD-07).
- Widen a part of a member's record, or add contact data to the list.
- Put `sticker.stock_intake` in a role, or a barcode in a URL.
- Let a payment check close a payment.
- Let a public pay route read dues, or add a search to the front page.
- Add a write, or a personal-data field, to `src/verification/`.

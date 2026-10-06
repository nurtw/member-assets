# Session Handoff

**Last revised:** 6 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.12), `ARCHITECTURE.md` (1.9), `DESIGN.md` (1.2),
`ROADMAP.md`, and `QUESTIONS.md` (1.16).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is in progress.** Items 27, 34, 35, and 36 are done.
- Pushed through `5a18104` (item 27). Item 34's last two commits are local.
- Neon has all 28 migrations and the seed (6 October).
- **Item 34 done:** every signed-in screen is on the shared patterns
  (`DESIGN.md` §10). `plans/34` holds the checklist, screen by screen.
- Item 15 (go-live hardening) is planned and waits for the owner.
- `auth.mfa_enforced` and `dues.go_live_date` stay off until go-live.

Tests: domain 518, contracts 132, api 195, web 29; e2e 491 of 492.

## Conflicts

- **VEH-32 is open** (a second officer for stock). Do not build one.
- The public sticker page waits on GOV-08. Signed stickers stay paused.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e transactions and the PDF and password unit tests time
  out; `pay-links.e2e` can fail across an hour boundary. Rerun it.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- `GET /payments/banks` answers 500, not 503, when Paystack is
  unreachable. The screen explains it. For item 15.
- Never tried for real: a Paystack payment, a phone's camera.

## Next steps

1. Push, once the owner agrees.
2. Ask the owner what is next: item 15, or one of the screens `plans/34`
   lists as out of scope (the Union's structure, master data, officer
   signatures, a member list).
3. Owner: VEH-32; the settlement account; GOV-08; EXT-05; the GOV-11
   date; PAY-11; ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon legacy rows, or push without a go-ahead.
- Put `sticker.stock_intake` in a role, or a barcode in a URL.
- Let a payment check close a payment: it only ever confirms.
- Let a public pay route read dues, or add a search to the front page.
- Add a write, or a personal-data field, to `src/verification/`.
- Select a token hash, password hash, or MFA secret into a response.

# Session Handoff

**Last revised:** 6 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.12), `ARCHITECTURE.md` (1.9), `DESIGN.md` (1.2),
`ROADMAP.md`, `QUESTIONS.md` (1.16), then `plans/34`.

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- Pushed through item 27. Neon has all 28 migrations and the seed (6 Oct).
- **Item 36 done:** the previous operator's name is out of every file.
- **Item 27 done:** sticker stock by scanning; assigning a sticker is pay,
  scan, confirm (VEH-29, VEH-31; PRD 1.12).
- **In progress: item 34.** Done: the kit, the lists, Home, the front page.
  `plans/34` lists the screens still to move.
- Item 15 waits. `auth.mfa_enforced` and `dues.go_live_date` stay off.

Tests: domain 518, contracts 132, api 195, web 29.

## Conflicts

- **VEH-32 is open** (a second officer for stock). Do not build one.
- The public sticker page waits on GOV-08. Signed stickers stay paused.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e transactions and the PDF and password unit tests time
  out; `pay-links.e2e` can fail across an hour boundary. Rerun it.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- Item 27 was clicked through with stand-ins for Paystack and the camera.

## Next steps

1. Carry on with item 34 (`plans/34`, "Still to do").
2. Push, once the owner agrees.
3. Owner: VEH-32; the settlement account; GOV-08; EXT-05; the GOV-11
   date; PAY-11; ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon legacy rows, or push without a go-ahead.
- Put `sticker.stock_intake` in a role, or a barcode in a URL.
- Let a payment check close a payment: it only ever confirms.
- Let a public pay route read dues, or add a search to the front page.
- Add a write, or a personal-data field, to `src/verification/`.
- Select a token hash, password hash, or MFA secret into a response.

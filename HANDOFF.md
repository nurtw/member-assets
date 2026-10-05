# Session Handoff

**Last revised:** 5 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.11), `ARCHITECTURE.md` (1.8), `DESIGN.md` (1.1),
`ROADMAP.md`, `QUESTIONS.md` (1.15), then `plans/34`.

Two rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Pushed through `c2665d0` (items 32, 35, and 33).
- **Item 33 done:** an Organisations page, and personal invite links
  (EXT-21). Its migration is on Neon (26, no drift).
- **In progress: item 34** (every screen restructured). Stage 1 is
  committed: the kit, Overview, the lists, and the settings headers.
- Item 15 waits; 27 is deferred. `auth.mfa_enforced` and
  `dues.go_live_date` stay off until go-live.

Tests: domain 480, contracts 118, api 192, web 28; e2e 462/463 (`DEMO_`).

## Conflicts

- **VEH-29 (item 27, deferred)** conflicts with PRD §23.19. Do not build.
- **The public sticker page (PRD §23.13) is not built.** It waits on GOV-08.
- New stickers are paused (VEH-20): `NEW_STICKERS_IN_USE` stays false until
  the owner lifts it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e transactions and the PDF and password unit tests time
  out; `pay-links.e2e` can fail across an hour boundary. Rerun that file.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- Run Prisma from `apps/api` with `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs): use the Edit tool or Python bytes.
- Click through on your own ports: the owner's dev API writes to Neon.

## Next steps

1. Carry on with item 34 (`plans/34-screen-restructure.md`).
2. Push, once the owner agrees.
3. Owner: the settlement account (Payments → Settlement); GOV-08; EXT-05;
   the GOV-11 date; PAY-11; ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon legacy rows, or push without a go-ahead.
- Use a raw colour class in the web app (see `CLAUDE.md`).
- Let an invitation skip the applicant's confirmation or a limit, or put
  its code in an audit event.
- Give a portal account a permission, or return a withheld reason from a
  portal route.
- Let a public pay route read dues, or leave a failed payment `PENDING`.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, `passwordHash`, an MFA secret, or the
  `settlement_account` row into a response.

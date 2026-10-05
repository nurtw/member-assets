# Session Handoff

**Last revised:** 5 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.10), `ARCHITECTURE.md` (1.7), `DESIGN.md` (1.1),
`ROADMAP.md`, `QUESTIONS.md` (1.13), then `plans/35`.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Pushed through `688f62a`. Committed locally since: the plans for items 32
  to 34, and item 32.
- **Item 32 done:** sidebar shell, Light, Dark, and System, every colour a
  token. Clicked through in both themes.
- **Next, in the owner's order, each on their go-ahead:** 35 (sticker
  prompt, VEH-30), 33 (Organisations, EXT-21), 34 (every screen).
- Item 15 waits; 27 is deferred. Off until go-live: `auth.mfa_enforced`
  (GOV-18), `dues.go_live_date` (GOV-11).

Tests: domain 469, contracts 113, api 191, web 25; e2e 452/453 (`DEMO_`).

## Conflicts

- **VEH-29 (item 27, deferred)** conflicts with PRD §23.19. Do not build it.
- **The public sticker page (PRD §23.13) is not built.** It waits on GOV-08.
- New stickers are paused (VEH-20): item 35 charges nothing for a vehicle
  with no barcode on the register.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- A full e2e run may time out a transaction: rerun that suite.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- Run Prisma from `apps/api` with `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs): use the Edit tool or Python bytes. Long
  inline scripts fail in Git Bash: write a file, then run it.
- The owner's `pnpm dev` (3000, 3001) writes to Neon: click through on
  your own ports (`CLAUDE.md`).

## Next steps

1. Push, once the owner agrees.
2. Item 35 (`plans/35-sticker-prompt.md`), once the owner agrees.
3. Owner: the settlement account (Payments → Settlement); GOV-08; EXT-05;
   the GOV-11 date; PAY-11; ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon legacy rows, or push without a go-ahead.
- Use a raw colour class in the web app (`CLAUDE.md`, "The shell and themes").
- Give a portal account a permission, or return a withheld reason from a
  portal route.
- Let a public pay route read dues, or leave a failed payment `PENDING`.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, `passwordHash`, an MFA secret, or the
  `settlement_account` row into a response.

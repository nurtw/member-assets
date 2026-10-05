# Session Handoff

**Last revised:** 5 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.11), `ARCHITECTURE.md` (1.7), `DESIGN.md` (1.1),
`ROADMAP.md`, `QUESTIONS.md` (1.14), then `plans/33`.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Pushed through `f7fb6a9` (item 32: sidebar shell, Light, Dark, and
  System). Item 35 is committed locally; check `git status`.
- **Item 35 done:** a banner on every vehicle without a sticker, and a prompt
  after adding one; nothing charged where no sticker can be given (VEH-30).
- **Next, in the owner's order, each on their go-ahead:** 33 (Organisations
  and invite links, EXT-21), then 34 (every screen).
- Item 15 waits; 27 is deferred. Off until go-live: `auth.mfa_enforced`,
  `dues.go_live_date`.

Tests: domain 475, contracts 113, api 191, web 25; e2e 452/453 (`DEMO_`).

## Conflicts

- **VEH-29 (item 27, deferred)** conflicts with PRD §23.19. Do not build it.
- **The public sticker page (PRD §23.13) is not built.** It waits on GOV-08.
- New stickers are paused (VEH-20): `NEW_STICKERS_IN_USE` in `@nurtw/domain`
  stays false until the owner lifts it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- A full e2e run may time out: rerun that suite.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- Run Prisma from `apps/api` with `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs): use the Edit tool or Python bytes. Long
  inline scripts fail in Git Bash: write a file, then run it.
- The owner's `pnpm dev` (3000, 3001) writes to Neon: click through on
  your own ports (`CLAUDE.md`).

## Next steps

1. Push, once the owner agrees.
2. Item 33 (`plans/33-organisations-and-invitations.md`), once the owner agrees.
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

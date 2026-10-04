# Session Handoff

**Last revised:** 4 October 2026

> Cold-start contract for a Claude with no prior context. Overwritten every
> session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.8), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/28` and `plans/15`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Item 28, officer accounts and multi-factor sign-in, is done and pushed**
  (`0e577f8`, `plans/28`). Migrated locally and on Neon, no drift.
- The second-factor requirement (`auth.mfa_enforced`) ships **off**.
  Requirement 17.1 is not met until it is on (GOV-18).
- Left: item 15 (go-live hardening, planned in `plans/15`). The owner paused
  before it on 5 October 2026; do not start it without a go-ahead. 27 is
  deferred.
- Browser checks skipped, per the owner. `dues.go_live_date` is unset.

Tests: domain 453, contracts 94, api 183; e2e 393/394 (the `DEMO_` test);
web clean.

## Conflicts

- **VEH-29 (item 27, deferred)**, adding Transpay stickers by scanning,
  conflicts with PRD §23.19. Do not build it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- The full e2e run can time out a transaction on this machine. Rerun the
  failing suite alone first.
- `ECONNREFUSED` on 5433: Docker Desktop stopped. Start it
  (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), then
  `docker compose up -d`.
- Run Prisma from `apps/api`: `node node_modules/prisma/build/index.js`, with
  `CHECKPOINT_DISABLE=1`. Neon may need a retry while it wakes.
- CRLF files (most root docs, `seed.ts`, `app.module.ts`): edit with the Edit
  tool or Python bytes.

## Next steps

1. Item 15, once the owner agrees: `plans/15`, engineering parts first.
2. Owner: GOV-18 (set `MFA_ENCRYPTION_KEY`, enrol, turn the requirement on),
   EXT-05, EXT-08, EXT-12, EXT-13, EXT-17, GOV-08, GOV-11, PAY-11, PAY-20.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`,
  or mention declaration in any external answer.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, `passwordHash`, or an MFA secret into a response, or
  log a token, password, or code.
- Put `vehicle.declare` or `payment.manage_settlement` in a role, or describe
  Requirement 17.1 as met while the requirement is off.
- Default the go-live date, or let dues reach any external response.

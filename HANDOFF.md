# Session Handoff

**Last revised:** 4 October 2026

> Cold-start contract for a Claude with no prior context. Overwritten every
> session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.7), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/14`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Item 13 is pushed (`2adf4de`).
- **Item 14, vehicle totals, is built** (`plans/14`). Migrated locally and
  on Neon, no drift. Committed; **not pushed** until the owner agrees.
- Left: item 15 (go-live hardening); 27 is deferred.
- Browser checks skipped, per the owner. `dues.go_live_date` is unset.

Tests: domain 442, contracts 84, api 160; e2e 364/365 (the `DEMO_` test);
web clean.

## Conflicts

- **VEH-29 (item 27, deferred)**, adding Transpay stickers by scanning,
  conflicts with PRD §23.19. Do not build it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- The full e2e run can time out starting a transaction on this machine.
  Rerun the failing suite alone before suspecting the code.
- `ECONNREFUSED` on 5433: Docker Desktop stopped. Start it
  (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), then
  `docker compose up -d`.
- Run Prisma from `apps/api`: `node node_modules/prisma/build/index.js`, with
  `CHECKPOINT_DISABLE=1`. Neon may need a retry while it wakes.
- CRLF files (most root docs, `seed.ts`, `app.module.ts`): edit with the Edit
  tool or Python bytes.

## Next steps

1. Push `main` once the owner agrees.
2. Item 15, go-live hardening (PRD §17, §21). Much of it needs owner input.
3. Owner: EXT-05, EXT-08, EXT-12, EXT-13, EXT-17, GOV-08, GOV-11, PAY-11,
   PAY-20.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`,
  or mention declaration in any external answer.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, or log a token, its hash, or a looked-up identifier.
- Add a limit as a constant, or touch rate-limit counters outside
  `RateLimitService`.
- Offer a total below a branch, or turn off rounding without the owner.
- Default the go-live date, or let dues reach any external response.

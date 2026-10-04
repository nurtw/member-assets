# Session Handoff

**Last revised:** 4 October 2026

> Cold-start contract for a Claude with no prior context. Overwritten every
> session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.6), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/13`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Item 13, rate limiting and abuse detection, is built**: limit profiles,
  `429` with `Retry-After`, pauses on forged codes, sequences, and non-match
  runs, and a required `X-Request-ID`. Migrated locally and on Neon, no
  drift. Committed; **not pushed** until the owner agrees.
- Left: items 14 (totals) and 15 (go-live); 27 is deferred.
- Browser checks skipped, per the owner. `dues.go_live_date` is unset.

Tests: domain 430, contracts 78, api 160; e2e 350/352 (the `DEMO_` test,
and a vehicle test that timed out under load and passes alone); web clean.

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
  `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs): edit with the Edit tool or Python bytes. Long
  heredocs fail in Git Bash; use a script file.

## Next steps

1. Push `main` once the owner agrees.
2. Item 14, aggregate totals (PRD §13): two tiers, the below-25 floor, a total
   counting vehicles onboarded and declared. Aggregate scopes already take
   the slower rate.
3. Owner: EXT-05, EXT-08, EXT-12, EXT-13, EXT-17, GOV-08, GOV-11, PAY-11,
   PAY-20.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, or log a token, its hash, or a looked-up identifier.
- Put a scope and a permission (or `@Public()`) on one route.
- Add a limit as a constant, or touch the rate-limit counters outside
  `RateLimitService`.
- Default the go-live date, or let dues reach any external response.

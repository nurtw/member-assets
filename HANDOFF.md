# Session Handoff

**Last revised:** 3 October 2026

> Cold-start contract: lets a different Claude, with no prior context, resume
> without re-reading the repository. Overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.5), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/12`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- `origin/main` has item 11 (`a276492`). Item 12 is committed on top and
  **not pushed**: that needs the owner's go-ahead.
- **Item 12, the external verification API, is built**: four routes under
  `/api/v1/verification`, token only. Both channels read through
  `VerificationRecordsService`. Every non-match is the same answer.
- **No rate limit yet.** No real organisation should hold a token before
  item 13.
- Browser checks skipped, per the owner. `dues.go_live_date` is unset.

Tests: domain 399, contracts 68, api 157; local e2e 332/333; web clean.

## Conflicts

- **VEH-29 (item 27, deferred)**, adding Transpay stickers by scanning,
  conflicts with PRD §23.19. Do not build it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- `ECONNREFUSED` on 5433: Docker Desktop stopped. Start it
  (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), then
  `docker compose up -d`.
- Run e2e locally (`DATABASE_URL=…5433…`); never `fileParallelism: false`.
- Run Prisma from `apps/api`: `node node_modules/prisma/build/index.js`, with
  `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs): edit with the Edit tool or Python bytes. Long
  heredocs fail in Git Bash; use a script file.

## Next steps

1. Push `main` once the owner agrees.
2. Item 13, rate limiting and abuse: quotas and enumeration detection as two
   layers (Decision 8.1), on a shared store (8.2), limits as settings, plus
   proposal §14.3's client request id. Open choices: the store, the daily
   quota, and whether detection blocks automatically.
3. Owner: EXT-05, EXT-08, EXT-12, EXT-13, GOV-08, GOV-11, PAY-11, PAY-20.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`.
- Add a write, or a personal-data field, to `src/verification/`.
- Look a record up for one verification channel only; use the records service.
- Select `tokenHash`, or log a token, its hash, or a looked-up identifier.
- Put a scope and a permission (or `@Public()`) on one route.
- Default the go-live date, or let dues reach any external response.

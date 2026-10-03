# Session Handoff

**Last revised:** 3 October 2026

> Cold-start contract: lets a different Claude, with no prior context, resume
> without re-reading the repository. Overwritten at the end of every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.5), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/11`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Item 11 is committed on top of `75f091a` and **not pushed**: that needs
  the owner's go-ahead.
- **Item 11, API clients and scopes, is built** (PRD 1.5):
  - Organisations are approved with a profile, scopes, and an agreement;
    tokens are shown once.
  - `@RequireScope` routes take API tokens only; all others, sessions only.
  - Four disclosure profiles are seeded from PRD §15.
- Its migration is on local and Neon: no drift, legacy rows unchanged.
- Browser checks skipped, as the owner said. `dues.go_live_date` is unset.

Tests: domain 392, contracts 64, api 154; local e2e 308/309; web clean.

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
- CRLF files (most root docs, some sources): edit with the Edit tool or Python
  bytes. Long inline heredocs fail in Git Bash; use a script file.

## Next steps

1. Push `main` once the owner agrees.
2. Item 12, the external verification API: four routes under `@RequireScope`,
   projecting `request.apiClient.permittedFields` on the `EXTERNAL` channel,
   a generic negative, and an `api_request_log` row per outcome.
3. Owner: EXT-05, EXT-08, EXT-12, GOV-08, GOV-11, PAY-11 pricing, PAY-20 test.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, or log a token, its hash, or a looked-up identifier.
- Put a scope and a permission (or `@Public()`) on one route.
- Set a vehicle's route type without `recordRouteType`.
- Default the go-live date, or let dues reach any external response.

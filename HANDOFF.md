# Session Handoff

**Last revised:** 16 November 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.18), `ARCHITECTURE.md` (1.13), `DESIGN.md` (1.3),
`ROADMAP.md` (1.23), and `QUESTIONS.md` (1.26).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Onboarding began 19 October 2026.** SMS is off until Termii is set up.
- **Items 56 and 57 are live.** The API runs on DigitalOcean only.
- **Database usage pass (16 November 2026)**, to cut Neon compute hours. Seven local
  commits, **pushed and live on DigitalOcean (16 November), migration applied to Neon**:
  SMS outbox on demand, `/health/live`,
  one-query permissions, 5-minute focus refetch, 5-second settings cache, batched dues, one
  six-hourly `HousekeepingService`; then retention purges and the indexes. Rules are in
  `CLAUDE.md` ("Retention runs from housekeeping", "One timer runs every periodic job").
  All 17 expected indexes were checked present on Neon after the migration. All of it
  passed typecheck, lint, and its e2e suites. Whether Vercel rebuilt the web app is unchecked.

- **Owner's directions of 16 November 2026 (onboarding feedback)** are recorded, not built:
  roadmap items 58 to 67, PRD revision 1.20, and questions **MIG-08**, **VEH-38** (answered),
  **MEM-20** (partly answered), **VEH-39 to VEH-42**, **GOV-25** (open). No plan files yet.
  Answered: delete all imported members (a hard delete, by script, never a route); declare on
  the plate alone and in bulk from the list; a registration is an active member at once.
  Also asked: declare **and undeclare** vehicles (item 60).

Tests at last full counts: domain 540, contracts 158, api 208+, web 113.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07, GOV-18,
  and GOV-08 are open. The owner's call.
- **PRD §23.15 says purging is "an administrative process outside the application write
  path".** The access-log purge runs from housekeeping instead, at the PRD's 12 months.
  Flag to the owner; the period is the setting `retention.api_request_log_months`.
- Items 46 to 52 change the PRD; MEM-19, CARD-09, and CARD-10 block some.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- Run e2e with the local `DATABASE_URL` exported (`postgresql://…@localhost:5433/nurtw`):
  `.env` points at Neon. The config is `vitest.config.e2e.ts`.
- `relationLoadStrategy: 'join'` is rejected by this Prisma setup. Do not use it.

## Next steps

0. **Item 58 first** (`/plan`): take a restore-point export, dry-run against Neon, show the
   owner the counts, and delete only on a go-ahead. Ask the owner about **VEH-41** before
   item 64: showing "imported register" on a screen amends GOV-21.

1. **Owner:** point DigitalOcean's `health_check.http_path` at `/api/v1/health/live`. It is
   still `/api/v1/health` (read 16 November), which keeps Neon awake. The route is live now.
2. Owner: encrypt DigitalOcean's variables; Termii's keys there, then a test.
3. Not done, by choice: the external-request write fan-out (three rows each) is the PRD's
   audit and access log. Item 46 needs a go-ahead and a PRD revision.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database. Register with `HousekeepingService`.
- Write anything internal into the docs page's code (`CLAUDE.md`, item 54).
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

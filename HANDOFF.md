# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 58 is built and tested; its irreversible delete waits for the owner's go-ahead.

## Active roadmap item

Item 58 — remove-imported-members — in-progress (`plans/58-remove-imported-members.md`)

## Done this session

- **Database usage pass** (compute hours): live on DigitalOcean, migration applied to Neon,
  health check now `/api/v1/health/live`. Rules: `CLAUDE.md` ("One timer runs every
  periodic job", "Retention runs from housekeeping").
- **Owner's directions of 16 November** recorded: roadmap items 58 to 67, PRD 1.20,
  `QUESTIONS.md` MIG-08, VEH-38 to VEH-42, MEM-20, GOV-25.
- **Item 58 built**: `apps/api/scripts/remove-imported-members/`, 5 e2e tests passing,
  runbook in `OPERATIONS.md` §10. Neon dry run: **81 imported members, 13 kept, not
  blocked**, 80 vehicles would lose only the driver link.

## Current state

- Files touched: `apps/api/scripts/remove-imported-members/{removal,index}.ts`,
  `apps/api/test/remove-imported-members.e2e-spec.ts`, `apps/api/package.json`,
  `docs/reference/OPERATIONS.md`, the plan, this file.
- Conflicts with PRD: the hard delete departs from `CLAUDE.md` domain rule 5, by the
  owner's choice (MIG-08). PRD §23.15 says purging is "outside the application write path";
  the access-log purge runs from housekeeping (flagged, owner's call).
- Known issues: object-storage photo files are not removed by the delete (the restore point
  lists their keys). Under load, e2e times out: rerun. Run e2e with the local
  `DATABASE_URL` (`localhost:5433`); `.env` is Neon.

## Next steps

- **Owner's go-ahead, then:** `pnpm --filter api remove:imported-members --execute
  --confirm 81` (re-run the dry run first; the count may have changed). Keep the restore
  point under `data/restore-points/`. Then mark item 58 done in `ROADMAP.md`.
- Owner: answer VEH-39 to VEH-42, MEM-20, GOV-25 so items 59 to 67 can be planned. VEH-41
  amends GOV-21 and gates item 64.
- If done: run /plan for item 59, then /execute.

## Do NOT

- Run `--execute` without the owner's go-ahead, or add any route that deletes a member.
- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

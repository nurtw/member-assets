# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 58 is done: the 81 imported members were deleted on Neon on 16 November.

## Active roadmap item

Item 58 — remove-imported-members — done (`plans/58-remove-imported-members.md`)

## Done this session

- **Database usage pass** (compute hours): live on DigitalOcean, migration applied to Neon,
  health check now `/api/v1/health/live`. Rules: `CLAUDE.md` ("One timer runs every
  periodic job", "Retention runs from housekeeping").
- **Owner's directions of 16 November** recorded: roadmap items 58 to 67, PRD 1.20,
  `QUESTIONS.md` MIG-08, VEH-38 to VEH-42, MEM-20, GOV-25.
- **Item 58 done**: `apps/api/scripts/remove-imported-members/`, 5 e2e tests passing,
  runbook in `OPERATIONS.md` §10. **Run on Neon with the owner's go-ahead: 81 members
  deleted, 13 kept, 80 vehicles unlinked (kept), one audit event.** Verified by a second dry
  run (0 left). Restore point: `data/restore-points/imported-members-2026-11-16T10-40-58-211Z.json`.

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

- Keep the restore point safe (real personal data, gitignored); delete it when the owner
  says so.
- Item 59 is planned (`plans/59-declare-by-plate.md`): run /execute for it. Owner decisions
  of 16 November are in `QUESTIONS.md` VEH-38 to VEH-43 and GOV-06. **MEM-20** and
  **GOV-25** are still open (items 61, 66, 67).

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

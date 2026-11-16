# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 60 is built and committed locally, not pushed or deployed. Items 58 and 59 are live,
and the disputed-date migration is applied on Neon.

## Active roadmap item

Item 60 — undeclare — done (`plans/60-undeclare.md`)

## Done this session

- **Undeclare** (`VehicleService.undeclare`, `POST /vehicles/:id/undeclare`, VEH-39): the
  super administrator, with a reason, clears `declaredAt`. An ACTIVE vehicle returns to
  ON_RECORD; SUSPENDED and DISPUTED keep their status. Scope is checked before status;
  audited as `vehicle.undeclare`. Retired, archived, and undeclared vehicles answer 409.
- Domain: `ACTIVE -> ON_RECORD`, `isUndeclarable`, `statusOnUndeclaring`.
- Past totals: declaring again stamps a new `declaredAt`, so a vehicle counts from then
  only (no schema change). Domain test added.
- Web: an "Undeclare" act on the vehicle's Manage tab, through `ConfirmDialog`.
- PRD 9A.1, CLAUDE.md, `openapi.json` updated. 6 e2e tests added to the vehicle suite.

## Current state

- Files: `packages/domain/src/vehicle/`, `packages/contracts/src/vehicle.ts`,
  `apps/api/src/vehicle/`, `apps/api/test/vehicle.e2e-spec.ts`,
  `apps/web/src/app/(app)/vehicles/[id]/page.tsx`, `docs/reference/openapi.json`.
- Conflicts with PRD: none. No migration in this item.
- Known issues: "still verifies on its sticker" is covered by the domain verdict tests
  (an on-record vehicle with an active sticker verifies), not by an e2e of its own.
- Run e2e with the local `DATABASE_URL` (`localhost:5433`); `.env` is Neon.

## Next steps

- Run /plan for item 61 (immediate registration). **MEM-20** (open applications) and
  **GOV-25** (dashboards) are still open and shape items 61, 66, 67: ask first.
- Push and deploy only with a go-ahead.

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

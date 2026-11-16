# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Items 58 to 60 are pushed. Item 61 is planned (`plans/61-immediate-registration.md`).

## Active roadmap item

Item 61 — immediate-registration — planned; item 60 done

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

- Run /execute for item 61. MEM-20 is answered (`QUESTIONS.md`). **GOV-25** (dashboards)
  is still open and shapes items 66 and 67.
- The command that activates the 10 open applications runs on Neon only with the owner's
  go-ahead, after a dry run. Push and deploy only with a go-ahead.

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

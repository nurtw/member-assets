# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 62 is built and tested locally, **not committed, pushed, or deployed**. Items 58 to 61
are live on Neon, DigitalOcean, and origin (`76e17ce`); the 10 open applications were made
active members on 16 November 2026.

## Active roadmap item

Item 62 — imported-vehicle-edit — done (`plans/62-imported-vehicle-edit.md`)

## Done this session

- **Imported vehicles are amended by seniors at any time, others once** (PRD Requirement 9.11,
  VEH-40). Senior is the new permission `vehicle.update_imported` (branch and unit
  administrators, super administrator). One edit is one save per vehicle, shared:
  `vehicle.importedEditedAt`, claimed by a conditional `updateMany`.
- `importedEditRight` and `FIELDS_LOCKED_TO_ONE_EDIT` in `packages/domain`;
  `VehicleDetail.edit` (`right`, `via`); `VehicleService.amend`; `PATCH /vehicles/:id`
  (`vehicle.update`) and new `PATCH /vehicles/:id/imported` (`vehicle.record`).
- One edit may not change plate, branch or unit, or linked member (403, nothing spent).
- Web: `components/correct-vehicle.tsx`, "Correct the details" on the vehicle page; the Driver
  section hides for a non-senior on an imported vehicle.
- Migration `20261116170000_imported_vehicle_edit`. Applied **locally only**.
- The planning decisions are recorded under VEH-40 and may be changed by the owner.

## Current state

- Verified locally: domain 553, contracts 161, e2e 602 of 602 (27 files), typecheck, lint.
  One earlier full e2e run had 6 failures (photograph uploads answering 500, in two files);
  the next full run and the membership file alone were green. Not understood; watch for it.
- Conflicts with PRD: none.
- **On Neon, with the owner's go-ahead, in order:** push and deploy, `db:deploy`, then
  `db:seed` (puts `vehicle.update_imported` in the administrator role). Vercel web rebuild for
  item 61 has not been checked.
- Known issues: the Members list does not show who registered a member; legacy `PENDING`
  wording remains on the member and vehicle pages; a member's signature cannot be changed
  after registration.
- Run e2e with the local `DATABASE_URL` (`localhost:5433`); `.env` is Neon. If it is
  refused, Docker Desktop has stopped (memory: docker-desktop-local-db).

## Next steps

- Commit and push item 62 and deploy on the owner's go-ahead.
- Run /plan for item 63 (bulk declaration), then /execute. **GOV-25** (dashboards) is still
  open and shapes items 66 and 67.

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Run the activation command again, edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

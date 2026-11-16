# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 59 is built and committed locally, not pushed or deployed.

## Active roadmap item

Item 59 — declare-by-plate — done (`plans/59-declare-by-plate.md`)

## Done this session

- **Plate-only:** recording and declaring need the plate alone. Route type, owner (each
  part), chassis, category, and branch or unit are optional (`packages/contracts/src/vehicle.ts`).
  No branch means the officer's own (`organisationOrOwn`; 400 if none or several).
- **Declaring** works from any status but retired or archived, once (`declaredAt`):
  `statusOnDeclaring` makes ON_RECORD active, and keeps SUSPENDED and DISPUTED as they are.
- **`vehicle.declare` cannot be granted** (`isNeverGranted`; `POST /users/:id/grants`
  answers 409; the officer screen hides it). The super administrator alone holds it.
- **Sticker attach** no longer needs a route type or a declaration; a vehicle with no route
  type owes the default levy (tested). Web: vehicle form fields optional, declare panel is
  one button, onboarding panel's route-type gate removed.
- PRD 9.4, 9.8, 9.9, 9A.1, 9A.2, 9.5 amended; CLAUDE.md updated.

## Current state

- Files: `packages/domain` (status, accounts), `packages/contracts/src/vehicle.ts`,
  `apps/api/src/{vehicle,users,sticker}`, e2e specs (vehicle, users, sticker, dues),
  web `vehicle-form`, `vehicles/[id]/page`, `onboarding-section`, `sticker-prompt`,
  `settings/users/[id]/page`, `docs/reference/openapi.json`.
- Conflicts with PRD: none left; PRD amended to revision 1.20 text.
- Known issues: a DISPUTED row is created with `declaredAt` set, so it already counts as
  declared and declaring it answers 409. `OnboardingState.hasRouteType` is still sent;
  nothing uses it now. Run e2e with the local `DATABASE_URL` (`localhost:5433`).

## Next steps

- Run /plan for item 60 (undeclare), then /execute. Push and deploy only with a go-ahead.
- **MEM-20** and **GOV-25** still open (items 61, 66, 67).

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

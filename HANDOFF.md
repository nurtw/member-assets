# Session Handoff

**Last revised:** 16 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 61 is built and committed locally, not pushed or deployed. Items 58 to 60 are live.

## Active roadmap item

Item 61 — immediate-registration — done (`plans/61-immediate-registration.md`)

## Done this session

- **Registering makes the member active at once** (`MembershipService.create`): number,
  `ACTIVE`, application row `APPROVED`, `reviewedAt` set (the fee falls due then), audited as
  `member.register`. Photograph and signature ride in the create body.
- **Removed:** submit, withdraw, decision, and `PATCH /applications/:id/media` routes;
  `application.decide` and `application.review` (catalogue, roles); the review UI.
- **Corrections:** administrators (`member.update`) at any time, `PATCH
  /members/:id/registration`; the registering officer once, `PATCH /applications/:id`
  (`correctedAt`, conditional `updateMany`). `correctionRight` in `packages/domain`. A
  correction dialog on the registration page (`correct-registration.tsx`).
- **Command:** `pnpm --filter api activate:open-applications` (dry run; `--execute --confirm N`).
- Migration `20261116150000_immediate_registration` (adds `corrected_at`, deletes the two
  permissions). Applied **locally only**.
- MEM-04 and MEM-20 answered; PRD, `CLAUDE.md`, `OPERATIONS.md`, `openapi.json` updated.

## Current state

- Conflicts with PRD: none.
- **On Neon, to do with the owner's go-ahead, in this order:** push and deploy, then
  `db:deploy` (the migration), then the dry run, then `--execute --confirm <N>` (expect
  8 drafts + 2 submitted).
- Known issues: the Members list does not show who registered a member; the Registrations
  list and the registration page do (`registeredBy`). Legacy `PENDING` wording remains on
  the member page and the vehicle page. The members' signature cannot be changed after
  registration (no route).
- Run e2e with the local `DATABASE_URL` (`localhost:5433`); `.env` is Neon.

## Next steps

- Run /plan for item 62 (imported-vehicle edit). VEH-40 answered; the senior-role
  permission and what one edit may change are settled at planning. **GOV-25** (dashboards)
  is still open and shapes items 66 and 67.

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Run the activation command, edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

# Session Handoff

**Last revised:** 17 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Items 58 to 62 are live (origin `bb8d94e`, Neon migrated and seeded, DigitalOcean active).
**Items 63 to 67 are built and tested locally, not committed, pushed, or deployed.** That
finishes the owner's roadmap of 16 November (items 58 to 67).

## Active roadmap item

None open. Next: the owner's go-ahead to commit, push, and deploy 63 to 67.

## Done this session

- **63 bulk declaration:** `POST /vehicles/declare-many` (`vehicle.declare`, 50 ids), each id
  through `declareRecorded`; partial success with a reason per skip; ticks on the Vehicles list.
- **64 to 67:** `src/report/` (read-only, scope-bound): sticker origin counts (imported or
  added), `GET /reports/added-vehicles` (no phone or address), the onboarding report by Lagos
  day and officer, and member and vehicle counts. Web: Home counts (`dashboard-counts.tsx`),
  `/vehicles/added`, `/reports/onboarding`, navigation entries.
- Domain: `readDayRange`, `tallyOnboarding`, `lagosDay`, `stickerOriginGroup`.
- No migration and no new permission in 63 to 67, so no `db:deploy` or `db:seed` is needed.
- **GOV-25 and VEH-44 are answered** (the owner accepted the recommendations, 17 November).
  Built to it: `withoutSticker` and `declaration.notDeclared`, `GET /reports/my-work`
  (`@SignedIn`, the field enumerator's own numbers only), a "Your work" block, the vehicles
  block only for officers who oversee, and `vehicle.update` among the permissions that open
  Home (the vehicle-record officer now has a Home).
- Docs: PRD 9.12 to 9.14, `CLAUDE.md`, the register (VEH-44 and GOV-25 answered, totals 125 /
  35 / 3), `openapi.json`.

## Current state

- Verified locally: domain 565, web 125, typecheck, lint, and the full e2e suite, 641 of 641
  across 28 files.
- **The e2e setup now unsets `CLOUDINARY_URL`** (`test/setup-env.ts`). `.env` holds the live
  one, so the photograph tests were uploading to the Union's real Cloudinary account and
  failing with a 500 whenever that call ran slow. They now use local storage (`var/media`).
- Docker Desktop stops by itself; blank Prisma errors in e2e mean it is down (memory:
  docker-desktop-local-db). Files run in parallel, so a test must not assert a global count.
- No question blocks anything built. Bulk undeclare and declare-all-matching stay unbuilt by the
  owner's answer (VEH-44); build them together or not at all.
- Known issues: the Members list does not show who registered a member; legacy `PENDING`
  wording on the member and vehicle pages; a member's signature cannot be changed after
  registration.

## Next steps

- On the owner's go-ahead: commit, push, and watch the DigitalOcean deploy. Nothing to run on
  Neon for 63 to 67.
- Check on the first live use: the dashboards for each role, as the owner described them.

## Do NOT

- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Run the activation command again, edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

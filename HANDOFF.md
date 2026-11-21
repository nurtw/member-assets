# Session Handoff

**Last revised:** 21 November 2026

Cold start: read `CLAUDE.md` first. Three rules outrank every default: no
`Co-Authored-By` or "Generated with Claude Code" anywhere; `data/` stays out of version
control, docs, plans, commits, and fixtures; the previous operator is never named.

## Status

Item 68 is committed and pushed to origin on the owner's go-ahead of 21 November; the
DigitalOcean deploy follows the push (check its state with `doctl`, memory: digitalocean-app).

## Active roadmap item

None open. Item 68 — onboarded-dashboards (`plans/68-onboarded-dashboards.md`), from the
owner's voice notes of 18 November (`QUESTIONS.md` GOV-26, PRD revision 1.21), is done.

## Done this session

- **Onboarded = a sticker attached.** `firstAttachments` and `countOnboarded` in
  `@nurtw/domain`: the first sticker's attacher onboarded the vehicle; replacements never count.
- `GET /reports/my-work?day=`: totals since the account was made, one chosen day, and the
  vehicles the officer added with no sticker yet. No declaring.
- `vehicle-counts`: onboarded and onboarded today (legacy/new), onboarded with no member
  linked, no sticker yet; declared still only for `vehicle.declare`.
- `member-counts`: registered (all, today), active, suspended.
- Onboarding report: vehicles onboarded (split), members registered, vehicles added. The
  declared column is gone.
- Home: "Your work" with a date picker; area sticker counts hidden from field-only officers;
  "Onboarded today" lists each officer. Report columns updated.
- Docs: PRD 1.21 (Requirement 9.14), GOV-26 (totals 126 / 35 / 3), `CLAUDE.md`, roadmap,
  `openapi.json`.

## Current state

- Verified locally: domain 569, web 125, typecheck (api, web), lint (api, web), and the e2e
  report suite 35 of 35 and openapi suite 15 of 15. The full e2e suite was not rerun.
- Run e2e and `docs:openapi` with `DATABASE_URL` exported for the local database (from
  `.env.example`): `apps/api/.env` points at Neon, and `dotenv` never overrides an export.
  Give `docs:openapi` `NODE_ENV=test` too, so its boot runs no start-up jobs.
- No migration and no new permission: nothing to run on Neon.
- The Field enumerator role holds no `sticker.attach`; enumerators who attach stickers hold it
  by grant. "Your work" counts by who attached, whatever the role.
- Known issues (unchanged): the Members list does not show who registered a member; legacy
  `PENDING` wording on the member and vehicle pages; a signature cannot be changed after
  registration.

## Next steps

- Check the dashboards on the live System for each role: enumerator, administrator, super administrator.
- Ask the owner whether the administrator's list (which trailed off in the voice note) needs
  more figures.

## Do NOT

- Count `stickersAttached` as vehicles onboarded, or show a declared figure to anyone but a
  holder of `vehicle.declare`.
- Add any route that deletes a member, or run the removal command again without a go-ahead.
- Run the activation command again, edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Start a `setInterval` that touches the database: register with `HousekeepingService`.
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.

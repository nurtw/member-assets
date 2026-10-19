## Item
54 — public-api-docs

## Source
The owner's direction of 19 October 2026: "create the public docs page, only display
sensitive information when superadmin is signed in". PRD §12 and §13 (the external API),
Requirement 14.3 (failures say nothing), `docs/reference/API.md` §10 to §12.

## Goal
Anyone can open `/docs` and read how an approved organisation uses the verification API:
access, tokens, request ids, the seven external routes with their bodies, answers, errors,
limits, and their obligations. The full route map, with what each route requires, appears
on the same page only for a holder of `docs.read_internal`: the super administrator, and
whoever they grant it to.

## Approach
1. **A permission, never a role.** `docs.read_internal`, grant-only, so it reaches a user
   only through the super administrator's bundle or an express grant.
2. **`GET /docs/openapi.json` asks for it**, in place of `organisation.read`. The full map
   is the sensitive part: every route and the permission it needs.
3. **`GET /docs/integration.json`, public:** the same generator over the external routes
   only (those that name a scope), with only the API-token scheme. It cannot describe an
   officer's route, and it cannot drift from the code.
4. **The page holds nothing sensitive.** Its own words are what `API.md` already gives
   integrators. The internal map arrives from the API, and only after the API has checked
   the permission; a visitor's browser never receives it.
5. **The page:** public, in the Union's pattern, a contents list, the guide, the external
   routes from `integration.json`, and for a holder the internal reference with a search
   and a download of `openapi.json`. Linked from the front page and the portal.

## Files likely touched
`packages/contracts/src/permissions.ts`, `packages/domain/src/permissions/accounts.ts`,
`apps/api/src/docs/`, `apps/api/test/openapi.e2e-spec.ts`, a new docs e2e,
`apps/web/src/app/docs/`, `apps/web/src/lib/api-docs.ts`, `API.md`, `OPERATIONS.md`,
`CLAUDE.md`.

## Out of scope
Changing what the external API does. Publishing detection thresholds, the officers'
routes, or anything from `OPERATIONS.md`.

## Decided while building
- **The permission needs the second factor once that is on**, as every grant-only
  permission does (`accounts.test.ts` requires it).
- **The page states no limit value that is a setting**: not the suppression floor, and not
  the detection thresholds. The routes' own descriptions, from the API, are as before.
- **A visitor's browser asks nothing it would be refused**: `/auth/me` only when the
  session cookie is present, and the map only when it shows the permission.

## Definition of done
- [x] A visitor sees the guide and the seven external routes, and no officer route.
- [x] `integration.json` holds no route without a scope and names no permission.
- [x] `openapi.json` is refused to an officer without `docs.read_internal`.
- [x] A super administrator sees the internal reference on `/docs`.
- [x] Every test passes (e2e 554 of 554); clicked through in both themes and on a phone,
      as a visitor, an ordinary officer, and a super administrator. Releasing needs
      `db:seed` on Neon once, after the deploy.

## Item
07 — vehicle-declaration

## Source
PRD §9, Requirements 9.1–9.6. Data model already exists from item 02:
`Vehicle`, `DeclarationStatus` (six states), `VehicleCategory`. Permission
catalogue already seeded from item 03: `vehicle.read/.declare/.update
/.suspend/.resolve_dispute/.read_restricted`, held by `VEHICLE_RECORD_OFFICER`
and `VERIFICATION_OFFICER` per `packages/contracts/src/permissions.ts`.
`normalizePlateNumber` already built (`packages/domain/src/plate-number.ts`).

## Goal
An officer holding `vehicle.declare` can declare a vehicle against a branch
or unit; the record is discoverable, editable, and moves through its
lifecycle; a second declaration against an already-active plate is refused
as active but recorded as `DISPUTED`, never silently dropped or auto-merged.

## Approach
1. `packages/domain/src/vehicle/status.ts` — transition table mirroring
   `membership/status.ts`. `ACTIVE→{SUSPENDED,RETIRED}`,
   `SUSPENDED→{ACTIVE,RETIRED}`, `DISPUTED→{ARCHIVED}` (dismissal only —
   *upholding* a disputed claim requires demoting the competing active
   record, a policy call gated by unanswered VEH-07; out of scope here).
   `RETIRED`/`ARCHIVED` terminal. `PENDING` kept in the enum, reachable by no
   code path in v1 (see note below).
2. `packages/contracts/src/vehicle.ts` — zod schemas: declare, update,
   suspend/retire (reason), list-query.
3. `apps/api/src/vehicle/` — module, service, controller.
   `declare()`: normalises the plate, checks for an existing `ACTIVE` row on
   that plate; none → create `ACTIVE`; exists → create `DISPUTED` (both rows
   kept, per §23.9). Scope check on **create** is the branch/unit's path
   (parent-style, per `ARCHITECTURE.md`); on read/update/suspend it's the
   vehicle's own branch/unit path. List/detail split like membership's 7.1:
   list excludes `chassisVinRestricted`; detail requires
   `vehicle.read_restricted` to include it.
4. `apps/web/src/app/(app)/vehicles/` — list, detail, declare form. Add to
   nav, gated on `vehicle.read`.
5. ~~Card/membership `isMemberInGoodStanding` gate on declare~~ — **not
   built.** `Vehicle.declaredByMemberId` is optional in the schema and PRD
   §9 associates a declaration with "a member or transport unit" — either,
   not both required. v1 declares against a branch or unit only, with no
   member-selection step; nothing in PRD §9 or the seeded contracts
   specifies how an officer would pick which member, and inventing that UI
   while VEH-06/VEH-08 are open felt like exactly the unrequested-answer
   CLAUDE.md warns against. `declaredByMemberId` stays nullable and unset;
   attaching a declaration to a member is a later, deliberately separate
   addition.

## Files likely touched
`packages/domain/src/vehicle/`, `packages/contracts/src/vehicle.ts`,
`apps/api/src/vehicle/*`, `apps/api/src/app.module.ts`,
`apps/web/src/app/(app)/vehicles/*`, `apps/web/src/app/(app)/layout.tsx`.

## Out of scope
Stickers (item 08). Dispute *resolution* beyond dismissal (VEH-07). Transfer
as a named feature — achieved by retiring one declaration and declaring a
new one; no bespoke endpoint. Evidence/proof fields (VEH-06 unanswered).

## Definition of done
- [x] Declare, list, detail, update, suspend, retire, dismiss-dispute routes,
      each record-scoped, each audited.
- [x] Partial-unique-index conflict produces `DISPUTED`, not a 500.
- [x] Restricted fields absent from list and from any response without
      `vehicle.read_restricted`.
- [x] Domain, contracts, and api unit tests pass; build/typecheck/lint clean.
      **api e2e: 8/13 passing consistently** (`test/vehicle.e2e-spec.ts`) —
      the remaining 5 fail on Prisma's 5s interactive-transaction timeout and
      vitest's test timeout against this session's live Neon connection, the
      same pre-existing latency-driven flakiness already found in
      `membership`/`organisation`/`master-data` e2e specs earlier this
      session (confirmed via a git-stash A/B comparison, unrelated to this
      item's code). Not chased further; see HANDOFF.md.
- [x] `openapi.json` regenerated.

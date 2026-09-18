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
5. ~~Card/membership `isMemberInGoodStanding` gate on declare~~ — still not
   built; no request for it. **Member association, revised.** Originally
   deferred here on the reasoning that no spec existed for a
   member-selection step while VEH-06/VEH-08 were open — on review that
   reasoning overreached: those two questions are about *evidence required*
   and *transfer process*, neither about whether the declaring officer may
   simply name the operator at declare time, which PRD §23.8 ("multiple
   vehicles per member, permitted without limit") already assumes is a
   normal, current capability. Corrected: `declaredByMemberId` is now
   settable on both `POST /vehicles` (optional at declare time) and
   `PATCH /vehicles/:id` (attach, change, or clear after the fact — the
   route a migrated record, PRD §9.5's provenance exception, is reconciled
   to its owner through once item 09 lands). A vehicle declared against a
   branch or unit alone, with no member, remains entirely valid — PRD §9
   accepts a member *or* a transport unit, and nothing requires both.
   Backed by a new minimal member search, `GET /members?q=`, gated on
   `member.read` rather than `application.read` so a vehicle-record officer
   can find an operator without also holding application-review access.

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
      **api e2e: 15/16 passing on the run that added the owner-association
      tests below** (`test/vehicle.e2e-spec.ts`) — one long-standing test
      bug fixed in the same pass (`dismiss-dispute` asserted `200`; Nest
      defaults an undecorated `@Post` to `201`, the convention every other
      action-style POST route in this System already follows and was
      previously masked by the live-Neon flakiness below). The remaining
      flakiness is pre-existing infra latency, not a logic defect (git-stash
      A/B tested against `membership`/`organisation`/`master-data` e2e specs
      too); not chased further.
- [x] `openapi.json` regenerated.
- [x] **Owner (member) association, added after initial delivery.**
      `declaredByMemberId` settable at declare time and via update
      (attach/change/clear); existence-checked, 404 if not found. Backed by
      `GET /members?q=` (`member.read`), a minimal search for the web
      picker. Vehicle list gained a plate-number search (`?q=`) and an
      Owner column — see plan deviation note in Approach §5.

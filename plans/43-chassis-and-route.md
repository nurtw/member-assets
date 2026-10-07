## Item
43 — chassis-and-route

## Source
Mr Timothy's walk-through of 6 October 2026. `QUESTIONS.md` VEH-34 (the chassis number is
compulsory) and VEH-35 (a route says from where to where, which revises VEH-26). PRD §9.
**Waits for the owner's approval: it changes a rule, the schema, and the PRD.** The route
half also waits on the four points VEH-35 leaves open.

## Goal
A new vehicle cannot be added without its chassis number. A vehicle's route says where it
leaves from and where it goes, in the form its route type calls for.

## Approach
**Stage 1: the chassis number** (can be built as soon as it is approved).

1. Recording and declaring a vehicle require a chassis number, at the API and on the form.
   The column stays nullable, because legacy vehicles lack one, as with the route type.
2. Declaring a vehicle already on record without one asks for it then.
3. It stays restricted: in no list, no verification, no log, and no audit event.
4. PRD §9 is revised.

**Stage 2: the route** (after VEH-35's open points are answered).

5. **New data, in a table of its own**, one row per vehicle:
   - Interstate: departure town and local government area in Anambra; destination state.
   - Intercity: departure and destination, each a local government area and a town.
   - Town service: a departure point and a destination point.
6. **Which of those a route type asks for is data, not code.** Route types are a list the
   Union administers, so each one says which shape of route it takes. A new route type must
   not need a deploy.
7. The form shows the fields for the chosen route type, after the vehicle's details and
   before the branch.
8. A change of route is recorded, as a change of route type already is, so the vehicle
   letter and the levy's history stay explicable.
9. Tests, a click-through, the PRD, and the migration on Neon once the owner agrees.

## Files likely touched
`packages/contracts/src/vehicle.ts`, `packages/domain/src/vehicle/`,
`apps/api/prisma/schema.prisma` and migrations, `apps/api/src/vehicle/`,
`apps/web/src/components/vehicle-form.tsx`, `apps/web/src/app/(app)/vehicles/`,
`PRD.md`, `QUESTIONS.md`, `CLAUDE.md`.

## Out of scope
- A route on any external answer: verification and totals do not change.
- Inferring a route for a legacy vehicle.
- Pricing the levy by anything but the route type.
- Lists of towns and points, unless ORG-07 is answered that way.

## To settle before building stage 2 (VEH-35)
- What "two different or four local governments" means for intercity.
- Whether towns and points are typed in or chosen from a list.
- Whether a route is required on every new vehicle, and what legacy vehicles do.
- Whether the route prints on the vehicle letter.

## Definition of done
- [ ] A new vehicle without a chassis number is refused, with the field named. A legacy
      vehicle without one still opens, verifies, and takes a sticker.
- [ ] The chassis number appears in no list, log, audit event, or external answer.
- [ ] Each route type asks for its own fields, and a route type added by the Union can be
      given a shape without a deploy.
- [ ] The PRD and the register say what is required.
- [ ] Lint, typecheck, build, and every test pass; clicked through.

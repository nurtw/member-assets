## Item
37 — member-register

## Source
The owner's choice of 6 October 2026 ("the missing admin screens"). PRD §7 (Requirement
7.1), §16, §25. Found while planning, on 7 October 2026:

- **A migrated member cannot be opened from any screen.** The only list of people is
  Applications, which reads applications, and the legacy import created members without
  one. On the local database that is every migrated member.
- **Nothing reaches `PATCH /members/:id/status`.** A member cannot be suspended, restored,
  or cancelled from a screen.

## Goal
An officer finds any member they may read, opens that member's record, and can suspend,
restore, or cancel the member with a reason. Nobody reads more than they can today.

## Approach
1. **The list route.** `GET /members` gains a `status` filter and, for the screen, a list
   of up to 200 (the picker keeps 20). Its projection does not change: no contact, next of
   kin, or guarantor.
2. **The record route**, new: `GET /members/:id`, under `member.read` over the member's
   organisation (`can`, and 404 outside it). An explicit select: name, membership number,
   status, unit, designation, and the application's id where one exists. Contact, next of
   kin, and guarantor are included only for a holder of `application.read` over that
   member, which is who reads them today.
3. **Members** (`/members`): `PageHeader`, `ListToolbar` (search by name or number, status),
   `Table stacked`. In the navigation under Membership.
4. **A member** (`/members/[id]`): tabs Details, Vehicles, Dues, Card, Manage. The four
   panels already take a member's id and are reused as they are. Manage holds suspend,
   restore, and cancel through `ConfirmDialog`; cancelling says it cannot be undone.
5. The application page gains a link to the member's record. Nothing is removed from it.
6. **Tests:** the record route's scope and projection, and the status filter. Then a
   click-through with a synthetic member.

## Files likely touched
`apps/api/src/membership/`, `packages/contracts/src/membership.ts`,
`apps/web/src/app/(app)/members/`, `apps/web/src/lib/navigation.ts`,
`apps/web/src/app/(app)/applications/[id]/page.tsx`, `docs/reference/openapi.json`,
`CLAUDE.md`.

## Out of scope
- Amending a migrated member's details. The amend route belongs to the application, and a
  migrated member has none. Recorded here for a later item.
- An export, a bulk act, or any list for an outside organisation: the System is not a
  directory.
- Reshaping the application page.

## Definition of done
- [x] A migrated member can be found and opened by an officer who may read them, and by
      nobody outside their organisation (404).
- [x] A reader without `member_sensitive.read` gets no contact, next of kin, or guarantor
      (see below: stricter than first planned).
- [x] Suspend, restore, and cancel work from the screen, each with a reason, each audited.
- [x] Lint, typecheck, build, and the tests pass; clicked through in both themes, on a
      desktop and a phone, with synthetic members.

**Decided while building (7 October 2026):**

- **The sensitive part is gated by `member_sensitive.read`, not `application.read`.** The
  plan said `application.read`, "which is who reads them today". But the code already has a
  permission that governs exactly those fields, and it gates the printed registration form.
  Using it means a branch administrator does not gain the contact details of migrated
  members, whom nobody could open before. For a member with an application, nothing
  changes: the application's page shows what it showed.
- **`status` takes several statuses, separated by commas.** The screen needs "everybody who
  is or was a member" in one request, which no single status gives.
- **The vehicles and card sections became shared panels** (`components/member-panels.tsx`).
  They were written inside the application's page; the plan wrongly said they were already
  components. The application's page now uses the panels, and lost nothing.
- **A member with no application adds a vehicle on the vehicle form**, where the officer
  picks the member. The registration flow's step 2 needs an application.
- **Home has no new tile.** Members is in the sidebar and the command menu; a ninth tile
  would push Home past one screen on a phone.
- **Fixed on the way:** `PATCH /members/:id/status` answered 500 for a member that does not
  exist. It answers 404, as its documentation said.

**Not checked in a browser:** a real migrated member (only synthetic ones, by rule), and a
list longer than 200.

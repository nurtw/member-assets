## Item
20 — registration-flow

## Source
PRD Requirement 9.10, §23.21 (revision 1.3). `QUESTIONS.md` VEH-24.

## Goal
After saving a membership application, the officer lands on "Add a vehicle for
this member", records one or more vehicles linked to the applicant, or skips
the step. Works while the application is still pending.

## Approach
1. On a successful application save, redirect to
   `/applications/:id/vehicles` (or equivalent) carrying the new member's id,
   instead of the application list.
2. That step reuses item 19's record form with the member fixed (not a picker)
   and offers three actions: save and add another, save and finish, skip.
3. Shown only to holders of `vehicle.record` (courtesy — the API refuses
   regardless); without it, the officer returns to the list as today.
4. The application detail page lists the applicant's vehicles, so the link is
   visible during review.
5. Confirm `requireMemberExists` accepts a pending applicant (it checks
   existence only) and add an e2e test that records a vehicle against one.

## Files likely touched
`apps/web/src/app/(app)/applications/**`, `apps/web/src/components/*`,
`apps/api/test/vehicle.e2e-spec.ts`.

## Out of scope
Payment and sticker attachment during registration (item 17). Any change to
the approval workflow.

## Definition of done
- [x] Saving an application leads straight to the vehicle step
      (`/applications/:id/vehicles`, for holders of `vehicle.record` or
      `vehicle.declare`).
- [x] Skip returns to the application with no vehicle created.
- [x] A vehicle recorded here is linked to the pending applicant; the
      application page lists the applicant's vehicles (`GET /vehicles?memberId=`).
- [x] e2e: record against a pending applicant succeeds.
- [x] web lint and typecheck clean.
- [ ] Not yet clicked through in a browser — no local administrator account
      exists to sign in with (seed creates none by design).

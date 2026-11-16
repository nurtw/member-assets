# 61 — immediate-registration

## Item
Registering a member makes them an active member at once, with a membership number.

## Source
PRD revision 1.20, Requirements 7 and 9.10; `QUESTIONS.md` MEM-20, MEM-04. Supersedes the
approval flow of item 05.

## Goal
Saving the registration form creates an active member, a membership number, and a
registration record in one transaction. There is no draft, no submission, no decision, and no
second officer. The 10 people held as drafts or submitted on Neon become active members by
a one-off command run on the owner's go-ahead.

## Approach
1. **Keep `membership_application` as the registration record.** Create it already
   `APPROVED`, with `createdByUserId`, `reviewedByUserId` set to the same officer, and the
   member `ACTIVE`. The form number, the printed form, and the applicant's vehicles page
   keep working. No table is dropped.
2. `MembershipService.create`: allocate the membership number, set the member `ACTIVE`,
   write one `member.register` audit event. Refuse nothing new.
3. **Remove** `submit`, `withdraw`, `review`, their three routes, `assertSeparateOfficer`
   from membership (cards keep theirs), and the `application.decide` permission: from the
   catalogue, the roles, and Neon, by a migration. Remove the review UI and the "draft"
   wording from the screens.
4. **Corrections (MEM-20, answered).** Administrators (`member.update`) amend a member's
   registration details at any time. The officer who registered the member (`createdByUserId`)
   gets **one** correction: a nullable `corrected_at` on the application, set by the first
   amendment, by a conditional `updateMany` so two cannot race. Each amendment is audited with
   the fields changed, never their values. Imported members stay outside this (item 58).
5. **One-off command** `apps/api/scripts/activate-open-applications/`, modelled on item 58:
   dry run by default; `--execute --confirm <N>`; prints the DB host only; one audit event per
   member. It activates `DRAFT` and `SUBMITTED` applications as a registration would. No
   restore point is needed: it deletes nothing.
6. Web: the registration form's save button says "Register"; `/applications` lists
   registrations (keep the route); the member's page links to its record.
7. Amend PRD 7, 9.10; `CLAUDE.md` Membership registration; the register (MEM-04 closed).

## Files likely touched
`apps/api/src/membership/`, `apps/api/prisma/` (schema, migration), `apps/api/prisma/seed.ts`,
`packages/domain/src/membership/status.ts`, `packages/contracts/src/{membership,permissions}.ts`,
`apps/api/scripts/activate-open-applications/`, `apps/api/test/membership.e2e-spec.ts` (and
suites that submit and approve to make members), `apps/web` applications and member pages,
`docs/reference/OPERATIONS.md`, `PRD.md`, `CLAUDE.md`.

## Out of scope
The imported-vehicle edit window (62), the onboarding report (66), the dashboards (67).

## Definition of done
- [x] Registering creates an active member with a number, in one transaction, audited.
- [x] No route submits, withdraws, or decides; `application.decide` is gone from catalogue and roles.
- [x] An administrator amends at any time; the registering officer once; nobody else; audited.
- [x] The command's dry run lists the 10; `--execute` is run only with the owner's go-ahead. (Run on Neon 16 November 2026: 10 made active, none left open.)
- [x] Every suite that made members by approving is updated; typecheck, lint, e2e pass.
- [x] PRD, `CLAUDE.md`, `openapi.json`, and `OPERATIONS.md` amended.

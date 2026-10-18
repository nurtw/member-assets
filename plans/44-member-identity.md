## Item
44 — member-identity

## Source
The owner's direction of 18 October 2026, collecting at the park (`QUESTIONS.md` PAY-22):
each member is registered "with their name, phone number, NIN and photo". MEM-19 (the NIN)
and MEM-14 (what a photograph must look like) are open. PRD §7, Requirement 7.1.
**Changes the PRD (a new field, and a new kind of sensitive data), so it waits for the
owner's approval.** The first of the park-collection items, 44 to 52.

## Goal
A member can be given a NIN and a photograph at registration, or later on their record, a
migrated member included. The NIN is kept like a secret: stored encrypted, never shown
whole, and never printed or sent anywhere but where item 50 needs it.

## Approach
1. **The NIN gets a table of its own** (`member_identity`, one row per member), apart from
   `member_contact`, because it is more sensitive than a telephone number or an address:
   - encrypted under a key of its own, `IDENTITY_ENCRYPTION_KEY`, as the second factor's
     secret is under `MFA_ENCRYPTION_KEY` (`encryptSecret` in `auth/totp.ts`). Without the
     key the route answers 503, and nothing is stored in plain text;
   - beside it, a keyed hash, so one NIN cannot be recorded for two members, and the last
     four digits, so an officer can tell which one is recorded.
2. **Write-only.** No route returns a NIN whole. The record says "Recorded, ending 4321" or
   "Not recorded". A wrong one is replaced, not read back and edited. Giving or replacing it
   needs `member.update` over the member, and is audited without the value.
3. **Eleven digits**, the national format. Whether it is required is MEM-19; until that is
   answered it is optional, at the API and on the form.
4. **It is in no list, card, verification, aggregate, export, log, audit event, or SMS.** A
   test fails if a response or a message template can carry it, as the verification
   projection's test does for its fields.
5. **A photograph for any member.** A route adds or replaces the photograph of an approved
   or migrated member (`member.update`, scoped), through `PhotographField`. The earlier one
   is kept while a printed card refers to it (`printedPhotoId`). Audited.
6. **Screens:** a NIN field in Section A, after the telephone; on the member's record, the
   NIN line and a Photograph section that takes or chooses a picture.
7. PRD §7 and Requirement 7.1, `ARCHITECTURE.md` §10, `CLAUDE.md`, `OPERATIONS.md`.

## Files likely touched
`packages/contracts/src/membership.ts`, `apps/api/prisma/schema.prisma` and a migration,
`apps/api/src/membership/`, `apps/api/src/auth/totp.ts` (the encryption, moved somewhere
shared), `apps/web/src/app/(app)/applications/new/page.tsx`,
`apps/web/src/app/(app)/members/[id]/`, `apps/web/src/components/photograph-field.tsx`,
and the documents above.

## Out of scope
Checking a NIN with NIMC (MEM-19 asks). Sending it to Paystack (item 50). A rule for what a
photograph must look like (MEM-14). Amending a migrated member's other details.

## To settle before building (MEM-19)
- Is a NIN required? What of a member who has none, or who registered before?
- Is it checked with NIMC through a paid service, or recorded as given?

## Definition of done
- [x] A NIN can be given at registration and on a member's record. It is stored encrypted,
      never returned whole, and one NIN cannot be recorded for two members.
- [x] No list, card, verification, log, audit event, or message carries it; a test says so.
- [x] An officer holding `member.update` over any member, migrated or approved, can add or
      replace their photograph. A printed card keeps the photograph it printed.
- [x] PRD revised (1.16). Lint, typecheck, build, and every test pass; clicked through
      18 October 2026.

**Decided while building (18 October 2026):**

- **A photograph on the record comes with the request** (`POST /members/:id/photograph`),
  not through `POST /media`. That route needs `member.create`, which branch and unit
  administrators lack, though they hold `member.update`. The photograph it replaces is
  discarded unless a card printed it.
- **A NIN can be taken off a record, with a reason**: for one recorded against the wrong
  member, which would otherwise keep it from its owner.
- **A cancelled membership releases its NIN** (`releasedAt`), so somebody who rejoins can be
  registered with it. That is why the index keeping one NIN to one record is partial. A
  cancelled record's NIN and photograph are not changed afterwards.
- **Whether a NIN is recorded goes to every reader of the member**, as whether a chassis
  number is does (item 43). Its last four digits go only with the sensitive part, and on an
  application's detail.
- **The registration form gives the NIN under `member.create`**, because field enumerators
  register members and hold no `member.update`. The record needs `member.update`.
- **The sealing moved to `common/secret-box.ts`**, shared with the second factor's secret.
- **Nothing was backfilled.** Members registered before are given a NIN on their record.

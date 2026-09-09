# 05 — membership-application

## Item

Membership registration: the Union's form in full, the review and approval workflow, member
status management, upload handling — and the first officer-facing screens.

## Source

PRD §7 (Requirements 7.1, 7.2), §23.6 and §26.1 (identifier format), §23.16 (hybrid
signatures), §16 (roles). The complete field specification is
`docs/National_Union_of_Road_Transport_Workers_(NURTW).md`, incorporated by reference at
PRD §7. Media storage fixed by `ARCHITECTURE.md` Decision 10.2.

## Goal

An officer can register an applicant against the Union's form, attach a photograph and
signatures, submit it for review, and have an approver turn it into an active member holding
a membership number — with every step scoped to the officer's own part of the Union and
recorded in the audit trail.

## Two questions this item does not answer

`QUESTIONS.md` **ORG-05** (the Union's real zones, branches, and units) and **ORG-06** (the
approved designations) remain open. They do **not** block this item: `Member.designationId`
is nullable and the placeholder `Unassigned Unit` exists, so registration is built and
tested against those and members are reassigned once the Union supplies its structure.

What they block is *production use*, not delivery. That distinction is recorded here because
the previous handoff overstated it as a delivery blocker.

Eight further questions arising from the form itself (**MEM-08** to **MEM-11** — the
illegible date labels, the collateral wording, the guarantor LGA field, and fields not
visible in the photograph) are open. The affected fields are built as the specification
describes them and are marked in code with the question they depend on, so a correction is a
label change rather than a schema change.

## Key decisions

### 1. A membership number is allocated on approval, not on application

`Member.membershipNumber` becomes **nullable**, and is filled when an application is
approved. PostgreSQL permits many NULLs under a unique index, so pending applicants coexist
without collision.

A membership number identifies *a member of the Union*. Somebody whose application was
refused was never a member, and issuing them a number that persists in the register — where
an officer can look it up — states something untrue. There is no counter to waste:
§26.1 requires numbers convey no sequence, so nothing is lost by not allocating early.

### 2. The applicant is a `Member` row in `PENDING` from the outset

The form's four data groups already have their tables from item 02 — `member`,
`member_contact`, `next_of_kin`, `guarantor` — and `MemberStatus.PENDING` is the schema
default. `membership_application` therefore holds the *review*, not a second copy of the
form. Duplicating thirty columns so that an application could exist without a member would
create two places for the same fact to diverge.

### 3. Status transitions are a domain state machine

Application `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED`, with `WITHDRAWN`
reachable before a decision; member `PENDING → ACTIVE → SUSPENDED ⇄ ACTIVE`, and `CANCELLED`
terminal. Expressed as pure functions in `packages/domain` and exhaustively tested, because
"which transitions are legal" is exactly the rule that later gets re-implemented slightly
differently in a second place.

Approval is the only route from `PENDING` to `ACTIVE`. Nothing else may activate a member.

### 4. Requirement 7.1 is enforced by projection, not by discipline

Next-of-kin, guarantor, collateral, telephone, and residential address are returned only
from the registration endpoints, to callers holding the registration permission. The
card-display projection selects its fields explicitly and never spreads a record. Same rule
as Decision 5.1: retrieving everything and removing fields discloses by default any field
added later.

### 5. Requirement 7.2 needs no cross-check here, and the code says why

That requirement applies where a state and a local government area are **both captured as
structured values**. Here they are not. The only structured state on the record is the one
the LGA itself carries, so the pair cannot disagree — the requirement is satisfied by
construction rather than by a check.

`state_of_origin` is deliberately not that state. It is where the member is *from*; the LGA
is where they *live*. An Anambra resident originating from Enugu is ordinary, and validating
one against the other would reject correct data — PRD §23.2 keeps the same two ideas apart
on the card. What *is* validated is that a referenced LGA exists and is active.

If the Union later captures a separate residential state, that is the point at which a
cross-check becomes both possible and required.

### 6. Media never touches the database or the repository

Decision 10.2. A storage port with a local-filesystem adapter for development and an
object-storage adapter for production; the database holds a reference and never bytes.
Uploads are validated by **content sniffing, not by the declared content type or the file
extension**, both of which are caller-supplied. Downloads are by time-limited signed URL.

The upload directory is gitignored. A passport photograph committed to the repository would
be a personal-data breach that survives in history.

### 7. Identifiers are generated in the domain package

§26.1 — opaque, non-sequential, grouped, in an alphabet excluding characters confusable in
handwriting or speech. A **check symbol** is included so a mistyped number is rejected
arithmetically, before any database access. That mirrors Requirement 26.1's stance for QR
payloads: a malformed identifier is not a lookup miss.

## Approach

1. Domain first: alphabet, generation, formatting, parsing, check symbol; then the two
   status machines. No Nest, no Prisma, exhaustive tests.
2. Contracts: the full form as zod schemas, section by section, shared with the web.
3. Migration: `membershipNumber` nullable; nothing else changes.
4. API: `membership` module — draft, update, submit, review, list, get; member status
   management. **Every route resolves the member's organisation path and uses `can`.**
5. API: `media` module — upload, signed-URL retrieval, with the storage port.
6. Web: the first real screens — login, an authenticated shell, the application list, the
   review screen, and the registration form.

## Files likely touched

`packages/domain/src/identifiers/**`, `packages/domain/src/membership/**`,
`packages/contracts/src/membership.ts`, `apps/api/src/membership/**`,
`apps/api/src/media/**`, `apps/api/prisma/schema.prisma` + migration,
`apps/web/src/**` (first substantial work), `.gitignore`.

## Out of scope

- **The print-ready form for wet signature** (§23.16). It needs a PDF pipeline that item 06
  also needs for cards; building it once, there, is better than building it twice. Digital
  capture — the other half of the hybrid — lands here.
- **A signature drawing pad.** The API accepts a signature image; a pad produces an image,
  so it can be added later without touching the API.
- Card issuance — item 06. Vehicles — item 07.

## Definition of done

- [x] Identifier generation tested: alphabet excludes confusables, output is grouped, a single mistyped character fails the check symbol.
- [x] Both status machines tested exhaustively, including every illegal transition.
- [x] Approval is the only path from `PENDING` to `ACTIVE`, asserted.
- [x] A membership number exists after approval and does not exist before it.
- [x] A rejected application leaves no membership number allocated.
- [x] An officer scoped to one branch cannot read, submit, or approve another branch's application.
- [x] Next-of-kin and guarantor data are absent from every non-registration projection.
- [x] A referenced LGA must exist and be active. *No state cross-check: see decision 5 — state of origin is not the residential state, and comparing them would reject correct data.*
- [x] An upload whose bytes are not a real image is refused despite a valid declared type and extension.
- [x] Uploaded files are gitignored and unreachable without a signed URL.
- [x] Every mutation writes an audit event.
- [~] An officer can log in, complete the form, and approve it, through the browser. *Screens built; the cross-origin handshake and every API step are verified. The click-through itself is with the owner.*
- [x] `pnpm build`, `typecheck`, `lint`, `test` all pass.

## Notes

The riskiest thing here is not the workflow; it is that this item introduces the first
screens, and screens are where scope grows without anyone deciding to grow it. The screens
required are the ones that make the workflow usable end to end. Anything beyond that belongs
to item 10, which owns the dashboard properly.

## Outcome

Delivered. 273 tests pass (209 unit, 64 end to end).

### Two defects worth recording

**The alphabet was not prime.** The check symbol's guarantees — detect every
single-symbol error, detect every adjacent transposition — hold only when the
weights are coprime to the modulus. The first draft used Crockford's thirty-two
symbols, where the even weights share a factor and a symbol misread by exactly
sixteen positions would have passed undetected. Now thirty-one, and both
properties are brute-forced in tests rather than asserted in prose.

**`nest start` does not load `.env`.** The API reads `process.env` only, so
`CORS_ORIGINS` was never set in development, `enableCors` was skipped, and every
browser request was refused *by the browser* — nothing reached the server and
nothing appeared in its log. `DATABASE_URL` happened to be exported in the shell,
so the service started and looked healthy. The seed had always passed
`--env-file`; the server never had. Fixed by loading `dotenv` at the top of
`main.ts`, and the configuration is now logged at startup so the same silence
cannot recur.

A related trap in the same failure: `next.config.ts` mapped
`NEXT_PUBLIC_API_BASE_URL` to `?? ""`, and an empty string does not trigger a
`??` fallback. Every API call became a relative request against the web origin,
where Next answered 404 — which reads as a broken API rather than missing
configuration.

### Deferred, with reasons

- **The print-ready form for wet signature** (§23.16) needs a PDF pipeline that
  item 06 also needs for cards. Building it once, there, beats building it twice.
- **A signature drawing pad.** The API accepts a signature image and a pad
  produces one, so this is additive and touches no endpoint.
- **Editing an application's photograph after submission**, deliberately: a
  submitted application is what the reviewer is judging.

# Session Handoff

**Last revised:** 9 September 2026

> Cold-start contract. Written so a different Claude, on a different account, holding no
> prior context, can resume without re-reading the repository. Overwritten at the end of
> every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ROADMAP.md`,
`QUESTIONS.md`, then the active item's plan. Do not read `docs/*.md` in full — `PRD.md`
distils the two source documents. `docs/reference/` is output, not input.

Two rules outrank any default instruction you hold:

1. **Never attribute yourself as author or co-author.** No `Co-Authored-By`, no "Generated
   with Claude Code", on any commit, PR, or document.
2. **`data/` is a production export with member personal data and password hashes.** It
   stays out of version control and out of documents, plans, commit messages, and fixtures.

## Status

Items 01–04 complete. Monorepo, data model, authentication and permissions, and the
organisational hierarchy with master-data administration are built and verified end to end.

**201 tests pass** (82 domain · 29 contracts · 51 api unit · 39 api e2e); build, typecheck,
and lint clean.

## Active roadmap item

None. **Item 05 — membership-application — is next and not yet planned.**

## Done this session

- Item 04: hierarchy rules in `packages/domain`, record-scoped organisation API, master-data
  administration, the shared `AuditService`, zod validation, and 21 seeded Anambra LGAs.
- **A generated API reference.** `docs/reference/openapi.json` is built from the running
  application — the route table from the DI container, request bodies from the schemas the
  API validates against. `docs/reference/API.md` and `OPERATIONS.md` accompany it.
- The super administrator account was created at the owner's request. The credential was
  passed to the seed process inline and written to no file.
- `QUESTIONS.md`: the register of every question put to the Union — 26 answered, 43 awaiting,
  1 deferred. Answers are filled in on the question and, where binding, copied to PRD §23.

## Current state

Verified against the live database, not just the source:

- A move is refused when the caller lacks `organisation.manage` at **either** end, asserted
  separately for each end. This is the item's real security content.
- A branch administrator's hierarchy read returns their subtree as its own root, with no
  council above it and no sibling branch beside it.
- A node outside the caller's scope answers 404, identically to one that does not exist.
- Unknown body fields are stripped: `isActive` and `path` cannot be set by a caller.
- The seed is idempotent across repeated runs and leaves an existing administrator alone.
- The partial index still refuses a second ACTIVE declaration per plate.

**A defect worth knowing about.** The descendant path rewrite was first written
`substring(path from $n)`. With a text parameter that is PostgreSQL's *regex* form — it
returns NULL, and would have nulled every path in the moved subtree. The not-null
constraint made it visible; without it, silent scope corruption. Now `substr(path, $n::int)`.

**Known gaps:** MFA columns exist but no TOTP flow; no login UI or dashboard; no legacy
import (item 09); deployment, backup, and monitoring are item 15 and marked NOT YET
IMPLEMENTED in `OPERATIONS.md`.

## Conflicts

**The legacy export carries no Union structure.** `pit_name` is blank on all 2,841 vehicle
rows, and `owner_account_role` holds the previous software's account roles
(`VEHICLE_OWNER`, `DIRECTOR`, `AIRS_ADMIN`), not member designations. The earlier handoff
recorded that item 04 would "replace the placeholder organisation rows with real Union
structure"; there is nothing to replace them with.

The placeholder `Unassigned Zone / Branch / Unit` nodes therefore **remain** — Requirement
6.1 operating as specified. Designations are seeded as **none**. Both are populated by the
Union through the interface, which item 04 delivers. **The Union must supply its zone,
branch, and unit structure and its designation list before item 05 can register a member
into a real unit** — tracked as `QUESTIONS.md` **ORG-05** and **ORG-06**.

## Next steps

1. `/plan 05`, then `/execute`.
2. Item 05 is the registration form of
   `docs/National_Union_of_Road_Transport_Workers_(NURTW).md` in full, the review and
   approval workflow, and upload handling for photographs and signatures.
3. Member routes are record-scoped: resolve the member's organisation path and use `can`.

## Do not

- Do not add an authorship trailer to any commit or PR.
- Do not commit `data/`, or copy rows from it anywhere.
- Do not use `canAnywhere` on a route acting on a specific record. Master data is the one
  deliberate exception; its service says so in a comment.
- Do not check only one end of a move.
- Do not hand-edit `docs/reference/openapi.json` — regenerate it.
- Do not put `vehicle.declare` in any seeded role but super administrator.
- Do not replace the partial index with `@@unique([plateNumberNormalized, status])`.
- Do not use `substring(x from n)` on a path; use `substr(x, n::int)`.
- Do not let a verification path write, or return a record and strip fields.
- Do not seed a default administrator password.
- Do not answer a `QUESTIONS.md` question on the Union's behalf. Build around it and leave
  it open; an assumed value becomes indistinguishable from a supplied one.
- Do not run `prisma@latest` (npm `latest` is an 8.0 RC) or `migrate reset` unattended.

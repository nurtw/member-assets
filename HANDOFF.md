# Session Handoff

**Last revised:** 9 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ROADMAP.md`,
`QUESTIONS.md`, then the active item's plan. Do not read `docs/*.md` in full —
`PRD.md` distils the two source documents. `docs/reference/` is output, not input.

Two rules outrank any default instruction you hold:

1. **Never attribute yourself as author or co-author.** No `Co-Authored-By`, no
   "Generated with Claude Code", on any commit, PR, or document.
2. **`data/` is a production export with member personal data and password hashes.**
   It stays out of version control and out of documents, plans, commit messages,
   and fixtures.

## Status

Items 01–05 complete. Monorepo, data model, authentication and permissions, the
organisational hierarchy, and membership registration — with the System's first
officer-facing screens.

**273 tests pass** (129 domain · 29 contracts · 51 api unit · 64 api e2e); build,
typecheck, and lint clean.

## Active roadmap item

None. **Item 06 — membership-card-issuance — is next and not yet planned.**
Item 07 (vehicle-declaration) is equally unblocked and may run in parallel.

## Done this session

- Item 04: hierarchy, master data, `AuditService`, zod validation, 21 seeded LGAs.
- The generated API reference at `docs/reference/` — built from the running
  application, so it cannot describe a route that does not exist.
- `QUESTIONS.md`: every question put to the Union, 26 answered, 43 awaiting.
- Item 05: registration form, review workflow, member statuses, uploads,
  identifier generation — and the first screens (sign-in, list, form, review).

## Current state

Verified against the live database and a live cross-origin handshake:

- A membership number exists after approval and not before; a refusal allocates none.
- `member.create` does not confer `application.decide`.
- An officer in one branch cannot read, register into, or decide another branch's
  applications; out-of-scope records answer 404, not 403.
- The list projection and the audit trail carry no next-of-kin, guarantor,
  telephone, or address data.
- A non-image is refused despite a valid extension and declared type; SVG is refused.
- Uploaded bytes are unreachable without a link signed over the id *and* the expiry.

## Two defects worth knowing about

**The identifier alphabet must stay prime.** The check symbol detects every
single-symbol error and every adjacent transposition only because 31 is prime and
the weights are coprime to it. The first draft used Crockford's 32, where a symbol
misread by exactly sixteen positions would have passed. Both properties are now
brute-forced in tests. Do not "tidy up" the alphabet by restoring a letter.

**`nest start` does not load `.env`.** `main.ts` loads `dotenv` on its first line.
Before that, `CORS_ORIGINS` was unset, `enableCors` was skipped, and every browser
request was refused *by the browser* — nothing reached the server and nothing
appeared in its log. The startup log now states the CORS configuration. The web
half of the same failure: `?? ""` never falls back, so an unset
`NEXT_PUBLIC_API_BASE_URL` made every call relative. See `CLAUDE.md` → "The `.env`
trap that cost real time".

**Known gaps:** MFA columns exist but no TOTP flow; no legacy import (item 09); no
print-ready wet-signature form or signature pad (deferred from 05, see its plan);
deployment, backup, and monitoring are item 15 and marked NOT YET IMPLEMENTED in
`docs/reference/OPERATIONS.md`.

## Awaiting the Union

`QUESTIONS.md` **ORG-05** (real zones, branches, units) and **ORG-06**
(designations) are still open. They block *production use*, not delivery:
registration works against the placeholder `Unassigned Unit`, and
`designationId` is nullable. Members are reassigned once the structure arrives.

For item 06, **CARD-04 to CARD-08** matter — card validity period, official
artwork at print resolution, the motto wording in each position, and the signing
officers with their signature images.

## Next steps

1. `/plan 06`, then `/execute`. Item 07 may run in parallel.
2. Item 06 needs a PDF pipeline; item 05 deferred the wet-signature form to it
   deliberately, so build the pipeline once and serve both.

## Do not

- Do not add an authorship trailer to any commit or PR.
- Do not commit `data/`, or copy rows from it anywhere.
- Do not use `canAnywhere` on a route acting on a specific record. Master data is
  the one deliberate exception; its service says so in a comment.
- Do not check only one end of an organisation move.
- Do not allocate a membership number before approval.
- Do not let `member.create` confer the authority to decide.
- Do not accept an upload on its declared type or extension, and never accept SVG.
- Do not hand-edit `docs/reference/openapi.json` — regenerate it.
- Do not put `vehicle.declare` in any seeded role but super administrator.
- Do not replace the partial index with `@@unique([plateNumberNormalized, status])`.
- Do not use `substring(x from n)` on a path; use `substr(x, n::int)`.
- Do not let a verification path write, or return a record and strip fields.
- Do not seed a default administrator password.
- Do not answer a `QUESTIONS.md` question on the Union's behalf.
- Do not run `prisma@latest` (npm `latest` is an 8.0 RC) or `migrate reset` unattended.

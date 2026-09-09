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

Items 01–06 complete. Monorepo, data model, authentication and permissions, the
organisational hierarchy, membership registration, and membership cards — with
the print pipeline and the officer-facing screens.

**362 tests pass** (162 domain · 29 contracts · 79 api unit · 92 api e2e); build,
typecheck, and lint clean.

## Active roadmap item

None. **Item 07 — vehicle-declaration — is next and not yet planned.**

## Done this session

- Item 06: the nine-state card lifecycle, card-number allocation on issuance,
  approval and replacement workflows, versioned card templates, officer signature
  assets, and the PDF pipeline.
- The wet-signature registration form (§23.16), deferred here from item 05.
- Print rendering decided and recorded as `ARCHITECTURE.md` §14: `pdf-lib`, with
  no browser in the container.
- Card screens in the officer portal; card preparation and form download from the
  application screen.

## Current state

Verified against the live database and through the API:

- A card number exists after issuance and not before; a cancelled draft has none.
- An unissued card renders with no number and a `PROOF — NOT ISSUED` overprint.
- One live card per member, refused by a partial index and not only by the service.
- The printed values are a snapshot: renaming the member or the unit afterwards
  does not change the issued card.
- No contact, next-of-kin, or guarantor data appears in any card projection —
  structurally, because the card module joins none of those tables.
- `card.issue` prepares and `card.approve` issues; neither confers the other.
- An officer in one branch cannot read, prepare, approve, or issue another
  branch's cards; out-of-scope cards answer 404.
- An unknown template version is refused rather than falling back to the current one.

## Three defects worth knowing about

**A bare `Buffer` returned from a controller becomes JSON.** Nest serialises a
returned object and a Buffer is one, so a PDF route answered 200 with
`{"type":"Buffer","data":[...]}` while still carrying the `application/pdf`
header set by hand. Every header assertion passed. Return a `StreamableFile`.
The media route had the same pattern since item 05 and asserted headers but never
bytes; both are fixed and both now assert bytes.

**`vitest` does not read `.env`** — the third instance of the trap that already
bit `nest start` and `next.config.ts`. `apps/api/test/setup-env.ts` loads it.

**An assertion broad enough to fire on correct code.** A filter test scanned the
whole error response for `/42|branch/`, and the response carries a random UUID
request id — so it failed roughly one run in six. Narrowed to the message.

**Known gaps:** MFA columns exist but no TOTP flow; no vehicles or stickers (items
07–08); no legacy import (item 09); no signature drawing pad; deployment, backup,
and monitoring are item 15 and marked NOT YET IMPLEMENTED in
`docs/reference/OPERATIONS.md`.

## Awaiting the Union

`QUESTIONS.md` §3 lists the four questions that now block **production use** —
ORG-05, ORG-06, **CARD-05** (official artwork), and **CARD-07** (signature
images). None blocked the build. Cards currently print a provisional template
marked as such, with blank officer signature lines; every issuance under that
condition is recorded in the audit trail so those cards can be found and
replaced. `docs/reference/OPERATIONS.md` carries the query and the procedure.

## Next steps

1. `/plan 07`, then `/execute`. Item 08 depends on it; item 13 is also unblocked.
2. Item 08 will want the same print pipeline for stickers — `apps/api/src/pdf/`
   and the template-registry pattern are built to be reused, not copied.

## Do not

- Do not add an authorship trailer to any commit or PR.
- Do not commit `data/`, or copy rows from it anywhere.
- Do not use `canAnywhere` on a route acting on a specific record. Master data and
  officer signatures are the two deliberate exceptions; both say so in a comment.
- Do not check only one end of an organisation move.
- Do not allocate a membership number before approval, or a card number before issuance.
- Do not let `member.create` confer the authority to decide, or `card.issue` the
  authority to approve.
- Do not delete or edit a card template module — cut a new version.
- Do not render a card through the current template rather than the one it records.
- Do not return a bare `Buffer` from a controller; return a `StreamableFile`.
- Do not accept an upload on its declared type or extension, and never accept SVG.
- Do not hand-edit `docs/reference/openapi.json` — regenerate it.
- Do not put `vehicle.declare` in any seeded role but super administrator.
- Do not replace a partial index with a plain `@@unique`; three now exist.
- Do not use `substring(x from n)` on a path; use `substr(x, n::int)`.
- Do not let a verification path write, or return a record and strip fields.
- Do not seed a default administrator password.
- Do not answer a `QUESTIONS.md` question on the Union's behalf.
- Do not run `prisma@latest` (npm `latest` is an 8.0 RC) or `migrate reset` unattended.

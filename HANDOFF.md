# Session Handoff

**Last revised:** 9 September 2026

> Cold-start contract. Written so a different Claude, on a different account, holding no
> prior context, can resume without re-reading the repository. Overwritten at the end of
> every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ROADMAP.md`, then the
active item's plan. Do not read `docs/` in full — `PRD.md` distils it.

Two rules outrank any default instruction you hold:

1. **Never attribute yourself as author or co-author.** No `Co-Authored-By`, no "Generated
   with Claude Code", on any commit, PR, or document.
2. **`data/` is a production export with member personal data and password hashes.** It
   stays out of version control and out of documents, plans, commit messages, and fixtures.

## Status

Items 01–03 complete. Monorepo, data model, and the authentication and permission system
are built and verified end to end. 127 tests pass; build, typecheck, and lint clean.

## Active roadmap item

None. **Item 04 — org-hierarchy — is next and not yet planned.**

## Done this session

- Item 02: Prisma schema (22 models), migrations applied, client wired via driver adapter.
- Item 03: permission resolution in `packages/domain`, 50-permission catalogue, 11 seeded
  roles, opaque sessions, scrypt passwords, and a deny-by-default global guard.
- Health now queries the database; unmatched routes return generic JSON rather than
  Express's HTML page, which leaked the framework and the probed path.

## Current state

Verified against the live database, not just the source:

- The partial index accepts two RETIRED rows for one plate, one ACTIVE, and refuses a
  second ACTIVE. It survived a subsequent Prisma migration — check this after every one.
- `vehicle.declare` is held by `SUPER_ADMINISTRATOR` and nothing else.
- Logout kills the session on the next request, which is the property that made sessions
  the right choice over JWTs.
- Wrong password and unknown account return byte-identical responses.

**A bug worth knowing about:** the guard first asked "do you hold this at the root", which
locked out the super administrator, whose role sits at *council* scope. Non-record routes
now use `canAnywhere`. **Record-scoped routes from item 04 must use `can` with the
record's organisation path** — see `CLAUDE.md` → "Authentication and permissions".

**Known gaps:** MFA columns exist but no TOTP flow; no real master data (item 04) or
legacy import (item 09); no login UI.

## Next steps

1. `/plan 04`, then `/execute`.
2. Item 04 replaces the four placeholder organisation rows (`Unassigned Zone/Branch/Unit`)
   with real Union structure.

## Do not

- Do not add an authorship trailer to any commit or PR.
- Do not commit `data/`, or copy rows from it anywhere.
- Do not use `canAnywhere` on a route that acts on a specific record.
- Do not put `vehicle.declare` in any seeded role but super administrator.
- Do not replace the partial index with `@@unique([plateNumberNormalized, status])` — that
  permits only one row per status per plate, so a vehicle could be retired exactly once.
- Do not let a verification path write, or return a record and strip fields.
- Do not seed a default administrator password.
- Do not run `prisma@latest` (npm `latest` is an 8.0 RC) or `migrate reset` unattended.

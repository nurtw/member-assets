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

Items 01 and 02 complete. Monorepo scaffolded and the data model is migrated and running.
54 tests pass; build, typecheck, and lint are clean.

## Active roadmap item

None. **Item 03 — auth-and-permissions — is next and not yet planned.**

## Done this session

- Item 02: Prisma schema (21 models), initial migration applied, client wired into Nest via
  a driver adapter, `PrismaModule` global.
- Local PostgreSQL 17 in Docker on **port 5433** (5432 is taken by an unrelated stack).
- Health endpoint now genuinely queries the database and reports `degraded` + 503 without
  naming the failed component.
- Global error shape: unmatched routes returned Express's HTML page, leaking the framework
  and the probed path. Now generic JSON identical to a matched-route miss (PRD §14.3).
- `.prettierignore` excludes `*.md` — Prettier padded every table past 200 columns.

## Current state

- **Verified against the live database, not just the schema:** the partial unique index
  admits two RETIRED rows for one plate, one ACTIVE, and refuses a second ACTIVE.
- **Prisma pins matter.** `latest` on npm is an 8.0 **release candidate**; both packages are
  held at 7.10.0. See `CLAUDE.md` → "Prisma 7 specifics".
- **Known gap:** no seed data yet. Master data and the eleven roles seed in item 03; real
  master data and the legacy import in item 09.

## Next steps

1. `/plan 03`, then `/execute`.
2. Item 03 seeds the permission catalogue and roles. `vehicle.declare` goes **only** into
   the super-administrator bundle (`ARCHITECTURE.md` 9.7).

## Do not

- Do not add an authorship trailer to any commit or PR.
- Do not commit `data/`, or copy rows from it anywhere.
- Do not replace the partial index with `@@unique([plateNumberNormalized, status])` — that
  permits only one row per status per plate, so a vehicle could be retired exactly once.
- Do not put `vehicle.declare` in any seeded role but super administrator.
- Do not let a verification path write, or return a record and strip fields
  (`ARCHITECTURE.md` 5.1).
- Do not run `prisma@latest`, or `prisma migrate reset` unattended.

# 02 — core-data-model

## Item

The Prisma schema and initial migration.

## Source

PRD §24 (canonical field names), §7–§10 (registration, card, vehicle, sticker), §12.1
(API clients), §16–§18 (roles, permissions, audit). Structure fixed by `ARCHITECTURE.md`
Decisions 9.2–9.9, 10.1–10.3, 5.2, 7.1–7.3.

## Goal

A Prisma schema covering organisation, member, application, vehicle, sticker, card, API
client, permission, disclosure, and audit entities, with the sensitive/card-display
separation enforced structurally, and a generated initial migration.

## Approach

1. Add Prisma to `apps/api`; datasource PostgreSQL, client output inside the app.
2. Provide local PostgreSQL via `docker-compose.yml`. Neon is the production target but no
   credential exists in this environment, and the schema must be verifiable now.
3. Model the organisation hierarchy as **one self-referencing table** with a level enum and
   a materialised path, not four tables. Permission scoping (Decision 9.4) asks "is this
   record within the actor's scope", which is a path-prefix match on one table and a
   four-way union on four.
4. Model master data as tables, never enums — PRD §23.4 promised the Union it could change
   these without a deployment. Vehicle category, designation, LGA, state.
5. Model record lifecycles as **enums**, since those are closed sets fixed by the PRD.
6. Split sensitive member data into its own table per Decision 10.1. Next of kin and
   guarantor are separate tables again, reachable only through the member-profile module.
7. Permissions: catalogue table, role bundles, per-user grants and revocations, each
   carrying an organisation scope. Revocation wins (Decision 9.3).
8. Disclosure profiles as rows with an explicit permitted-field set (Decision 5.2).
9. Audit events append-only, with before/after values (Decision 7.2).
10. Sticker carries both the signed identifier and the legacy barcode in **distinct
    columns**, the legacy one read-only (PRD §26.4).
11. Validate, generate the client, apply the migration, and assert the invariants that
    matter with tests against the live database.

## Files likely touched

`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`,
`apps/api/src/prisma/**`, `docker-compose.yml`, `.env.example`, `apps/api/package.json`,
`packages/contracts/src/**`.

## Out of scope

Seeding real master data and the legacy import — item 09. Authentication logic — item 03.
Any controller or endpoint beyond health. Disclosure _projection_ behaviour — item 10;
this item only creates the tables it reads from.

## Definition of done

- [x] `prisma validate` passes.
- [x] `prisma generate` produces a client the API compiles against.
- [x] Initial migration applies to an empty database without error.
- [x] Unique index exists on `plate_number_normalized`, and only on the normalised column.
- [x] Sensitive member fields are absent from the `Member` table itself.
- [x] `sticker_qr_id` and the legacy barcode are separate, separately indexed columns.
- [x] Every status column is an enum matching the PRD's lifecycle exactly.
- [x] No vehicle category, designation, or LGA is expressed as an enum.
- [x] `pnpm build`, `typecheck`, `lint`, `test` all pass.

## Notes

The schema is the single source of truth (`ARCHITECTURE.md` §2) and the migration history
is the durable record of structural change. Prefer an explicit column over a `Json` blob:
the legacy export's denormalised `owner_jsonb` is precisely the problem this system exists
to replace, and reproducing that pattern would carry the defect forward.

# 04 — org-hierarchy

## Item

The organisational hierarchy — council, zone, branch, unit — and the master-data
administration interface.

## Source

PRD §6 (Requirements 6.1, 6.2), §23.1 (four levels beneath the council), §23.3 (Unit and
Unity Body are one entity), §23.4 (master data is administrable, seeded from the legacy
export). Scope semantics fixed by `ARCHITECTURE.md` Decision 9.4.

## Goal

An administrator can build and maintain the Union's real structure through the interface,
and can correct the master-data lists the registration form depends upon — with every
change scoped, audited, and reversible.

## What the legacy export actually supplies

Established by inspecting `data/` before planning, because it changes this item's shape:

| Master data | In the export? | Consequence |
|---|---|---|
| Local government areas | **Yes** — 21 distinct Anambra LGAs across 933 vehicles | Seeded. |
| Zones, branches, units | **No** — `pit_name` is blank on all 2,841 rows | Cannot be seeded. Built through the interface. |
| Designations | **No** — `owner_account_role` holds legacy *system account* roles (`VEHICLE_OWNER`, `DIRECTOR`, `AIRS_ADMIN`), which are not NURTW member designations | Cannot be seeded. Built through the interface. |
| Vehicle categories | Yes — seeded in item 02 | Editable from this item. |

**This contradicts the previous `HANDOFF.md`,** which recorded that item 04 "replaces the
four placeholder organisation rows with real Union structure". The export contains no
Union structure to replace them with. Recorded under Conflicts rather than resolved
silently, per `CLAUDE.md`.

The placeholder `Unassigned Zone / Branch / Unit` nodes therefore **stay**. That is not a
workaround; it is Requirement 6.1 operating as specified — a default node at each level so
the structure stays uniform and a scope-limited administrator remains expressible. They
are renamed and re-parented as the Union supplies real structure.

Designations are seeded as **nothing at all**. Inventing a list of Union offices would put
values in front of an administrator that carry the appearance of Union authority without
having it, and §23.4 states plainly that this item is not gated on the Union supplying
lists in advance. An empty administrable list is the honest state.

## Approach

1. **Hierarchy rules into `packages/domain` first**, as with item 03. Level placement,
   path construction, subtree-move legality, and descendant path rewriting are pure
   functions over strings, tested without a database (Decision 3.2).

2. **Placement is exact, not merely ordered.** A zone's parent is a council — not "anything
   above it". Permitting a unit directly beneath a council would make the level field
   decorative and every scope query ambiguous about what it had skipped.

3. **A move rewrites descendant paths inside one transaction.** The materialised path is a
   denormalisation, and a half-written subtree is a scope failure: descendants would keep
   a prefix naming an ancestor that no longer contains them, so permission checks would
   answer from stale ancestry. Verified by counting rewritten rows against the subtree
   size.

4. **A move is checked against two scopes, not one.** This is the item's real security
   content. Moving a node requires `organisation.manage` at **both** its current location
   **and** the destination. Checking only one of them permits an administrator scoped to
   branch A to pull a node out of branch B into their own scope — or to push one of their
   own nodes outside their scope, where they can no longer see what they have done. A
   move is simultaneously a removal and an insertion, so it takes both permissions.

5. **Creation is checked against the parent.** A node that does not exist yet has no path,
   so the scope question is "may this user add beneath *there*".

6. **The tree read is filtered to what the caller may see.** An unfiltered hierarchy read
   would disclose the whole Union structure to a unit-level officer. The response is the
   union of subtrees in which the caller holds `organisation.read`.

7. **Deactivation, never deletion** (domain rule 5). Deactivating refuses while active
   children or active members remain, so the administrator works bottom-up and no
   cascade quietly disables a subtree. Reactivating refuses while the parent is inactive.
   Together these hold the invariant *an active node's ancestors are all active*, which is
   what lets an interface trust a single flag.

8. **Master data is Union-wide, and `canAnywhere` is correct there** — deliberately, with a
   comment saying so. Vehicle categories and LGAs are not organisation-scoped, and a
   future reader applying the item-03 record-scope rule mechanically would be wrong.

9. **Codes are immutable; labels are not.** A code is a foreign key in all but name —
   1,075 vehicles point at `BUS_INTRASTATE`. Renaming the label is administration;
   changing the code is a silent data migration.

10. **Audit lands here** (domain rule 6). Item 04 is the first module that mutates
    Union-visible state, so it introduces the shared `AuditService` writing before/after
    values, rather than each later module inventing its own.

11. **Input validation via zod schemas in `packages/contracts`.** The API validates with
    them and the web application will reuse them for forms and types. Manual `typeof`
    checks carried item 03's two-field login; they do not carry a hierarchy.

## Files likely touched

`packages/domain/src/organisation/**`, `packages/contracts/src/organisation.ts`,
`packages/contracts/src/master-data.ts`, `apps/api/src/organisation/**`,
`apps/api/src/master-data/**`, `apps/api/src/audit/**`,
`apps/api/src/common/zod-validation.pipe.ts`, `apps/api/prisma/seed.ts`,
`apps/api/src/app.module.ts`.

## Out of scope

Members and their assignment to units — item 05. Any dashboard screen; this item delivers
the API the dashboard will call. Bulk import of hierarchy from a spreadsheet — item 09
covers legacy import, and the export carries no structure to import.

## Definition of done

- [x] Placement rules tested: each level accepts only its correct parent; council only at root.
- [x] Subtree move rewrites every descendant path, asserted against the database.
- [x] A move into a node's own subtree is refused (cycle).
- [x] A move is refused when the caller lacks the permission at **either** end, asserted separately for each end.
- [x] Create is authorised against the parent's path; a branch administrator cannot create under another branch.
- [x] The tree read returns only subtrees the caller may read, asserted with a unit-scoped user.
- [x] Deactivation refuses with active children; reactivation refuses under an inactive parent.
- [x] Master-data codes are immutable once created; labels are editable; nothing is hard-deleted.
- [x] 21 Anambra LGAs seeded idempotently; designations seeded as none.
- [x] Every mutation writes an audit event carrying before and after values.
- [x] `pnpm build`, `typecheck`, `lint`, `test` all pass.

## Notes

The move-authorisation rule in step 4 is the one to defend in review. It reads as
redundant — the user is "managing the hierarchy" either way — and it is the difference
between a scope boundary and a suggestion.

## Outcome

Delivered as planned, with two additions the item required in practice.

**Validation and the API reference.** Zod schemas landed in `packages/contracts` as
planned, and once they existed the API reference could be generated from them rather than
written by hand. `docs/reference/openapi.json` is produced from the running application:
the route table is read from the dependency-injection container and request bodies from the
same schemas the API validates against. An end-to-end test fails when a route carries no
documentation, so the two cannot drift apart. See `docs/reference/API.md`.

**One defect worth recording.** The descendant path rewrite was first written as
`substring(path from $n)`. With a text-typed parameter that is PostgreSQL's *regular
expression* form, not the positional one — it matched nothing and returned NULL, so every
path in the moved subtree would have been nulled rather than rewritten. The column's
not-null constraint turned it into a visible failure; without that constraint it would have
been silent scope corruption, and every permission decision beneath the moved node would
have been answered from a path that no longer described the record's ancestry. Now
`substr(path, $n::int)`, with the reason recorded at the call site.

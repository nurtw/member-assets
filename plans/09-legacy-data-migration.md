## Item
09 — legacy-data-migration

## Source
PRD §25 (Requirements 25.1–25.3), §23.17–23.18. QUESTIONS.md MIG-01–03
(answered), MIG-04–06 (open — built around, not invented past; see below).
CLAUDE.md's legacy export catalogue. **Conflict flagged**: PRD §25.1 requires
migrating sticker requests; QUESTIONS.md's MIG-01 answer says "members and
vehicles only." PRD wins per CLAUDE.md, but sticker requests need item 08's
schema, not yet built — this item's Phase 2 (see Out of scope).

## Goal
A re-runnable script imports `data/` into the schema: 81 members
(`drivers.csv`), 2,841 vehicle declarations (`vehicles_full.csv`,
`isLegacyImport: true`), under one identified system actor distinguishable
in the audit trail (PRD Requirement 9.5's migration exception). Produces a
reconciliation report of everything imported blank, unmatched, or flagged,
inferring nothing QUESTIONS.md leaves open.

## Approach
1. Schema migration: add `legacyId String? @unique` to `Member` and to
   `Vehicle` — the idempotency key for reruns (upsert, never duplicate).
2. `scripts/migrate-legacy/` (per ARCHITECTURE.md layout) — a standalone
   script against `DATABASE_URL` via the existing Prisma adapter, not a
   Nest module. Add `csv-parse` (no CSV dependency exists yet).
3. Create one system `User` (no login) the first run finds-or-creates by a
   fixed email; every row this script writes is audited under it.
4. **ORG-05 is still open** — no real branch/unit list exists. Create one
   placeholder org subtree ("Legacy Import", clearly distinct from
   `SEED_DEMO_DATA`'s placeholders) the first run finds-or-creates, and park
   every migrated member/vehicle under it. Reassigning to real branches once
   ORG-05 lands is a staff task (a move, using item 04's existing
   scope-checked move), not this script's.
5. Members from `drivers.csv`: one `Member` per row, `status: ACTIVE`,
   membership number via the existing `generateIdentifier`, `legacyId` = the
   row id. No contact/next-of-kin/guarantor (not in the legacy shape).
6. Vehicles from `vehicles_full.csv`: one declaration per row,
   `isLegacyImport: true`, plate through `normalizePlateNumber`, LGA
   imported where present else left null and listed (Requirement 25.3 — no
   inference). `status`: legacy `ACTIVE`→`ACTIVE`; legacy `INACTIVE`→
   `SUSPENDED` (reversible, not `RETIRED`) — provisional pending MIG-06,
   flagged in the report, never silently decided as terminal.
7. Owner reconciliation (MIG-04's "import as recorded, reconcile
   afterwards"): `drivers.csv` rows carry `vehicleId` — an explicit FK, not
   an inference. Where present, set that vehicle's `declaredByMemberId` to
   the member migrated from that driver row. Everything else (`owner_jsonb`
   only) stays unattached, for staff to attach via this session's
   member-picker UI.
8. Reconciliation report (markdown, gitignored path outside `data/`):
   no-LGA vehicles, row-level import failures, unattached vehicles,
   blacklisted/inactive vehicles pending MIG-06, and the Legacy Import
   placeholder's contents pending ORG-05.

## Files likely touched
`apps/api/prisma/schema.prisma` (+migration), `scripts/migrate-legacy/*`,
`apps/api/package.json` (csv-parse).

## Out of scope
**Phase 2, blocked on item 08**: `sticker_requests.csv` (5 rows) — needs the
sticker schema. `vehicle_scans.csv`, `company.csv`, `company_charges.csv`,
wallets/transactions — excluded per PRD §2.2. Reassigning migrated records
off the Legacy Import placeholder (staff task, post-ORG-05). Resolving
MIG-04/05/06 (Union decisions, not engineering).

## Definition of done
- [ ] All 81 drivers and 2,841 vehicles imported or explicitly listed as
      failed, with a reason.
- [ ] Zero inferred LGAs; zero un-flagged blacklisted/inactive vehicles.
- [ ] Every migrated row traces to the migration system actor in the audit
      trail.
- [ ] Rerunning the script against an already-migrated database is a no-op.
- [ ] Reconciliation report generated; unit tests for the CSV mapping and
      status-translation logic; build/typecheck/lint clean.

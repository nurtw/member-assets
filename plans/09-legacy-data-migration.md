## Item
09 — legacy-data-migration

## Source
PRD §25 (Requirements 25.1–25.3), §23.17–23.18, §9A.3 (revision 1.2).
QUESTIONS.md MIG-01–03 (answered), MIG-04–06 (open — built around, not
invented past; see below). ARCHITECTURE.md Decision 6.5 (on record /
onboarded / declared as separate facts — **binding on this re-plan**;
supersedes this file's earlier ACTIVE/SUSPENDED mapping). CLAUDE.md's legacy
export catalogue. **Conflict flagged**: PRD §25.1 requires migrating sticker
requests; QUESTIONS.md's MIG-01 answer says "members and vehicles only." PRD
wins per CLAUDE.md, but sticker requests need item 08's schema, not yet
built — this item's Phase 2 (see Out of scope).

## Goal
A re-runnable script imports `data/` into the schema: 81 members
(`drivers.csv`), 2,841 vehicles **on record only** (`vehicles_full.csv`,
`isLegacyImport: true`, `status: ON_RECORD` — never `ACTIVE`, per Decision
6.5), under one identified system actor distinguishable in the audit trail
(PRD Requirement 9.5's migration exception). Produces a reconciliation
report of everything imported blank, unmatched, or flagged, inferring
nothing QUESTIONS.md leaves open.

**Unverified code already in the tree** (`apps/api/scripts/migrate-legacy/`)
predates revision 1.2 and must not run as-is: `mapping.ts` maps legacy
`ACTIVE`→declaration `ACTIVE`, which Decision 6.5 forbids outright — a
migrated vehicle is never declared. Step 6 below replaces that function.

## Approach
0. **Depends on item 08 landing `DeclarationStatus.ON_RECORD`** (Decision
   6.5). This item does not add that enum value itself — it is item 08's
   schema change — but cannot run before it exists.
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
6. Vehicles from `vehicles_full.csv`: one `Vehicle` row per row,
   `isLegacyImport: true`, plate through `normalizePlateNumber`, LGA
   imported where present else left null and listed (Requirement 25.3 — no
   inference). **`status: ON_RECORD` for every row, regardless of the
   legacy `ACTIVE`/`INACTIVE` value** (Decision 6.5 — a migrated vehicle is
   never declared, so there is no `ACTIVE`/`SUSPENDED` distinction to carry
   forward at import time; that distinction only starts to matter once a
   vehicle is actually declared, which is a future, deliberate act, not
   this script's). The legacy status value is retained as-imported in
   `notes` so MIG-06 has something to act on later without a re-import.
   `declaredAt: null`. This replaces `mapping.ts`'s current
   `mapDeclarationStatus`, which must be corrected before this script runs.
7. Owner reconciliation (MIG-04, **answered 26 September 2026**: the driver
   is the member, the owner is not): `drivers.csv` rows carry `vehicleId` —
   an explicit FK, not an inference. Where present, set that vehicle's
   `declaredByMemberId` to the member migrated from that driver row.
   **Revision 1.3 (Requirement 25.4):** every vehicle's `owner_jsonb`
   `name`, `phone`, and `address` go into `vehicle_owner` exactly as
   recorded — blanks stay null and are listed in the report. No other
   `owner_jsonb` key (gender, marital status, next of kin) is imported:
   VEH-25 asks for name, phone, and address only. Route type is left null
   (VEH-26 — no inference from the legacy category).
7a. **Reruns write nothing.** An audit event is written only when the row
   was actually created, not on every rerun (the first draft audited every
   upsert, which would have broken the no-op DoD line).
7b. **Where it runs (MIG-07):** locally first (`docker compose up -d`, seed,
   then the script with `DATABASE_URL` pointed at port 5433). The report goes
   to the project owner, and the Neon run waits for their go-ahead.
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
- [x] `mapping.ts` corrected: `mapDeclarationStatus` always returns
      `ON_RECORD`, never `ACTIVE`; legacy status preserved as a note.
      `Vehicle.declaredAt` made nullable (a second, dependent schema
      migration this re-plan surfaced — an `ON_RECORD` row has no
      declaration date to record). `index.ts` passes `declaredAt: null`
      explicitly, overriding the column's `now()` default.
- [x] Unit tests updated (`mapping.spec.ts`) and passing: every legacy
      status/blacklist combination maps to `ON_RECORD`; flagging logic and
      the legacy-status note are covered separately from the status itself.
- [x] Owner name, phone, and address copied into `vehicle_owner` as
      recorded (Requirement 25.4); 77 rows lacking a name or phone listed.
- [x] All 81 drivers and 2,841 vehicles imported **into the local database**
      (26 September 2026), none failed; every vehicle `ON_RECORD`, no
      `declaredAt`, no route type. 1,908 without an LGA; 80 linked to a
      driver; 3 flagged for MIG-06.
- [x] Zero inferred LGAs; legacy status kept in `notes`.
- [x] Every migrated row traces to the migration system actor (2,922 audit
      events = 2,841 + 81).
- [x] Rerunning the script is a no-op (0 imported, audit count unchanged).
- [x] Reconciliation report generated in `.migration-reports/`.

**Found 26 September 2026: the shared Neon database was already imported on
18 September by the pre-1.2 script** — 2,838 legacy vehicles `ACTIVE`, 3
`SUSPENDED`, all with `declaredAt`, none with owner details (the earlier
handoff saying "not run" was wrong). A plain rerun skips existing rows, so
`--repair` was added (see `repairVehicle` and `docs/reference/OPERATIONS.md`).
Tested locally against a reproduction of that state: 2,841 corrected, an
officer-actioned row left alone, a second run a no-op. Nothing depends on the
Neon rows (no stickers, cards, payments, or duplicate plates; one driver link
set by an officer, which the repair keeps).

- [x] Neon: `migrate:legacy -- --repair`, **approved by the owner on 26 September 2026
      and completed the same day.** The pre-repair state was 2,838 `ACTIVE` and 3
      `SUSPENDED`, all declared, none with owners, and no declare or status-change
      audits. It was saved to a JSON file outside the repository.
      - The first run corrected 724 rows, then died on a dropped connection, leaving none
        half-done.
      - The script was made resumable: it skips settled rows, re-reads each row inside its
        transaction, retries dropped connections, runs five at a time, and takes
        `--no-register`. This was verified locally against a reproduction; every field
        of all 2,841 rows matched a fresh derivation from the export.
      - It was resumed with `--repair --no-register`. Four rows could not start a
        transaction (P2028, now retried) and were corrected on the next run.
      - **Result:** 2,841 `ON_RECORD`, none declared, one `vehicle.migrate_repair` event
        each, 2,841 owner rows, and no missing or doubled notes. The officer's driver link
        was kept, and a final run wrote nothing. The Transpay register was **not** loaded.

**Transpay register (item 17, 26 September 2026):** now imported by this script.
Locally, 2,408 barcodes were placed, none failed, and a rerun wrote nothing. See
`plans/17-vehicle-onboarding.md`. `sticker_requests.csv` is still Phase 2.

import { createHash, randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ANAMBRA_LGA_SEED } from '@nurtw/contracts';
import {
  RECORD_BLOCKING_STATUSES,
  generateIdentifier,
  normalizePlateNumber,
} from '@nurtw/domain';

import { hashPassword } from '../../src/auth/password-hashing.ts';
import { readLegacyCsv } from './csv.ts';
import {
  blankToNull,
  mapDeclarationStatus,
  mapLegacyOwner,
  mapLegacyRegisterEntry,
  mapMemberStatus,
  matchLgaByName,
  parseLegacyBoolean,
  splitLegacyName,
} from './mapping.ts';
import { ReconciliationReport } from './report.ts';

/**
 * Legacy data migration (roadmap item 09, PRD §25, `plans/09-legacy-data-migration.md`).
 *
 * Imports `drivers.csv` as members and `vehicles_full.csv` as vehicles ON
 * RECORD (never declared — Decision 6.5), each with its owner details as
 * recorded (Requirement 25.4), and the export's Transpay barcodes as the
 * closed register of unattached stickers (Requirement 9A.3, item 17).
 * Idempotent: every row is keyed by `legacyId` (a barcode by its value) and
 * skipped outright if already present, so a rerun writes nothing — no
 * duplicate row, and no second audit event for a row nothing happened to.
 *
 * Runs against a local database first (QUESTIONS.md MIG-07); the shared Neon
 * database only after the project owner has read the reconciliation report.
 *
 * What this deliberately does NOT do, and why:
 *
 *   * Import `sticker_requests.csv` (5 rows) — still Phase 2. PRD §25.1 asks
 *     for it and MIG-01 says members and vehicles only; the conflict is
 *     flagged in `plans/09-legacy-data-migration.md`.
 *   * Import `next_of_kin`, `identification`, or `license` from
 *     `drivers.csv` — no unambiguous field to place them in without
 *     inventing a schema change this item was not scoped to make.
 *   * Infer a vehicle's local government area from address text when one is
 *     not recorded (PRD §23.18 forbids it) — a missing LGA is imported
 *     blank, under the "Unclassified" placeholder branch, and listed in the
 *     reconciliation report.
 *   * Resolve MIG-06 (what blacklisted/inactive should mean) — a Union
 *     decision. The legacy status is kept in `notes` and every affected row
 *     is flagged. (MIG-04 is answered: the driver is the member; the owner is
 *     recorded on the vehicle and never made a member.)
 *   * Give a vehicle a route type (VEH-26 — nothing is inferred from the
 *     legacy category), or import any `owner_jsonb` key beyond name, phone,
 *     and address.
 */

const MIGRATION_ACTOR_EMAIL = 'legacy-migration@nurtw.internal';

/** `pnpm --filter api migrate:legacy -- --repair` — see `repairVehicle`. */
const REPAIR = process.argv.includes('--repair');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to migrate.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const report = new ReconciliationReport();

/** Identical derivation to `prisma/seed.ts`'s `stableId` — reruns must upsert the same row, not duplicate it. */
function stableId(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('|')).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * The system actor every row this script writes is audited under (PRD
 * §9.5's migration exception). No usable password: `isActive: false` refuses
 * login outright, and the password hash itself is of bytes nobody recorded.
 */
async function ensureMigrationActor(): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: MIGRATION_ACTOR_EMAIL },
    select: { id: true },
  });
  if (existing) {
    return existing;
  }
  return prisma.user.create({
    data: {
      email: MIGRATION_ACTOR_EMAIL,
      fullName: 'Legacy data migration (system, item 09)',
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      isActive: false,
    },
    select: { id: true },
  });
}

interface LegacyOrganisations {
  /** LGA code -> the "Legacy Import" branch under that LGA's real zone. */
  branchByLgaCode: Map<string, string>;
  /** Fallback branch for anything with no matched LGA. */
  unclassifiedBranchId: string;
}

/**
 * ORG-05 is still open for branches and units (only zones, the 21 LGAs, are
 * a real Union answer — see `prisma/seed.ts`'s `seedZones`). Rather than
 * invent a real branch, or dump every migrated record under one
 * undifferentiated node, this places each under a clearly-labelled "Legacy
 * Import" branch inside the *real* zone its legacy LGA names — preserving
 * genuine information — with one further "Unclassified" zone/branch for
 * anything that cannot be matched. All of it stays reassignable exactly like
 * any other organisation move, once real branches exist.
 */
async function ensureLegacyOrganisations(): Promise<LegacyOrganisations> {
  const council = await prisma.organisation.findFirstOrThrow({
    where: { level: 'COUNCIL' },
  });

  const branchByLgaCode = new Map<string, string>();
  for (const lga of ANAMBRA_LGA_SEED) {
    const zoneId = stableId('zone', lga.code);
    const zone = await prisma.organisation.findUnique({
      where: { id: zoneId },
    });
    if (!zone) {
      // Seed has not run, or ORG-05's zone answer was withdrawn. Either way
      // this is a precondition failure, not a per-row data problem.
      throw new Error(
        `Zone for ${lga.name} (${zoneId}) does not exist — run the seed before migrating.`,
      );
    }
    const branchId = stableId('legacy-import-branch', lga.code);
    await prisma.organisation.upsert({
      where: { id: branchId },
      create: {
        id: branchId,
        name: `${lga.name} — Legacy Import`,
        level: 'BRANCH',
        parentId: zone.id,
        path: `${zone.path}${branchId}/`,
      },
      update: {},
    });
    branchByLgaCode.set(lga.code, branchId);
  }

  const unclassifiedZoneId = stableId('legacy-import-zone', 'unclassified');
  await prisma.organisation.upsert({
    where: { id: unclassifiedZoneId },
    create: {
      id: unclassifiedZoneId,
      name: 'Unclassified — Legacy Import',
      level: 'ZONE',
      parentId: council.id,
      path: `${council.path}${unclassifiedZoneId}/`,
    },
    update: {},
  });
  const unclassifiedBranchId = stableId('legacy-import-branch', 'unclassified');
  await prisma.organisation.upsert({
    where: { id: unclassifiedBranchId },
    create: {
      id: unclassifiedBranchId,
      name: 'Unclassified — Legacy Import',
      level: 'BRANCH',
      parentId: unclassifiedZoneId,
      path: `${council.path}${unclassifiedZoneId}/${unclassifiedBranchId}/`,
    },
    update: {},
  });

  return { branchByLgaCode, unclassifiedBranchId };
}

interface ImportedVehicle {
  id: string;
  branchId: string;
}

/**
 * `--repair` — brings a vehicle written by the pre-1.2 version of this script
 * to the shape revisions 1.2 and 1.3 require. That version mapped legacy
 * `ACTIVE` to a declaration (`ACTIVE`, with `declaredAt` stamped) and wrote no
 * owner details; Decision 6.5 forbids the first and Requirement 25.4 requires
 * the second. The shared database was imported that way on 18 September 2026,
 * so a plain rerun, which skips existing rows, would leave it wrong.
 *
 * This is a correction event (PRD Requirement 18.2), not a lifecycle
 * transition — `ACTIVE -> ON_RECORD` is not a legal transition, because no act
 * of the System should ever produce it. It corrects a value that should never
 * have been written, and says so in its audit event.
 *
 * It touches only what the old script got wrong:
 *
 * - status and `declaredAt`, and only where the status is still the one the
 *   migration wrote — a row that has since been declared or had its status
 *   changed by an officer (`vehicle.declare` / `vehicle.status_change`) is left
 *   exactly as it is;
 * - the legacy-status note, appended if missing (MIG-06 needs it);
 * - owner details, created if the row has none (never overwritten).
 *
 * The driver link, branch, and every other field are untouched, so an
 * officer's edits since the import survive. A second `--repair` run finds
 * nothing to do and writes nothing.
 */
async function repairVehicle(
  vehicleId: string,
  owner: ReturnType<typeof mapLegacyOwner>,
  legacyStatusNote: string,
  actorId: string,
): Promise<void> {
  const current = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: {
      status: true,
      declaredAt: true,
      notes: true,
      owner: { select: { id: true } },
    },
  });

  const officerActedOnStatus =
    (await prisma.auditEvent.count({
      where: {
        subjectType: 'vehicle',
        subjectId: vehicleId,
        action: { in: ['vehicle.declare', 'vehicle.status_change'] },
      },
    })) > 0;

  const fixStatus =
    !officerActedOnStatus &&
    (current.status !== 'ON_RECORD' || current.declaredAt !== null);
  const addNote = !(current.notes ?? '').includes('Legacy status:');
  const addOwner = current.owner === null && owner !== null;

  if (!fixStatus && !addOwner) {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...(fixStatus ? { status: 'ON_RECORD', declaredAt: null } : {}),
          ...(fixStatus && addNote
            ? {
                notes: current.notes
                  ? `${current.notes} ${legacyStatusNote}`
                  : legacyStatusNote,
              }
            : {}),
          ...(addOwner
            ? {
                owner: {
                  create: {
                    ownerName: owner!.ownerName,
                    ownerPhone: owner!.ownerPhone,
                    ownerAddress: owner!.ownerAddress,
                  },
                },
              }
            : {}),
        },
      });

      await tx.auditEvent.create({
        data: {
          action: 'vehicle.migrate_repair',
          subjectType: 'vehicle',
          subjectId: vehicleId,
          actorUserId: actorId,
          beforeValue: {
            status: current.status,
            declared: current.declaredAt !== null,
            ownerRecorded: current.owner !== null,
          },
          afterValue: {
            status: fixStatus ? 'ON_RECORD' : current.status,
            declared: fixStatus ? false : current.declaredAt !== null,
            ownerRecorded: current.owner !== null || addOwner,
          },
          reason:
            'Correction of a pre-revision-1.2 legacy import: migrated vehicles are on record only, ' +
            'never declared (ARCHITECTURE.md Decision 6.5), and carry their owner details ' +
            '(PRD Requirement 25.4). PRD Requirement 18.2 correction event.',
        },
      });
    });
    report.vehicleRepaired();
  } catch (error) {
    report.vehicleFailed(vehicleId, `repair failed: ${(error as Error).message}`);
  }
}

async function importVehicles(
  rows: Record<string, string>[],
  actorId: string,
  orgs: LegacyOrganisations,
): Promise<Map<string, ImportedVehicle>> {
  const categories = await prisma.vehicleCategory.findMany({
    select: { id: true, code: true },
  });
  const categoryByCode = new Map(categories.map((c) => [c.code, c.id]));

  const byLegacyId = new Map<string, ImportedVehicle>();

  for (const row of rows) {
    const legacyId = row.id;
    if (!legacyId) {
      continue;
    }

    let plateNumberNormalized: string;
    try {
      plateNumberNormalized = normalizePlateNumber(row.plate_number ?? '');
    } catch (error) {
      report.vehicleFailed(
        legacyId,
        `invalid plate number: ${(error as Error).message}`,
      );
      continue;
    }

    const matchedLga = matchLgaByName(row.lga_name, ANAMBRA_LGA_SEED);
    const branchId = matchedLga
      ? orgs.branchByLgaCode.get(matchedLga.code)!
      : orgs.unclassifiedBranchId;
    if (!matchedLga) {
      report.noLga(legacyId, row.plate_number ?? '');
    }

    const blacklisted = parseLegacyBoolean(row.blacklisted);
    const { status, legacyStatusNote, flagged } = mapDeclarationStatus(
      row.status,
      blacklisted,
    );
    if (flagged) {
      report.vehicleStatusFlagged(
        legacyId,
        row.plate_number ?? '',
        row.status ?? '',
        status,
      );
    }

    const categoryCode = blankToNull(row.category)?.toUpperCase() ?? null;
    const vehicleCategoryId = categoryCode
      ? (categoryByCode.get(categoryCode) ?? null)
      : null;

    // Requirement 25.4 — owner details as recorded; gaps reported, not filled.
    const owner = mapLegacyOwner(row.owner_jsonb);
    if (!owner || owner.missing.length > 0) {
      report.ownerIncomplete(
        legacyId,
        row.plate_number ?? '',
        owner ? owner.missing.join(', ') : 'no owner record',
      );
    }

    // Reruns write nothing: an already-migrated row is skipped outright, so no
    // second audit event is written for a row nothing happened to.
    const existing = await prisma.vehicle.findUnique({
      where: { legacyId },
      select: { id: true, branchId: true },
    });
    if (existing) {
      byLegacyId.set(legacyId, {
        id: existing.id,
        branchId: existing.branchId ?? branchId,
      });
      report.vehicleAlreadyPresent();
      if (REPAIR) {
        await repairVehicle(existing.id, owner, legacyStatusNote, actorId);
      }
      continue;
    }

    // A plate already recorded or declared through the System since go-live
    // keeps that record; importing beside it would give one vehicle two
    // (Decision 6.6). Listed for staff instead.
    const standing = await prisma.vehicle.findFirst({
      where: {
        plateNumberNormalized,
        status: { in: [...RECORD_BLOCKING_STATUSES] },
      },
      select: { id: true },
    });
    if (standing) {
      report.vehicleFailed(
        legacyId,
        `plate already has a live record in the System (${standing.id}); not imported beside it`,
      );
      continue;
    }

    try {
      const vehicle = await prisma.$transaction(async (tx) => {
        const created = await tx.vehicle.create({
          data: {
            legacyId,
            plateNumberNormalized,
            plateNumberDisplay: row.plate_number ?? plateNumberNormalized,
            vehicleCategoryId,
            make: blankToNull(row.vehicle_make),
            model: blankToNull(row.model),
            color: blankToNull(row.color),
            chassisVinRestricted: blankToNull(row.vin),
            branchId,
            unitId: null,
            status,
            isLegacyImport: true,
            notes: `Migrated from legacy vehicle record ${legacyId}. ${legacyStatusNote}`,
            // ARCHITECTURE.md Decision 6.5 — explicitly null, overriding the
            // column's now() default. A migrated vehicle is never declared,
            // so the legacy row's created_at describes when the OLD system
            // recorded it, not when this System's declare-first rule was
            // satisfied. Stamping it here would misrepresent an ON_RECORD
            // row as if it had been through vehicle.declare.
            declaredAt: null,
            // Route type deliberately absent (VEH-26): the legacy
            // BUS_INTERSTATE/BUS_INTRASTATE categories are not mapped onto
            // it. It is given at declaration or onboarding.
            ...(owner
              ? {
                  owner: {
                    create: {
                      ownerName: owner.ownerName,
                      ownerPhone: owner.ownerPhone,
                      ownerAddress: owner.ownerAddress,
                    },
                  },
                }
              : {}),
          },
        });

        await tx.auditEvent.create({
          data: {
            action: 'vehicle.migrate',
            subjectType: 'vehicle',
            subjectId: created.id,
            organisationId: branchId,
            actorUserId: actorId,
            // Owner values stay in vehicle_owner; the audit records only that
            // they were carried across.
            afterValue: {
              legacyId,
              plateNumberNormalized,
              status,
              ownerRecorded: owner !== null,
            },
            reason: 'Legacy migration (item 09, PRD §9.5).',
          },
        });

        return created;
      });

      byLegacyId.set(legacyId, { id: vehicle.id, branchId });
      report.vehicleImported();
    } catch (error) {
      report.vehicleFailed(legacyId, (error as Error).message);
    }
  }

  return byLegacyId;
}

/**
 * The Transpay register (PRD Requirement 9A.3, item 17). Every barcode in the
 * export becomes an unattached sticker bound to the normalised plate the export
 * records for it. Reattachment is checked against that plate with no override
 * (VEH-16), so it is copied, never corrected.
 *
 * The register is closed (VEH-21): this is the only code that ever writes a
 * `legacyBarcode`, and nothing reaches it from the API. Each row also gets an
 * opaque `stickerQrId`, required on every sticker, which is never printed and
 * identifies nothing outside the System.
 *
 * Independent of the vehicle import: a barcode goes on the register even if its
 * vehicle row failed, because the plate binding comes from the export row
 * itself. Reruns skip barcodes already present and write nothing.
 */
async function importRegister(
  rows: Record<string, string>[],
  actorId: string,
): Promise<void> {
  for (const row of rows) {
    const legacyId = row.id ?? 'unknown';
    const entry = mapLegacyRegisterEntry(row.barcode, row.security_code);
    if (!entry) {
      report.rowWithoutBarcode();
      continue;
    }

    let registeredPlateNormalized: string;
    try {
      registeredPlateNormalized = normalizePlateNumber(row.plate_number ?? '');
    } catch (error) {
      report.barcodeFailed(
        legacyId,
        `invalid plate number: ${(error as Error).message}`,
      );
      continue;
    }

    const existing = await prisma.sticker.findUnique({
      where: { legacyBarcode: entry.legacyBarcode },
      select: { id: true },
    });
    if (existing) {
      report.barcodeAlreadyPresent();
      continue;
    }

    try {
      const stickerQrId = await allocateStickerQrId();
      await prisma.$transaction(async (tx) => {
        const created = await tx.sticker.create({
          data: {
            stickerQrId,
            legacyBarcode: entry.legacyBarcode,
            legacySecurityCode: entry.legacySecurityCode,
            registeredPlateNormalized,
            // Printed long ago and never attached through this System
            // (Requirement 10.3). `ISSUED -> ACTIVE` is attachment.
            status: 'ISSUED',
            templateVersion: 'transpay-legacy',
          },
          select: { id: true },
        });

        await tx.auditEvent.create({
          data: {
            action: 'sticker.legacy_import',
            subjectType: 'sticker',
            subjectId: created.id,
            actorUserId: actorId,
            // The barcode and its plate are the register entry. The security
            // code is restricted (Requirement 9A.5), so only its presence is
            // recorded here.
            afterValue: {
              legacyId,
              legacyBarcode: entry.legacyBarcode,
              registeredPlateNormalized,
              securityCodeRecorded: entry.legacySecurityCode !== null,
            },
            reason: 'Transpay register import (item 17, PRD Requirement 9A.3).',
          },
        });
      });
      report.barcodeImported();
    } catch (error) {
      report.barcodeFailed(legacyId, (error as Error).message);
    }
  }
}

async function allocateStickerQrId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateIdentifier(() => randomInt(256));
    const clash = await prisma.sticker.findUnique({
      where: { stickerQrId: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  throw new Error('Could not allocate a sticker identifier after 5 attempts.');
}

async function allocateMembershipNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateIdentifier(() => randomInt(256));
    const clash = await prisma.member.findUnique({
      where: { membershipNumber: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  throw new Error('Could not allocate a membership number after 5 attempts.');
}

async function importMembers(
  rows: Record<string, string>[],
  actorId: string,
  orgs: LegacyOrganisations,
  vehiclesByLegacyId: Map<string, ImportedVehicle>,
): Promise<void> {
  for (const row of rows) {
    const legacyId = row.id;
    const name = blankToNull(row.name);
    if (!legacyId || !name) {
      if (legacyId) {
        report.memberFailed(legacyId, 'no name on record');
      }
      continue;
    }

    const { firstName, surname } = splitLegacyName(name);
    const blacklisted = parseLegacyBoolean(row.blacklisted);
    const { status, flagged } = mapMemberStatus(row.status, blacklisted);
    if (flagged) {
      report.memberStatusFlagged(legacyId, row.status ?? '', status);
    }

    const linkedVehicle = row.vehicleId
      ? vehiclesByLegacyId.get(row.vehicleId)
      : undefined;
    const organisationId = linkedVehicle?.branchId ?? orgs.unclassifiedBranchId;

    const phone = blankToNull(row.phone);
    const address = blankToNull(row.address);

    // Reruns write nothing — same reasoning as vehicles.
    const existing = await prisma.member.findUnique({
      where: { legacyId },
      select: { id: true },
    });
    if (existing) {
      report.memberAlreadyPresent();
      continue;
    }

    try {
      const membershipNumber = await allocateMembershipNumber();

      await prisma.$transaction(async (tx) => {
        const created = await tx.member.create({
          data: {
            legacyId,
            surname,
            firstName,
            status,
            membershipNumber,
            organisationId,
          },
        });

        if (phone && address) {
          await tx.memberContact.upsert({
            where: { memberId: created.id },
            create: { memberId: created.id, phone, residentialAddress: address },
            update: {},
          });
        } else {
          report.noContact(legacyId);
        }

        // MIG-04 (answered): the driver is the member. `vehicleId` is an
        // explicit foreign key already in the legacy data, not an inference,
        // so the driver is linked to that vehicle — in the same transaction
        // and audit event as the member, never as an unaudited write after.
        if (linkedVehicle) {
          await tx.vehicle.update({
            where: { id: linkedVehicle.id },
            data: { declaredByMemberId: created.id },
          });
        }

        await tx.auditEvent.create({
          data: {
            action: 'member.migrate',
            subjectType: 'member',
            subjectId: created.id,
            organisationId,
            actorUserId: actorId,
            afterValue: {
              legacyId,
              membershipNumber,
              status,
              drivesVehicleId: linkedVehicle?.id ?? null,
            },
            reason: 'Legacy migration (item 09, PRD §9.5).',
          },
        });
      });

      report.memberImported();
    } catch (error) {
      report.memberFailed(legacyId, (error as Error).message);
    }
  }
}

/** Vehicles that stayed unmatched to any member — everything else is by construction. */
async function reportUnattachedVehicles(
  vehiclesByLegacyId: Map<string, ImportedVehicle>,
): Promise<void> {
  const ids = [...vehiclesByLegacyId.values()].map((v) => v.id);
  const unattached = await prisma.vehicle.findMany({
    where: { id: { in: ids }, declaredByMemberId: null },
    select: { legacyId: true, plateNumberDisplay: true },
  });
  for (const vehicle of unattached) {
    report.unattached(vehicle.legacyId ?? 'unknown', vehicle.plateNumberDisplay);
  }
}

async function main(): Promise<void> {
  const dataDir =
    process.env.LEGACY_DATA_DIR ??
    path.resolve(import.meta.dirname, '../../../../data');

  console.log(
    `Legacy migration — reading from ${dataDir}${REPAIR ? ' (with --repair)' : ''}`,
  );

  const actor = await ensureMigrationActor();
  const orgs = await ensureLegacyOrganisations();

  const vehicleRows = readLegacyCsv(path.join(dataDir, 'vehicles_full.csv'));
  const driverRows = readLegacyCsv(path.join(dataDir, 'drivers.csv'));

  console.log(`  vehicles_full.csv: ${vehicleRows.length} rows`);
  console.log(`  drivers.csv: ${driverRows.length} rows`);

  const vehiclesByLegacyId = await importVehicles(vehicleRows, actor.id, orgs);
  await importMembers(driverRows, actor.id, orgs, vehiclesByLegacyId);
  await importRegister(vehicleRows, actor.id);

  // Every row-level write above is individually try/caught and safe to
  // retry (idempotent, keyed by legacyId). This closing query is not a
  // write at all, but losing the report to the same transient connectivity
  // this session has seen throughout, after everything of substance has
  // already committed, would be a worse outcome than a report that admits
  // it could not finish this section.
  try {
    await reportUnattachedVehicles(vehiclesByLegacyId);
  } catch (error) {
    console.error(
      `Could not compute the unattached-vehicle list: ${(error as Error).message}`,
    );
  }

  const reportDir = path.resolve(import.meta.dirname, '../../../../.migration-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    `legacy-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
  );
  writeFileSync(reportPath, report.render(), 'utf-8');

  console.log(`Done. Reconciliation report: ${reportPath}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

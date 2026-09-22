import { createHash, randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ANAMBRA_LGA_SEED } from '@nurtw/contracts';
import { generateIdentifier, normalizePlateNumber } from '@nurtw/domain';

import { hashPassword } from '../../src/auth/password-hashing.ts';
import { readLegacyCsv } from './csv.ts';
import {
  blankToNull,
  mapDeclarationStatus,
  mapMemberStatus,
  matchLgaByName,
  parseLegacyBoolean,
  splitLegacyName,
} from './mapping.ts';
import { ReconciliationReport } from './report.ts';

/**
 * Legacy data migration (roadmap item 09, PRD §25, `plans/09-legacy-data-migration.md`).
 *
 * Imports `drivers.csv` as members and `vehicles_full.csv` as vehicle
 * declarations. Idempotent: every write is keyed by `legacyId`, so rerunning
 * this script against an already-migrated database only tops up rows added
 * to the export since the last run — it never duplicates.
 *
 * What this deliberately does NOT do, and why:
 *
 *   * Import `sticker_requests.csv` — needs item 08's schema, not yet built.
 *     Phase 2, picked up once that item ships.
 *   * Import `next_of_kin`, `identification`, or `license` from
 *     `drivers.csv` — no unambiguous field to place them in without
 *     inventing a schema change this item was not scoped to make.
 *   * Infer a vehicle's local government area from address text when one is
 *     not recorded (PRD §23.18 forbids it) — a missing LGA is imported
 *     blank, under the "Unclassified" placeholder branch, and listed in the
 *     reconciliation report.
 *   * Resolve QUESTIONS.md MIG-04 (is the vehicle owner a member, the
 *     driver, or both) or MIG-06 (what blacklisted/inactive should mean) —
 *     both are Union decisions. This script takes the interim positions
 *     already recorded against them (see `mapping.ts`) and flags every
 *     record affected for review rather than deciding on the Union's behalf.
 */

const MIGRATION_ACTOR_EMAIL = 'legacy-migration@nurtw.internal';

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
    const { status, flagged } = mapDeclarationStatus(row.status, blacklisted);
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

    const declaredAt = row.created_at ? new Date(row.created_at) : null;

    try {
      const vehicle = await prisma.$transaction(async (tx) => {
        const created = await tx.vehicle.upsert({
          where: { legacyId },
          create: {
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
            notes: `Migrated from legacy vehicle record ${legacyId}.`,
            ...(declaredAt && !Number.isNaN(declaredAt.getTime())
              ? { declaredAt }
              : {}),
          },
          update: {},
        });

        await tx.auditEvent.create({
          data: {
            action: 'vehicle.migrate',
            subjectType: 'vehicle',
            subjectId: created.id,
            organisationId: branchId,
            actorUserId: actorId,
            afterValue: { legacyId, plateNumberNormalized, status },
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

    try {
      const membershipNumber = await allocateMembershipNumber();

      const member = await prisma.$transaction(async (tx) => {
        const created = await tx.member.upsert({
          where: { legacyId },
          create: {
            legacyId,
            surname,
            firstName,
            status,
            membershipNumber,
            organisationId,
          },
          update: {},
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

        await tx.auditEvent.create({
          data: {
            action: 'member.migrate',
            subjectType: 'member',
            subjectId: created.id,
            organisationId,
            actorUserId: actorId,
            afterValue: { legacyId, membershipNumber, status },
            reason: 'Legacy migration (item 09, PRD §9.5).',
          },
        });

        return created;
      });

      // Owner reconciliation, MIG-04's "import as recorded" interim
      // position: `vehicleId` is an explicit foreign key already in the
      // legacy data, not an inference.
      if (linkedVehicle) {
        await prisma.vehicle.update({
          where: { id: linkedVehicle.id },
          data: { declaredByMemberId: member.id },
        });
      }

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

  console.log(`Legacy migration — reading from ${dataDir}`);

  const actor = await ensureMigrationActor();
  const orgs = await ensureLegacyOrganisations();

  const vehicleRows = readLegacyCsv(path.join(dataDir, 'vehicles_full.csv'));
  const driverRows = readLegacyCsv(path.join(dataDir, 'drivers.csv'));

  console.log(`  vehicles_full.csv: ${vehicleRows.length} rows`);
  console.log(`  drivers.csv: ${driverRows.length} rows`);

  const vehiclesByLegacyId = await importVehicles(vehicleRows, actor.id, orgs);
  await importMembers(driverRows, actor.id, orgs, vehiclesByLegacyId);

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

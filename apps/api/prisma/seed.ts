import { createHash } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  ANAMBRA_LGA_SEED,
  ANAMBRA_STATE_NAME,
  DESIGNATION_SEED,
  LEGACY_VEHICLE_CATEGORY_SEED,
  PERMISSIONS,
  SYSTEM_ROLES,
} from '@nurtw/contracts';

import { hashPassword } from '../src/auth/password-hashing.ts';
import { LAUNCH_FEE_TYPES } from '../src/payments/launch-fee-types.ts';

/**
 * Idempotent seed.
 *
 * Establishes the permission catalogue, the eleven system roles of PRD §16, the
 * organisational root, and the master data the Union administers thereafter.
 * Every write is an upsert, so running it twice is harmless and running it after
 * a schema change tops up rather than duplicating.
 *
 * What this does NOT do:
 *
 *   * Seed a default administrator password. A known credential in a seed script
 *     reaches production far more often than anyone expects. An administrator is
 *     created only when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are both
 *     supplied by the operator.
 *   * Import legacy records. That is roadmap item 09, and it produces a
 *     reconciliation report this script deliberately does not.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function seedPermissions(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        code: permission.code,
        description: permission.description,
        requiresStepUp: false,
      },
      // Description may be reworded; requiresStepUp is operator-controlled at
      // runtime (Decision 9.7.3) so the seed must not stamp over it.
      update: { description: permission.description },
    });
  }
  console.log(`  permissions: ${PERMISSIONS.length}`);
}

async function seedRoles(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const record = await prisma.role.upsert({
      where: { code: role.code },
      create: {
        code: role.code,
        label: role.label,
        description: role.description,
        isSystem: true,
      },
      update: {
        label: role.label,
        description: role.description,
        isSystem: true,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...role.permissions] } },
      select: { id: true },
    });

    if (permissions.length !== role.permissions.length) {
      throw new Error(
        `Role ${role.code} references a permission absent from the catalogue. ` +
          'Seed permissions before roles.',
      );
    }

    // Replace the bundle wholesale. A system role is immutable from the
    // interface (Decision 9.5), so the seed is the only thing that defines it,
    // and a permission removed from the definition must disappear here too.
    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: record.id,
        permissionId: permission.id,
      })),
    });
  }
  console.log(`  system roles: ${SYSTEM_ROLES.length}`);
}

/**
 * PRD Requirement 6.1 — every level of the hierarchy exists in the model even
 * where the Union does not presently operate one, so that an administrator's
 * scope stays expressible at any depth. Placeholder nodes are named so nobody
 * mistakes them for real Union structure; item 04 replaces them.
 */
async function seedOrganisation(): Promise<string> {
  const council = await prisma.organisation.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'NURTW Anambra State Council',
      level: 'COUNCIL',
      // PRD §23.2 — the issuing council's state, printed on the card. Distinct
      // from a member's state of origin.
      stateName: 'ANAMBRA',
      path: '/00000000-0000-4000-8000-000000000001/',
    },
    update: {},
  });

  let parentId = council.id;
  let path = council.path;

  const placeholders = [
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Unassigned Zone',
      level: 'ZONE',
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Unassigned Branch',
      level: 'BRANCH',
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Unassigned Unit',
      level: 'UNIT',
    },
  ] as const;

  for (const node of placeholders) {
    path = `${path}${node.id}/`;
    await prisma.organisation.upsert({
      where: { id: node.id },
      create: {
        id: node.id,
        name: node.name,
        level: node.level,
        parentId,
        path,
      },
      update: {},
    });
    parentId = node.id;
  }

  console.log('  organisation: council + 3 placeholder levels');
  return council.id;
}

/** A stable id derived from its inputs, so re-running the seed upserts the same row. */
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
 * The Union's zones, answered as **ORG-05** on 14 September 2026: the 21 LGAs
 * *are* the zones. Unlike branches and units, this part of ORG-05 is a real
 * Union answer, not a placeholder — seeded unconditionally, the same way the
 * LGA list itself is.
 *
 * Branches within each zone remain unanswered. These zone nodes carry no
 * branch until one is added — through the interface, or by
 * `seedDemoOrganisation` below when a demo needs one.
 */
async function seedZones(councilId: string): Promise<void> {
  const council = await prisma.organisation.findUniqueOrThrow({
    where: { id: councilId },
  });

  for (const lga of ANAMBRA_LGA_SEED) {
    const id = stableId('zone', lga.code);
    await prisma.organisation.upsert({
      where: { id },
      create: {
        id,
        name: lga.name,
        level: 'ZONE',
        parentId: council.id,
        path: `${council.path}${id}/`,
      },
      update: {},
    });
  }
  console.log(`  zones: ${ANAMBRA_LGA_SEED.length} (the LGAs, per ORG-05)`);
}

/**
 * One demo branch and unit under every zone, so a demo deployment can
 * complete a registration without waiting on the Union's real branch list.
 *
 * **Not a Union answer.** Names are marked "(demo)" so nobody mistakes them
 * for real structure the way the old "Unassigned" placeholder was marked —
 * see the module comment on `seedOrganisation`. Runs only when
 * `SEED_DEMO_DATA=true`, so a production deployment never gets invented
 * branches by default.
 */
async function seedDemoOrganisation(): Promise<void> {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log(
      '  demo branches/units: skipped (set SEED_DEMO_DATA=true for a demo deployment)',
    );
    return;
  }

  for (const lga of ANAMBRA_LGA_SEED) {
    const zoneId = stableId('zone', lga.code);
    const zone = await prisma.organisation.findUniqueOrThrow({
      where: { id: zoneId },
    });

    const branchId = stableId('branch', lga.code);
    const branchPath = `${zone.path}${branchId}/`;
    await prisma.organisation.upsert({
      where: { id: branchId },
      create: {
        id: branchId,
        name: `${lga.name} Branch (demo)`,
        level: 'BRANCH',
        parentId: zone.id,
        path: branchPath,
      },
      update: {},
    });

    const unitId = stableId('unit', lga.code);
    await prisma.organisation.upsert({
      where: { id: unitId },
      create: {
        id: unitId,
        name: `${lga.name} Unit (demo)`,
        level: 'UNIT',
        parentId: branchId,
        path: `${branchPath}${unitId}/`,
      },
      update: {},
    });
  }
  console.log(
    `  demo branches/units: 1 each under all ${ANAMBRA_LGA_SEED.length} zones`,
  );
}

/**
 * A plausible designation list for a demo deployment, standing in for
 * **ORG-06** until the Union supplies the approved one.
 *
 * Deliberately kept out of `DESIGNATION_SEED` in `@nurtw/contracts` — that
 * list is empty on purpose (see its own comment) because inventing values
 * there would place them in front of every seed run, demo or not. These codes
 * are prefixed `DEMO_` so they are easy to find and remove once ORG-06 is
 * answered; the printed *label* is left clean, because it is meant to look
 * right on a demo card, not to announce itself as a placeholder.
 */
const DEMO_DESIGNATIONS = [
  { code: 'DEMO_CHAIRMAN', label: 'Chairman' },
  { code: 'DEMO_SECRETARY', label: 'Secretary' },
  { code: 'DEMO_TREASURER', label: 'Treasurer' },
  { code: 'DEMO_FINANCIAL_SECRETARY', label: 'Financial Secretary' },
  { code: 'DEMO_PRO', label: 'Public Relations Officer' },
  { code: 'DEMO_AUDITOR', label: 'Auditor' },
  { code: 'DEMO_DRIVER', label: 'Driver' },
  { code: 'DEMO_CONDUCTOR', label: 'Conductor' },
] as const;

async function seedDemoDesignations(): Promise<void> {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log(
      '  demo designations: skipped (set SEED_DEMO_DATA=true for a demo deployment)',
    );
    return;
  }

  for (const [index, designation] of DEMO_DESIGNATIONS.entries()) {
    await prisma.designation.upsert({
      where: { code: designation.code },
      create: {
        code: designation.code,
        label: designation.label,
        sortOrder: index,
      },
      update: {},
    });
  }
  console.log(`  demo designations: ${DEMO_DESIGNATIONS.length}`);
}

/**
 * PRD §23.4 — master data is administrable, seeded from the legacy export and
 * corrected by the Union thereafter. `update: {}` is deliberate: a label the
 * Union has already corrected must not be reset by re-running the seed.
 */
async function seedVehicleCategories(): Promise<void> {
  for (const [index, category] of LEGACY_VEHICLE_CATEGORY_SEED.entries()) {
    await prisma.vehicleCategory.upsert({
      where: { code: category.code },
      create: { code: category.code, label: category.label, sortOrder: index },
      update: {},
    });
  }
  console.log(`  vehicle categories: ${LEGACY_VEHICLE_CATEGORY_SEED.length}`);
}

/**
 * The twenty-one local government areas of Anambra State.
 *
 * Public administrative geography, not personal data, and cross-checked against
 * the legacy export, which carries these same areas across the vehicles that
 * record one. Seeded because the registration form of PRD §7 cannot be completed
 * without it and item 09's reconciliation matches against it.
 *
 * `stateName` is stored per row rather than assumed, so a second state council
 * can be onboarded without a migration (§23.2).
 */
async function seedLgas(): Promise<void> {
  for (const lga of ANAMBRA_LGA_SEED) {
    await prisma.lga.upsert({
      where: { code: lga.code },
      create: { code: lga.code, name: lga.name, stateName: ANAMBRA_STATE_NAME },
      update: {},
    });
  }
  console.log(`  local government areas: ${ANAMBRA_LGA_SEED.length}`);
}

/**
 * Designations, of which there are deliberately none.
 *
 * PRD §23.4 directs that master data be seeded from the legacy export. The export
 * carries no designation list — `owner_account_role` holds the previous software's
 * *account* roles, not a member's approved NURTW designation — so there is nothing
 * to seed. Inventing a list would place values carrying the appearance of Union
 * authority in front of an administrator without it.
 *
 * The loop stays so that the moment the Union supplies a list, it seeds through
 * the same idempotent path as every other collection rather than through a
 * one-off script.
 */
async function seedDesignations(): Promise<void> {
  for (const [index, designation] of DESIGNATION_SEED.entries()) {
    await prisma.designation.upsert({
      where: { code: designation.code },
      create: {
        code: designation.code,
        label: designation.label,
        sortOrder: index,
      },
      update: {},
    });
  }
  console.log(
    DESIGNATION_SEED.length === 0
      ? '  designations: none (created by the Union through the interface, PRD §23.4)'
      : `  designations: ${DESIGNATION_SEED.length}`,
  );
}

/**
 * PRD Requirement 14.1 and 13.3 — limits and thresholds must be adjustable by an
 * administrator at runtime. These rows are the initial values, not the authority:
 * once set, the Union owns them, so the seed must never overwrite them.
 */
async function seedSystemSettings(): Promise<void> {
  const settings = [
    {
      key: 'aggregate.suppression_floor',
      value: '25',
      description:
        'Aggregate totals below this are returned as SUPPRESSED (PRD §23.12).',
    },
    {
      key: 'api_token.expiry_days',
      value: '90',
      description: 'External API token lifetime in days (PRD §12.6).',
    },
    {
      key: 'session.lifetime_hours',
      value: '12',
      description: 'Internal session lifetime in hours.',
    },
    {
      key: 'approval.require_separate_officer',
      value: 'false',
      description:
        'When true, the officer who recorded a membership application may not decide it, ' +
        'and the officer who prepared a card may not approve it. Off pending QUESTIONS.md ' +
        'MEM-04: with one administrator account, enforcing it makes a registration ' +
        'impossible to complete.',
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {},
    });
  }
  console.log(`  system settings: ${settings.length}`);
}

/**
 * PRD Requirement 27.1/27.2 — fee types are data, and the launch amounts are
 * not placeholders. Idempotent (`upsert` on `code`): re-running this never
 * resets an amount a super administrator has since changed in settings.
 */
async function seedFeeTypes(): Promise<void> {
  for (const feeType of LAUNCH_FEE_TYPES) {
    await prisma.feeType.upsert({
      where: { code: feeType.code },
      create: feeType,
      update: {},
    });
  }
  console.log(`  fee types: ${LAUNCH_FEE_TYPES.length}`);
}

/**
 * Creates a super administrator, and only when the operator supplies both
 * credentials.
 *
 * There is deliberately no default password. A known credential in a seed script
 * reaches production far more often than anyone expects, and this account holds
 * `vehicle.declare` and every other permission in the catalogue.
 *
 * The password is never echoed, and the account is assigned at the council root
 * so its scope covers the whole Union (ARCHITECTURE.md Decision 9.4).
 */
async function seedAdministrator(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      '  administrator: none (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one)',
    );
    return;
  }

  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('  administrator: already present, left untouched');
    return;
  }

  const [role, council] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMINISTRATOR' } }),
    prisma.organisation.findFirstOrThrow({ where: { level: 'COUNCIL' } }),
  ]);

  const user = await prisma.user.create({
    data: {
      email,
      fullName: process.env.SEED_ADMIN_NAME?.trim() || 'System Administrator',
      passwordHash: await hashPassword(password),
    },
  });

  await prisma.userRoleAssignment.create({
    data: { userId: user.id, roleId: role.id, organisationId: council.id },
  });

  console.log(
    `  administrator: created ${email} as SUPER_ADMINISTRATOR at council scope`,
  );
}

async function main(): Promise<void> {
  console.log('Seeding:');
  await seedPermissions();
  await seedRoles();
  const councilId = await seedOrganisation();
  await seedVehicleCategories();
  await seedDesignations();
  await seedLgas();
  await seedZones(councilId);
  await seedDemoOrganisation();
  await seedDemoDesignations();
  await seedSystemSettings();
  await seedFeeTypes();

  await seedAdministrator();

  console.log('Done.');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  LEGACY_VEHICLE_CATEGORY_SEED,
  PERMISSIONS,
  SYSTEM_ROLES,
} from '@nurtw/contracts';

import { hashPassword } from '../src/auth/password-hashing.ts';

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
  await seedOrganisation();
  await seedVehicleCategories();
  await seedSystemSettings();

  await seedAdministrator();

  console.log('Done.');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * Master data — administrable, and never destructible.
 *
 * The properties under test are the ones that protect existing records: a code
 * cannot be changed once other rows reference it, and an entry withdrawn from
 * use is deactivated rather than removed.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const FIXTURE_TAG = 'e2e-fixture-md';
const PASSWORD = 'e2e-fixture-password-1';
const CODE = 'E2E_FIXTURE_CATEGORY';

describe('Master data (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let createdId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await cleanUp();

    const council = await prisma.organisation.findFirstOrThrow({
      where: { level: 'COUNCIL' },
    });
    const [read, manage] = await Promise.all([
      prisma.permission.findUniqueOrThrow({ where: { code: 'master_data.read' } }),
      prisma.permission.findUniqueOrThrow({
        where: { code: 'master_data.manage' },
      }),
    ]);

    const user = await prisma.user.create({
      data: {
        email: `admin.${FIXTURE_TAG}@nurtw.test`,
        fullName: 'master data fixture',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    for (const permission of [read, manage]) {
      await prisma.userPermissionGrant.create({
        data: {
          userId: user.id,
          permissionId: permission.id,
          organisationId: council.id,
          grantedByUserId: user.id,
          reason: 'e2e fixture',
        },
      });
    }

    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: `admin.${FIXTURE_TAG}@nurtw.test`, password: PASSWORD })
      .expect(200);
    const raw = response.headers['set-cookie'];
    cookie = (Array.isArray(raw) ? raw[0]! : raw!).split(';')[0]!;
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  it('seeds the twenty-one Anambra local government areas', async () => {
    const response = await request(server)
      .get('/api/v1/master-data/lgas')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.lgas.length).toBeGreaterThanOrEqual(21);
    const names = response.body.lgas.map((lga: { name: string }) => lga.name);
    expect(names).toContain('Idemili North');
    expect(names).toContain('Awka South');
  });

  it('seeds no designations, leaving the list for the Union to populate', async () => {
    // PRD §23.4 — the legacy export carries no designation list, and inventing
    // one would present values with the appearance of Union authority.
    const response = await request(server)
      .get('/api/v1/master-data/designations')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.entries).toEqual([]);
  });

  it('rejects an unknown collection without touching the database', async () => {
    // The parameter selects a Prisma model, so an unchecked value would be a
    // caller-supplied model selector.
    await request(server)
      .get('/api/v1/master-data/users')
      .set('Cookie', cookie)
      .expect(400);
  });

  it('creates an entry', async () => {
    const response = await request(server)
      .post('/api/v1/master-data/vehicle-categories')
      .set('Cookie', cookie)
      .send({ code: CODE, label: 'Fixture category', sortOrder: 99 })
      .expect(201);

    createdId = response.body.entry.id;
    expect(response.body.entry.code).toBe(CODE);
    expect(response.body.entry.isActive).toBe(true);
  });

  it('refuses a duplicate code rather than creating a second entry', async () => {
    await request(server)
      .post('/api/v1/master-data/vehicle-categories')
      .set('Cookie', cookie)
      .send({ code: CODE, label: 'Duplicate' })
      .expect(409);

    const count = await prisma.vehicleCategory.count({ where: { code: CODE } });
    expect(count).toBe(1);
  });

  it('rejects a lower-case or punctuated code', async () => {
    // A code is a foreign key in all but name. Permitting case variation would
    // make Bus_Intrastate and BUS_INTRASTATE two categories that read as one.
    await request(server)
      .post('/api/v1/master-data/vehicle-categories')
      .set('Cookie', cookie)
      .send({ code: 'lower_case', label: 'Rejected' })
      .expect(400);

    await request(server)
      .post('/api/v1/master-data/vehicle-categories')
      .set('Cookie', cookie)
      .send({ code: 'HAS SPACE', label: 'Rejected' })
      .expect(400);
  });

  it('edits the label but leaves the code untouched', async () => {
    const response = await request(server)
      .patch(`/api/v1/master-data/vehicle-categories/${createdId}`)
      .set('Cookie', cookie)
      // `code` is not in the update schema, so it is stripped rather than applied.
      .send({ label: 'Fixture category, corrected', code: 'ATTEMPTED_RENAME' })
      .expect(200);

    expect(response.body.entry.label).toBe('Fixture category, corrected');
    expect(response.body.entry.code).toBe(CODE);

    const row = await prisma.vehicleCategory.findUniqueOrThrow({
      where: { id: createdId },
    });
    expect(row.code).toBe(CODE);
  });

  it('withdraws an entry by deactivating it, never by deleting it', async () => {
    await request(server)
      .patch(`/api/v1/master-data/vehicle-categories/${createdId}`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);

    const row = await prisma.vehicleCategory.findUnique({
      where: { id: createdId },
    });
    expect(row).not.toBeNull();
    expect(row?.isActive).toBe(false);

    // Withdrawn from the default listing...
    const active = await request(server)
      .get('/api/v1/master-data/vehicle-categories')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      active.body.entries.map((entry: { code: string }) => entry.code),
    ).not.toContain(CODE);

    // ...but still reachable, so historical references stay legible.
    const all = await request(server)
      .get('/api/v1/master-data/vehicle-categories?includeInactive=true')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      all.body.entries.map((entry: { code: string }) => entry.code),
    ).toContain(CODE);
  });

  it('records every change in the audit trail with before and after values', async () => {
    const events = await prisma.auditEvent.findMany({
      where: { subjectId: createdId, subjectType: 'vehicle_category' },
      orderBy: { createdAt: 'asc' },
    });

    expect(events.map((event) => event.action)).toEqual([
      'master_data.create',
      'master_data.update',
      'master_data.deactivate',
    ]);

    const deactivation = events[2]!;
    expect(deactivation.actorUserId).toBeTruthy();
    expect(JSON.stringify(deactivation.beforeValue)).toContain('"isActive":true');
    expect(JSON.stringify(deactivation.afterValue)).toContain('"isActive":false');
  });

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: FIXTURE_TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const categories = await prisma.vehicleCategory.findMany({
      where: { code: CODE },
      select: { id: true },
    });

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { subjectId: { in: categories.map((category) => category.id) } },
        ],
      },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.vehicleCategory.deleteMany({ where: { code: CODE } });
  }
});

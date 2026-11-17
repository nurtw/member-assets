import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * The counts and lists for officers (roadmap items 64 to 67). What carries weight:
 * every figure is taken inside the caller's own scope, the new-vehicles list never
 * carries a telephone or an address and shows the owner's name and the chassis
 * number only to `vehicle.read_restricted`, the declared figures reach only a
 * holder of `vehicle.declare`, and the imported members and vehicles are not
 * counted as onboarded.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-report';
const PASSWORD = 'e2e-fixture-password-1';
const OWNER_NAME = 'Fixture Owner Name';
const OWNER_PHONE = '08031112222';
const OWNER_ADDRESS = '12 Fixture Street';
const CHASSIS = 'E2E-REPORT-CHASSIS';

interface Fixture {
  councilId: string;
  branchAId: string;
  branchBId: string;
  vehicles: { v1: string; v2: string; v3: string; v4: string };
  officer1: { id: string; name: string };
  officer2: { id: string; name: string };
  baseline: { imported: number; added: number };
}

describe('Counts and lists for officers (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let fixture: Fixture;
  const cookies: Record<string, string> = {};

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
    fixture = await buildFixture();
    for (const who of ['admin', 'brancha', 'branchb', 'reader', 'officer1', 'officer2']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  const get = (who: string, path: string) =>
    request(server).get(`/api/v1${path}`).set('Cookie', cookies[who]!);

  describe('stickers by origin (item 64, VEH-41)', () => {
    it('counts the attached ones in the caller’s scope, by origin', async () => {
      const response = await get('brancha', '/reports/sticker-origins').expect(200);

      expect(response.body.counts.imported.attached).toBe(1);
      expect(response.body.counts.added.attached).toBe(1);
    });

    it('keeps the totals, which include stickers attached to nothing, from a narrower scope', async () => {
      const response = await get('brancha', '/reports/sticker-origins').expect(200);

      expect(response.body.counts.imported.total).toBeNull();
      expect(response.body.counts.added.total).toBeNull();
    });

    it('gives a whole-council scope the totals', async () => {
      const response = await get('admin', '/reports/sticker-origins').expect(200);

      // Other suites add stickers at the same time, so the totals are at least what this
      // fixture holds: two imported (one attached, one not) and two taken into stock.
      expect(response.body.counts.imported.total).toBeGreaterThanOrEqual(2);
      expect(response.body.counts.added.total).toBeGreaterThanOrEqual(2);
      expect(response.body.counts.imported.total).toBeGreaterThanOrEqual(
        response.body.counts.imported.attached,
      );
      expect(response.body.counts.imported.attached).toBe(1);
      expect(response.body.counts.added.attached).toBe(1);
    });

    it('counts nothing attached for a branch with no vehicle of the kind', async () => {
      const response = await get('branchb', '/reports/sticker-origins').expect(200);

      expect(response.body.counts.imported.attached).toBe(0);
      expect(response.body.counts.added.attached).toBe(0);
    });

    it('never says a scheme’s code or a name', async () => {
      const response = await get('admin', '/reports/sticker-origins').expect(200);

      expect(Object.keys(response.body.counts).sort()).toEqual(['added', 'imported']);
      expect(JSON.stringify(response.body)).not.toMatch(/barcode|legacy|REGISTER|STOCK/i);
    });

    it('is for a holder of sticker.read', async () => {
      await get('reader', '/reports/sticker-origins').expect(403);
    });
  });

  describe('the vehicles added through the System (item 65, VEH-42)', () => {
    it('lists the added ones in scope and leaves out the imported', async () => {
      const response = await get('brancha', '/reports/added-vehicles').expect(200);

      const ids = response.body.vehicles.map((vehicle: { id: string }) => vehicle.id);
      expect(ids.sort()).toEqual([fixture.vehicles.v1, fixture.vehicles.v2].sort());
      expect(response.body.total).toBe(2);
    });

    it('lists another branch’s only for a caller whose scope reaches it', async () => {
      const response = await get('admin', '/reports/added-vehicles').expect(200);

      const ids = response.body.vehicles.map((vehicle: { id: string }) => vehicle.id);
      expect(ids).toContain(fixture.vehicles.v4);
      expect(ids).not.toContain(fixture.vehicles.v3);
    });

    it('says who recorded it, when, and its sticker', async () => {
      const response = await get('brancha', '/reports/added-vehicles').expect(200);

      const first = response.body.vehicles.find(
        (vehicle: { id: string }) => vehicle.id === fixture.vehicles.v1,
      );
      expect(first.recordedBy).toBe(fixture.officer1.name);
      expect(Date.parse(first.recordedAt)).not.toBeNaN();
      expect(first.sticker).toEqual({ attached: true, status: 'ISSUED' });
      expect(first.organisation.name).toContain('Branch A');
      const second = response.body.vehicles.find(
        (vehicle: { id: string }) => vehicle.id === fixture.vehicles.v2,
      );
      expect(second.sticker).toEqual({ attached: false, status: null });
      expect(second.recordedBy).toBe(fixture.officer2.name);
    });

    it('shows the owner’s name and the chassis number only to vehicle.read_restricted', async () => {
      const restricted = await get('admin', '/reports/added-vehicles').expect(200);
      const plain = await get('brancha', '/reports/added-vehicles').expect(200);

      const seen = restricted.body.vehicles.find(
        (vehicle: { id: string }) => vehicle.id === fixture.vehicles.v1,
      );
      expect(seen.owner).toBe(OWNER_NAME);
      expect(seen.chassis).toBe(CHASSIS);
      const withheld = plain.body.vehicles.find(
        (vehicle: { id: string }) => vehicle.id === fixture.vehicles.v1,
      );
      expect(withheld).not.toHaveProperty('owner');
      expect(withheld).not.toHaveProperty('chassis');
      expect(JSON.stringify(plain.body)).not.toContain(OWNER_NAME);
      expect(JSON.stringify(plain.body)).not.toContain(CHASSIS);
    });

    it('never carries a telephone or an address, to anyone', async () => {
      const restricted = await get('admin', '/reports/added-vehicles').expect(200);

      const text = JSON.stringify(restricted.body);
      expect(text).not.toContain(OWNER_PHONE);
      expect(text).not.toContain(OWNER_ADDRESS);
      expect(text).not.toMatch(/phone|address/i);
    });

    it('shows whether a vehicle is declared only to a holder of vehicle.declare', async () => {
      const declarer = await get('admin', '/reports/added-vehicles').expect(200);
      const plain = await get('brancha', '/reports/added-vehicles').expect(200);

      const declared = declarer.body.vehicles.find(
        (vehicle: { id: string }) => vehicle.id === fixture.vehicles.v2,
      );
      expect(declared.declared).toBe(true);
      for (const vehicle of plain.body.vehicles) {
        expect(vehicle).not.toHaveProperty('declared');
      }
    });

    it('narrows by plate and by day, and pages', async () => {
      const byPlate = await get('brancha', '/reports/added-vehicles?q=rpt-v1').expect(200);
      expect(byPlate.body.vehicles).toHaveLength(1);
      expect(byPlate.body.total).toBe(1);

      const future = await get(
        'brancha',
        '/reports/added-vehicles?from=2099-01-01',
      ).expect(200);
      expect(future.body.vehicles).toEqual([]);

      const page = await get('brancha', '/reports/added-vehicles?limit=1').expect(200);
      expect(page.body.vehicles).toHaveLength(1);
      expect(page.body.total).toBe(2);
    });

    it('refuses a day that is not one, and a limit over 200', async () => {
      await get('brancha', '/reports/added-vehicles?from=2026-02-30').expect(400);
      await get('brancha', '/reports/added-vehicles?limit=201').expect(400);
    });

    it('is for a holder of vehicle.read', async () => {
      const nobody = await request(server).get('/api/v1/reports/added-vehicles');
      expect(nobody.status).toBe(401);
    });
  });

  describe('the onboarding report (item 66, GOV-25)', () => {
    it('counts each officer’s work for the day, in the caller’s scope', async () => {
      const response = await get('brancha', '/reports/onboarding').expect(200);

      const rows = response.body.report.rows;
      const one = rows.find(
        (row: { officer: { id: string } }) => row.officer.id === fixture.officer1.id,
      );
      expect(one).toMatchObject({
        officer: { name: fixture.officer1.name },
        membersRegistered: 1,
        vehiclesRecorded: 1,
        vehiclesDeclared: 0,
        stickersAttached: 2,
      });
      const two = rows.find(
        (row: { officer: { id: string } }) => row.officer.id === fixture.officer2.id,
      );
      expect(two).toMatchObject({
        membersRegistered: 0,
        vehiclesRecorded: 0,
        vehiclesDeclared: 1,
        stickersAttached: 0,
      });
      expect(response.body.report.totals).toEqual({
        membersRegistered: 1,
        vehiclesRecorded: 1,
        vehiclesDeclared: 1,
        stickersAttached: 2,
      });
    });

    it('counts what lies in another branch for a caller whose scope reaches it', async () => {
      const response = await get('admin', '/reports/onboarding').expect(200);

      const totals = response.body.report.totals;
      // Branch B adds a member and a recorded vehicle, by officer 2.
      expect(totals.membersRegistered).toBe(2);
      expect(totals.vehiclesRecorded).toBe(2);
    });

    it('does not count an imported member, or an imported vehicle’s recording', async () => {
      const response = await get('admin', '/reports/onboarding').expect(200);

      // The imported member has no registration record, so no officer registered them.
      expect(response.body.report.totals.membersRegistered).toBe(2);
    });

    it('names the officer and no one else’s details', async () => {
      const response = await get('brancha', '/reports/onboarding').expect(200);

      const text = JSON.stringify(response.body);
      expect(text).not.toMatch(/email|passwordHash|@nurtw\.test/i);
      for (const row of response.body.report.rows) {
        expect(Object.keys(row.officer).sort()).toEqual(['id', 'name']);
      }
    });

    it('reports a day a record falls outside as nothing', async () => {
      const response = await get(
        'brancha',
        '/reports/onboarding?from=2020-01-01&to=2020-01-05',
      ).expect(200);

      expect(response.body.report.rows).toEqual([]);
      expect(response.body.report.totals.membersRegistered).toBe(0);
    });

    it('refuses days that are not days, a reversed range, and more than 92 days', async () => {
      await get('brancha', '/reports/onboarding?from=2026-13-01').expect(400);
      await get('brancha', '/reports/onboarding?from=2026-11-10&to=2026-11-01').expect(400);
      await get('brancha', '/reports/onboarding?from=2026-01-01&to=2026-11-01').expect(400);
    });

    it('is for a holder of report.read', async () => {
      await get('reader', '/reports/onboarding').expect(403);
    });
  });

  describe('the counts on Home (item 67, GOV-25)', () => {
    it('counts the members in scope, apart from those registered through the System', async () => {
      const response = await get('brancha', '/reports/member-counts').expect(200);

      expect(response.body.counts).toEqual({
        active: 2,
        suspended: 1,
        registeredToday: 1,
        registeredLastSevenDays: 1,
      });
    });

    it('counts the vehicles in scope and says nothing of declaration to one who may not see it', async () => {
      const response = await get('brancha', '/reports/vehicle-counts').expect(200);

      expect(response.body.counts).toEqual({
        total: 3,
        addedThroughSystem: 2,
        addedToday: 2,
        // Only the second vehicle has no sticker attached.
        withoutSticker: 1,
      });
    });

    it('counts a retired vehicle with no sticker for one who may not see its status, and not as a backlog for the one who may', async () => {
      const before = await get('brancha', '/reports/vehicle-counts').expect(200);
      const adminBefore = await get('admin', '/reports/vehicle-counts').expect(200);
      const retired = await prisma.vehicle.create({
        data: {
          plateNumberNormalized: 'RPTV9',
          plateNumberDisplay: 'RPT-V9',
          branchId: fixture.branchAId,
          status: 'RETIRED',
          declaredAt: null,
        },
      });
      try {
        const after = await get('brancha', '/reports/vehicle-counts').expect(200);
        const adminAfter = await get('admin', '/reports/vehicle-counts').expect(200);

        // The count leaves no status out, so it cannot say which vehicle is retired.
        expect(after.body.counts.withoutSticker).toBe(
          before.body.counts.withoutSticker + 1,
        );
        // To the super administrator a retired vehicle is no work waiting to be declared.
        expect(adminAfter.body.counts.declaration.notDeclared).toBe(
          adminBefore.body.counts.declaration.notDeclared,
        );
      } finally {
        await prisma.vehicle.delete({ where: { id: retired.id } });
      }
    });

    it('gives a holder of vehicle.declare the declared and on-record figures', async () => {
      const response = await get('admin', '/reports/vehicle-counts').expect(200);

      expect(response.body.counts.declaration).toEqual({ notDeclared: 3, declared: 1 });
    });

    it('is for a holder of the permission that opens the list', async () => {
      await get('reader', '/reports/member-counts').expect(403);
      await get('reader', '/reports/vehicle-counts').expect(200);
    });
  });

  describe('an officer’s own work (GOV-25, the field enumerator’s dashboard)', () => {
    it('counts what the caller did, today and over the week', async () => {
      const response = await get('officer1', '/reports/my-work').expect(200);

      expect(response.body.work).toEqual({
        today: { membersRegistered: 1, vehiclesRecorded: 1, stickersAttached: 2 },
        lastSevenDays: { membersRegistered: 1, vehiclesRecorded: 1, stickersAttached: 2 },
      });
    });

    it('never counts another officer’s work', async () => {
      const response = await get('officer2', '/reports/my-work').expect(200);

      // Officer 2 registered one member and recorded one vehicle, and attached no sticker.
      expect(response.body.work.today).toEqual({
        membersRegistered: 1,
        vehiclesRecorded: 1,
        stickersAttached: 0,
      });
    });

    it('gives an officer who did nothing zeros', async () => {
      const response = await get('reader', '/reports/my-work').expect(200);

      expect(response.body.work.today).toEqual({
        membersRegistered: 0,
        vehiclesRecorded: 0,
        stickersAttached: 0,
      });
    });

    it('names no officer, and needs a session', async () => {
      const response = await get('officer1', '/reports/my-work').expect(200);

      expect(JSON.stringify(response.body)).not.toMatch(/officer\d|fixture/i);
      await request(server).get('/api/v1/reports/my-work').expect(401);
    });
  });

  // --- Fixture ---------------------------------------------------------------------

  async function buildFixture(): Promise<Fixture> {
    const make = async (
      name: string,
      level: 'COUNCIL' | 'ZONE' | 'BRANCH',
      parent: { id: string; path: string } | null,
    ) => {
      const row = await prisma.organisation.create({
        data: { name: `${name} ${TAG}`, level, parentId: parent?.id ?? null, path: 'placeholder' },
      });
      return prisma.organisation.update({
        where: { id: row.id },
        data: { path: `${parent?.path ?? '/'}${row.id}/` },
      });
    };
    const council = await make('Council', 'COUNCIL', null);
    const zone = await make('Zone', 'ZONE', council);
    const branchA = await make('Branch A', 'BRANCH', zone);
    const branchB = await make('Branch B', 'BRANCH', zone);

    const baseline = {
      imported: await prisma.sticker.count({
        where: { registeredPlateNormalized: { not: null }, status: { not: 'CANCELLED' } },
      }),
      added: await prisma.sticker.count({
        where: {
          status: { not: 'CANCELLED' },
          OR: [
            { legacyBarcode: null },
            {
              registeredPlateNormalized: null,
              legacyBarcode: { not: null },
              stockAddedAt: { not: null },
            },
          ],
        },
      }),
    };

    const officer1 = await buildUser('officer1', branchA.id, []);
    const officer2 = await buildUser('officer2', branchA.id, []);
    await buildUser('admin', council.id, [
      'report.read',
      'member.read',
      'vehicle.read',
      'sticker.read',
      'vehicle.declare',
      'vehicle.read_restricted',
    ]);
    await buildUser('brancha', branchA.id, [
      'report.read',
      'member.read',
      'vehicle.read',
      'sticker.read',
    ]);
    await buildUser('branchb', branchB.id, ['sticker.read']);
    await buildUser('reader', branchA.id, ['vehicle.read']);

    const vehicle = (
      suffix: string,
      branchId: string,
      extra: Record<string, unknown> = {},
    ) =>
      prisma.vehicle.create({
        data: {
          plateNumberNormalized: `RPTV${suffix}`,
          plateNumberDisplay: `RPT-V${suffix}`,
          branchId,
          status: 'ON_RECORD',
          declaredAt: null,
          ...extra,
        },
      });
    const v1 = await vehicle('1', branchA.id, {
      chassisVinRestricted: CHASSIS,
      owner: {
        create: {
          ownerName: OWNER_NAME,
          ownerPhone: OWNER_PHONE,
          ownerAddress: OWNER_ADDRESS,
        },
      },
    });
    const v2 = await vehicle('2', branchA.id, { status: 'ACTIVE', declaredAt: new Date() });
    const v3 = await vehicle('3', branchA.id, { isLegacyImport: true });
    const v4 = await vehicle('4', branchB.id);

    const audit = (
      action: string,
      subjectId: string,
      actorUserId: string,
      organisationId: string,
    ) =>
      prisma.auditEvent.create({
        data: { action, subjectType: 'vehicle', subjectId, actorUserId, organisationId },
      });
    await audit('vehicle.record', v1.id, officer1.id, branchA.id);
    await audit('vehicle.declare', v2.id, officer2.id, branchA.id);
    await audit('vehicle.record', v4.id, officer2.id, branchB.id);

    // An imported-register sticker on the imported vehicle, and a taken-into-stock
    // sticker on a vehicle added through the System, both attached by officer 1.
    const sticker = (
      label: string,
      extra: Record<string, unknown>,
    ) =>
      prisma.sticker.create({
        data: {
          stickerQrId: `${TAG}-${label}`,
          legacyBarcode: `${TAG}-${label}-code`,
          templateVersion: 'legacy-barcode',
          status: 'ISSUED',
          ...extra,
        },
      });
    await sticker('reg-attached', {
      registeredPlateNormalized: 'RPTV3',
      vehicleId: v3.id,
      attachedAt: new Date(),
      attachedByUserId: officer1.id,
    });
    await sticker('reg-free', { registeredPlateNormalized: 'RPTFREE' });
    await sticker('stock-attached', {
      stockAddedAt: new Date(),
      vehicleId: v1.id,
      attachedAt: new Date(),
      attachedByUserId: officer1.id,
    });
    await sticker('stock-free', { stockAddedAt: new Date() });

    const member = (surname: string, branchId: string, status: 'ACTIVE' | 'SUSPENDED') =>
      prisma.member.create({
        data: { surname: `${surname} ${TAG}`, firstName: 'Fixture', status, organisationId: branchId },
      });
    const m1 = await member('Registered A', branchA.id, 'ACTIVE');
    await member('Imported A', branchA.id, 'ACTIVE');
    await member('Suspended A', branchA.id, 'SUSPENDED');
    const m4 = await member('Registered B', branchB.id, 'ACTIVE');
    await prisma.membershipApplication.create({
      data: {
        applicationNumber: `${TAG}-A1`.toUpperCase(),
        status: 'APPROVED',
        memberId: m1.id,
        createdByUserId: officer1.id,
      },
    });
    await prisma.membershipApplication.create({
      data: {
        applicationNumber: `${TAG}-B1`.toUpperCase(),
        status: 'APPROVED',
        memberId: m4.id,
        createdByUserId: officer2.id,
      },
    });

    return {
      councilId: council.id,
      branchAId: branchA.id,
      branchBId: branchB.id,
      vehicles: { v1: v1.id, v2: v2.id, v3: v3.id, v4: v4.id },
      officer1,
      officer2,
      baseline,
    };
  }

  async function buildUser(
    who: string,
    organisationId: string,
    permissions: readonly string[],
  ): Promise<{ id: string; name: string }> {
    const user = await prisma.user.create({
      data: {
        email: `${who}.${TAG}@nurtw.test`.toLowerCase(),
        fullName: `${who} fixture`,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    for (const code of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.userPermissionGrant.create({
        data: {
          userId: user.id,
          permissionId: permission.id,
          organisationId,
          grantedByUserId: user.id,
          reason: 'e2e fixture',
        },
      });
    }
    return { id: user.id, name: user.fullName };
  }

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const raw = response.headers['set-cookie'];
    return (Array.isArray(raw) ? raw[0]! : raw!).split(';')[0]!;
  }

  async function cleanUp(): Promise<void> {
    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const vehicles = await prisma.vehicle.findMany({
      where: { OR: [{ branchId: { in: orgIds } }, { unitId: { in: orgIds } }] },
      select: { id: true },
    });

    await prisma.sticker.deleteMany({ where: { stickerQrId: { startsWith: TAG } } });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organisationId: { in: orgIds } },
          { subjectId: { in: vehicles.map((v) => v.id) } },
        ],
      },
    });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicles.map((v) => v.id) } } });
    await prisma.membershipApplication.deleteMany({
      where: { applicationNumber: { startsWith: TAG.toUpperCase() } },
    });
    await prisma.member.deleteMany({ where: { surname: { contains: TAG } } });
    await prisma.userPermissionGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

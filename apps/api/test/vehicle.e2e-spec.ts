import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * Vehicle declaration, end to end (PRD §9, `plans/07-vehicle-declaration.md`).
 *
 * The assertions that carry weight: `vehicle.declare` is the only route to a
 * live record; a plate conflict is recorded as DISPUTED rather than refused
 * outright or silently merged; chassis/VIN is absent from a response unless
 * the caller holds `vehicle.read_restricted`; and scope is enforced per
 * record, not merely per permission.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-vehicle';
const PASSWORD = 'e2e-fixture-password-1';

interface Fixture {
  branchAId: string;
  unitAId: string;
  branchBId: string;
  memberId: string;
}

describe('Vehicle declaration (e2e)', () => {
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

    for (const who of ['declarer', 'otherbranch', 'restricted', 'reader']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterEach(async () => {
    // Scoped by fixture organisation, not by plate text — plate values stay
    // short (normalizePlateNumber's ceiling is 16 characters) and cannot
    // carry the full TAG themselves.
    await prisma.vehicle.deleteMany({
      where: {
        OR: [
          { branchId: { in: [fixture.branchAId, fixture.branchBId] } },
          { unitId: fixture.unitAId },
        ],
      },
    });
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  function declare(body: Record<string, unknown>) {
    return request(server)
      .post('/api/v1/vehicles')
      .set('Cookie', cookies.declarer!)
      .send({ organisationId: fixture.unitAId, ...body });
  }

  /**
   * A short, test-unique plate. `normalizePlateNumber` caps a normalised
   * plate at 16 characters, so this cannot carry the full fixture `TAG` the
   * way organisation and user names do.
   */
  function plate(suffix: string): string {
    return `E2EV-${suffix}`;
  }

  describe('declaring', () => {
    it('creates an ACTIVE declaration with no prior claim', async () => {
      const response = await declare({
        plateNumberDisplay: plate('AA1'),
      }).expect(201);

      expect(response.body.vehicle.status).toBe('ACTIVE');
      expect(response.body.vehicle.organisation.id).toBe(fixture.unitAId);
    });

    it('records a competing claim as DISPUTED, preserving both records', async () => {
      const first = await declare({ plateNumberDisplay: plate('BB2') }).expect(
        201,
      );
      const second = await declare({
        // Different casing/spacing normalises to the same plate.
        plateNumberDisplay: ` ${plate('bb2')} `,
      }).expect(201);

      expect(first.body.vehicle.status).toBe('ACTIVE');
      expect(second.body.vehicle.status).toBe('DISPUTED');

      const rows = await prisma.vehicle.findMany({
        where: { plateNumberNormalized: 'E2EVBB2' },
      });
      expect(rows).toHaveLength(2);
    });

    it('refuses a caller without vehicle.declare', async () => {
      await request(server)
        .post('/api/v1/vehicles')
        .set('Cookie', cookies.reader!)
        .send({ organisationId: fixture.unitAId, plateNumberDisplay: plate('CC3') })
        .expect(403);
    });

    it('refuses declaring into a unit outside the caller’s scope', async () => {
      await request(server)
        .post('/api/v1/vehicles')
        .set('Cookie', cookies.declarer!)
        .send({ organisationId: fixture.branchBId, plateNumberDisplay: plate('DD4') })
        .expect(403);
    });
  });

  describe('reading', () => {
    it('omits chassis/VIN for a caller without vehicle.read_restricted', async () => {
      const created = await declare({
        plateNumberDisplay: plate('EE5'),
        chassisVinRestricted: 'SECRET-CHASSIS-1',
      }).expect(201);

      const asDeclarer = await request(server)
        .get(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(asDeclarer.body.vehicle).not.toHaveProperty('chassisVinRestricted');

      const asRestricted = await request(server)
        .get(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.restricted!)
        .expect(200);
      expect(asRestricted.body.vehicle.chassisVinRestricted).toBe(
        'SECRET-CHASSIS-1',
      );
    });

    it('answers 404, not 403, for a declaration outside the caller’s scope', async () => {
      const created = await declare({ plateNumberDisplay: plate('FF6') }).expect(
        201,
      );

      await request(server)
        .get(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.otherbranch!)
        .expect(404);
    });

    it('lists only declarations within the caller’s scope', async () => {
      await declare({ plateNumberDisplay: plate('GG7') }).expect(201);

      const asDeclarer = await request(server)
        .get('/api/v1/vehicles')
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(
        asDeclarer.body.vehicles.some((v: { plateNumberDisplay: string }) =>
          v.plateNumberDisplay.includes('GG7'),
        ),
      ).toBe(true);

      const asOtherBranch = await request(server)
        .get('/api/v1/vehicles')
        .set('Cookie', cookies.otherbranch!)
        .expect(200);
      expect(
        asOtherBranch.body.vehicles.some((v: { plateNumberDisplay: string }) =>
          v.plateNumberDisplay.includes('GG7'),
        ),
      ).toBe(false);
    });

    it('never returns chassis/VIN in a list, regardless of permission', async () => {
      await declare({
        plateNumberDisplay: plate('HH8'),
        chassisVinRestricted: 'SECRET-CHASSIS-2',
      }).expect(201);

      const response = await request(server)
        .get('/api/v1/vehicles')
        .set('Cookie', cookies.restricted!)
        .expect(200);

      for (const vehicle of response.body.vehicles) {
        expect(vehicle).not.toHaveProperty('chassisVinRestricted');
      }
    });
  });

  describe('owner (member) association', () => {
    it('declares a vehicle already attached to a member', async () => {
      const response = await declare({
        plateNumberDisplay: plate('MM1'),
        declaredByMemberId: fixture.memberId,
      }).expect(201);

      expect(response.body.vehicle.declaredByMember.id).toBe(fixture.memberId);
    });

    it('attaches, then clears, a member on an existing declaration', async () => {
      const created = await declare({ plateNumberDisplay: plate('MM2') }).expect(
        201,
      );
      expect(created.body.vehicle.declaredByMember).toBeNull();

      const attached = await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .send({ declaredByMemberId: fixture.memberId })
        .expect(200);
      expect(attached.body.vehicle.declaredByMember.id).toBe(fixture.memberId);

      const cleared = await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .send({ declaredByMemberId: null })
        .expect(200);
      expect(cleared.body.vehicle.declaredByMember).toBeNull();
    });

    it('refuses attaching a non-existent member', async () => {
      await declare({
        plateNumberDisplay: plate('MM3'),
        declaredByMemberId: '00000000-0000-0000-0000-000000000000',
      }).expect(404);
    });
  });

  describe('status lifecycle', () => {
    it('moves ACTIVE -> SUSPENDED -> ACTIVE -> RETIRED', async () => {
      const created = await declare({ plateNumberDisplay: plate('II9') }).expect(
        201,
      );
      const id = created.body.vehicle.id;

      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'SUSPENDED', reason: 'e2e: routine check' })
        .expect(200)
        .expect((res) => expect(res.body.vehicle.status).toBe('SUSPENDED'));

      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'ACTIVE', reason: 'e2e: check complete' })
        .expect(200)
        .expect((res) => expect(res.body.vehicle.status).toBe('ACTIVE'));

      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'RETIRED', reason: 'e2e: vehicle sold' })
        .expect(200)
        .expect((res) => expect(res.body.vehicle.status).toBe('RETIRED'));
    });

    it('refuses reviving a retired declaration', async () => {
      const created = await declare({ plateNumberDisplay: plate('JJ10') }).expect(
        201,
      );
      const id = created.body.vehicle.id;

      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'RETIRED', reason: 'e2e: retiring' })
        .expect(200);

      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'ACTIVE', reason: 'e2e: trying to revive' })
        .expect(409);
    });

    it('requires a reason', async () => {
      const created = await declare({ plateNumberDisplay: plate('KK11') }).expect(
        201,
      );

      await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'SUSPENDED' })
        .expect(400);
    });
  });

  describe('dispute dismissal', () => {
    it('dismisses a disputed declaration to ARCHIVED', async () => {
      await declare({ plateNumberDisplay: plate('LL12') }).expect(201);
      const disputed = await declare({
        plateNumberDisplay: plate('ll12'),
      }).expect(201);
      expect(disputed.body.vehicle.status).toBe('DISPUTED');

      await request(server)
        .post(`/api/v1/vehicles/${disputed.body.vehicle.id}/dismiss-dispute`)
        .set('Cookie', cookies.declarer!)
        .send({ reason: 'e2e: duplicate claim dismissed' })
        // Nest defaults an undecorated @Post to 201, the same convention
        // every other action-style POST in this System follows (card
        // decision/submission/activation, none of which override it either).
        .expect(201)
        .expect((res) => expect(res.body.vehicle.status).toBe('ARCHIVED'));
    });

    it('refuses dismissing a declaration that is not disputed', async () => {
      const created = await declare({ plateNumberDisplay: plate('MM13') }).expect(
        201,
      );

      await request(server)
        .post(`/api/v1/vehicles/${created.body.vehicle.id}/dismiss-dispute`)
        .set('Cookie', cookies.declarer!)
        .send({ reason: 'e2e: not actually disputed' })
        .expect(409);
    });
  });

  async function buildFixture(): Promise<Fixture> {
    const make = async (
      name: string,
      level: 'COUNCIL' | 'ZONE' | 'BRANCH' | 'UNIT',
      parent: { id: string; path: string } | null,
    ) => {
      const row = await prisma.organisation.create({
        data: {
          name: `${name} ${TAG}`,
          level,
          parentId: parent?.id ?? null,
          path: 'placeholder',
        },
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
    const unitA = await make('Unit A', 'UNIT', branchA);

    await buildUser('declarer', branchA.id, [
      'vehicle.declare',
      'vehicle.read',
      'vehicle.update',
      'vehicle.suspend',
      'vehicle.resolve_dispute',
    ]);
    await buildUser('otherbranch', branchB.id, [
      'vehicle.declare',
      'vehicle.read',
    ]);
    await buildUser('restricted', branchA.id, [
      'vehicle.read',
      'vehicle.read_restricted',
    ]);
    await buildUser('reader', branchA.id, ['vehicle.read']);

    const member = await prisma.member.create({
      data: {
        surname: `Owner ${TAG}`,
        firstName: 'Fixture',
        status: 'ACTIVE',
        organisationId: branchA.id,
      },
    });

    return {
      branchAId: branchA.id,
      unitAId: unitA.id,
      branchBId: branchB.id,
      memberId: member.id,
    };
  }

  async function buildUser(
    who: string,
    organisationId: string,
    permissions: readonly string[],
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${who}.${TAG}@nurtw.test`.toLowerCase(),
        fullName: `${who} fixture`,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    for (const code of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
      });
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
      where: {
        OR: [{ branchId: { in: orgIds } }, { unitId: { in: orgIds } }],
      },
      select: { id: true },
    });

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organisationId: { in: orgIds } },
          { subjectId: { in: vehicles.map((v) => v.id) } },
        ],
      },
    });

    await prisma.vehicle.deleteMany({
      where: { id: { in: vehicles.map((v) => v.id) } },
    });
    // Restricted by both Vehicle.declaredByMemberId and Member.organisationId
    // — must go after the vehicles above and before the organisations below.
    await prisma.member.deleteMany({ where: { surname: { contains: TAG } } });
    await prisma.userPermissionGrant.deleteMany({
      where: { organisationId: { in: orgIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

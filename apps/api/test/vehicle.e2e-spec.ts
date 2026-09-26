import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * Vehicle records and declarations, end to end (PRD §9,
 * `plans/07-vehicle-declaration.md`, `plans/19-vehicle-recording.md`).
 *
 * The assertions that carry weight: `vehicle.declare` is the only route to a
 * live record; recording (`vehicle.record`) produces ON_RECORD and never a
 * declaration; declaring a plate already on record promotes the SAME row; a
 * plate conflict is recorded as DISPUTED rather than refused outright or
 * silently merged; chassis/VIN and owner details stay off lists; and scope is
 * enforced per record, not merely per permission.
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
  pendingApplicantId: string;
  interstateId: string;
  townServiceId: string;
}

/** Requirement 9.8 — owner name and phone, the phone as an officer would type it. */
const OWNER = { name: 'Fixture Owner', phone: '08031234567' };

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

    for (const who of [
      'declarer',
      'otherbranch',
      'restricted',
      'reader',
      'enumerator',
    ]) {
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

  /** Revision 1.3 — route type and owner are required on every new vehicle. */
  function body(extra: Record<string, unknown>) {
    return {
      organisationId: fixture.unitAId,
      routeTypeId: fixture.interstateId,
      owner: OWNER,
      ...extra,
    };
  }

  function declare(extra: Record<string, unknown>) {
    return request(server)
      .post('/api/v1/vehicles')
      .set('Cookie', cookies.declarer!)
      .send(body(extra));
  }

  function record(extra: Record<string, unknown>) {
    return request(server)
      .post('/api/v1/vehicles/record')
      .set('Cookie', cookies.enumerator!)
      .send(body(extra));
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
        .send(body({ plateNumberDisplay: plate('CC3') }))
        .expect(403);
    });

    it('refuses declaring into a unit outside the caller’s scope', async () => {
      await request(server)
        .post('/api/v1/vehicles')
        .set('Cookie', cookies.declarer!)
        .send(
          body({
            organisationId: fixture.branchBId,
            plateNumberDisplay: plate('DD4'),
          }),
        )
        .expect(403);
    });

    it('refuses a declaration with no route type or no owner phone (revision 1.3)', async () => {
      await declare({
        plateNumberDisplay: plate('DR1'),
        routeTypeId: undefined,
      }).expect(400);
      await declare({
        plateNumberDisplay: plate('DR2'),
        owner: { name: 'No Phone' },
      }).expect(400);
    });
  });

  describe('recording (vehicle.record, revision 1.3)', () => {
    it('records a vehicle ON_RECORD, never declared', async () => {
      const response = await record({ plateNumberDisplay: plate('RC1') }).expect(
        201,
      );

      expect(response.body.vehicle.status).toBe('ON_RECORD');
      expect(response.body.vehicle.declaredAt).toBeNull();
      expect(response.body.vehicle.routeType.code).toBe('INTERSTATE');

      const audit = await prisma.auditEvent.findFirst({
        where: { subjectId: response.body.vehicle.id, action: 'vehicle.record' },
      });
      expect(audit).not.toBeNull();
      // Owner values stay in their own table, not in the audit trail.
      expect(JSON.stringify(audit?.afterValue)).not.toContain(OWNER.name);
    });

    it('refuses recording without a route type or without an owner name', async () => {
      await record({
        plateNumberDisplay: plate('RC2'),
        routeTypeId: undefined,
      }).expect(400);
      await record({
        plateNumberDisplay: plate('RC3'),
        owner: { phone: OWNER.phone },
      }).expect(400);
    });

    it('refuses recording a plate that already has a standing record', async () => {
      await record({ plateNumberDisplay: plate('RC4') }).expect(201);
      const again = await record({
        // Different casing/spacing normalises to the same plate.
        plateNumberDisplay: ` ${plate('rc4')} `,
      }).expect(409);
      // A bare conflict: the generic error shape (Requirement 14.3) carries no
      // hint of where the existing record is.
      expect(again.body.error.code).toBe('CONFLICT');
      expect(JSON.stringify(again.body)).not.toMatch(/branch|unit|E2EVRC4/i);

      await declare({ plateNumberDisplay: plate('RC5') }).expect(201);
      await record({ plateNumberDisplay: plate('RC5') }).expect(409);
    });

    it('lets a retired vehicle be recorded afresh', async () => {
      const created = await declare({ plateNumberDisplay: plate('RC6') }).expect(
        201,
      );
      await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'RETIRED', reason: 'e2e: retired' })
        .expect(200);

      await record({ plateNumberDisplay: plate('RC6') }).expect(201);
    });

    it('does not let a recorder declare', async () => {
      await request(server)
        .post('/api/v1/vehicles')
        .set('Cookie', cookies.enumerator!)
        .send(body({ plateNumberDisplay: plate('RC7') }))
        .expect(403);
    });

    it('links a vehicle to an applicant still pending approval (Requirement 9.10)', async () => {
      const response = await record({
        plateNumberDisplay: plate('RC8'),
        declaredByMemberId: fixture.pendingApplicantId,
      }).expect(201);

      expect(response.body.vehicle.declaredByMember.id).toBe(
        fixture.pendingApplicantId,
      );
    });
  });

  describe('declaring a vehicle already on record (Decisions 6.5–6.6)', () => {
    it('promotes the same row when a declaration names its plate', async () => {
      const recorded = await record({ plateNumberDisplay: plate('PR1') }).expect(
        201,
      );

      const declared = await declare({
        plateNumberDisplay: plate('pr1'),
        routeTypeId: fixture.townServiceId,
      }).expect(201);

      expect(declared.body.vehicle.id).toBe(recorded.body.vehicle.id);
      expect(declared.body.vehicle.status).toBe('ACTIVE');
      expect(declared.body.vehicle.declaredAt).not.toBeNull();
      expect(declared.body.vehicle.routeType.code).toBe('TOWN_SERVICE');
      expect(
        await prisma.vehicle.count({
          where: { plateNumberNormalized: 'E2EVPR1' },
        }),
      ).toBe(1);
    });

    it('declares from the vehicle page, in place', async () => {
      const recorded = await record({ plateNumberDisplay: plate('PR2') }).expect(
        201,
      );

      const declared = await request(server)
        .post(`/api/v1/vehicles/${recorded.body.vehicle.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(201);

      expect(declared.body.vehicle.id).toBe(recorded.body.vehicle.id);
      expect(declared.body.vehicle.status).toBe('ACTIVE');
    });

    it('requires a legacy record’s missing route type and owner before declaring it', async () => {
      // Shaped like a migrated row: ON_RECORD, no route type, no owner.
      const legacy = await prisma.vehicle.create({
        data: {
          plateNumberNormalized: 'E2EVPR3',
          plateNumberDisplay: plate('PR3'),
          branchId: fixture.branchAId,
          status: 'ON_RECORD',
          declaredAt: null,
          isLegacyImport: true,
          notes: 'Migrated from legacy vehicle record. Legacy status: ACTIVE.',
        },
      });

      await request(server)
        .post(`/api/v1/vehicles/${legacy.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({ owner: OWNER })
        .expect(400);

      await request(server)
        .post(`/api/v1/vehicles/${legacy.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({ routeTypeId: fixture.interstateId })
        .expect(400);

      const declared = await request(server)
        .post(`/api/v1/vehicles/${legacy.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({ routeTypeId: fixture.interstateId, owner: OWNER })
        .expect(201);
      expect(declared.body.vehicle.status).toBe('ACTIVE');

      const after = await prisma.vehicle.findUniqueOrThrow({
        where: { id: legacy.id },
      });
      // The legacy note survives the declaration — MIG-06 still needs it.
      expect(after.notes).toContain('Legacy status: ACTIVE');
    });

    it('refuses, rather than duplicates, a record outside the declarer’s scope', async () => {
      await prisma.vehicle.create({
        data: {
          plateNumberNormalized: 'E2EVPR4',
          plateNumberDisplay: plate('PR4'),
          branchId: fixture.branchBId,
          status: 'ON_RECORD',
          declaredAt: null,
        },
      });

      const response = await declare({ plateNumberDisplay: plate('PR4') }).expect(
        409,
      );
      expect(response.body.error.code).toBe('CONFLICT');
      expect(
        await prisma.vehicle.count({
          where: { plateNumberNormalized: 'E2EVPR4' },
        }),
      ).toBe(1);
    });

    it('refuses the page route for a vehicle that is not on record', async () => {
      const created = await declare({ plateNumberDisplay: plate('PR5') }).expect(
        201,
      );

      await request(server)
        .post(`/api/v1/vehicles/${created.body.vehicle.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(409);
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

    it('returns owner details on the record and never in a list (Requirement 9.8)', async () => {
      const created = await declare({ plateNumberDisplay: plate('OW1') }).expect(
        201,
      );

      const detail = await request(server)
        .get(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(detail.body.vehicle.owner).toEqual({
        name: OWNER.name,
        // Normalised on the way in, like a member's phone.
        phone: '+2348031234567',
        address: null,
      });

      const list = await request(server)
        .get('/api/v1/vehicles')
        .set('Cookie', cookies.declarer!)
        .expect(200);
      for (const vehicle of list.body.vehicles) {
        expect(vehicle).not.toHaveProperty('owner');
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
    await buildUser('enumerator', branchA.id, ['vehicle.record', 'vehicle.read']);

    const member = await prisma.member.create({
      data: {
        surname: `Owner ${TAG}`,
        firstName: 'Fixture',
        status: 'ACTIVE',
        organisationId: branchA.id,
      },
    });

    // Requirement 9.10 — an applicant is a member row from the moment the
    // application is recorded, PENDING until decided.
    const pending = await prisma.member.create({
      data: {
        surname: `Applicant ${TAG}`,
        firstName: 'Pending',
        status: 'PENDING',
        organisationId: branchA.id,
      },
    });

    const [interstate, townService] = await Promise.all([
      prisma.routeType.findUniqueOrThrow({ where: { code: 'INTERSTATE' } }),
      prisma.routeType.findUniqueOrThrow({ where: { code: 'TOWN_SERVICE' } }),
    ]);

    return {
      branchAId: branchA.id,
      unitAId: unitA.id,
      branchBId: branchB.id,
      memberId: member.id,
      pendingApplicantId: pending.id,
      interstateId: interstate.id,
      townServiceId: townService.id,
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

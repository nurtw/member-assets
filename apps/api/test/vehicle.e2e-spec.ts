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
      'suspender',
      'crossdeclarer',
      'twobranch',
      'editor',
      'senior',
      'outsider',
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
      // Required since PRD revision 1.15 (VEH-34). A made-up value.
      chassisVinRestricted: 'E2E-CHASSIS-0000',
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
      // A disputed claim is kept, but it is not a declaration.
      expect(second.body.vehicle.declaredAt).toBeNull();

      const rows = await prisma.vehicle.findMany({
        where: { plateNumberNormalized: 'E2EVBB2' },
      });
      expect(rows).toHaveLength(2);
    });

    it('declares a disputed vehicle without settling the dispute', async () => {
      await declare({ plateNumberDisplay: plate('BB3') }).expect(201);
      const second = await declare({
        plateNumberDisplay: plate('BB3'),
      }).expect(201);
      expect(second.body.vehicle.status).toBe('DISPUTED');

      const declared = await request(server)
        .post(`/api/v1/vehicles/${second.body.vehicle.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(201);
      expect(declared.body.vehicle.status).toBe('DISPUTED');
      expect(declared.body.vehicle.declaredAt).not.toBeNull();

      // Only one active declaration per plate still holds.
      expect(
        await prisma.vehicle.count({
          where: { plateNumberNormalized: 'E2EVBB3', status: 'ACTIVE' },
        }),
      ).toBe(1);
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

    it('declares on the plate alone: no route type, owner, chassis, branch, or category (VEH-38)', async () => {
      const response = await request(server)
        .post('/api/v1/vehicles')
        .set('Cookie', cookies.declarer!)
        .send({ plateNumberDisplay: plate('DR1') })
        .expect(201);

      expect(response.body.vehicle.status).toBe('ACTIVE');
      expect(response.body.vehicle.routeType).toBeNull();
      // No branch was named: it went to the declarer's own branch.
      const stored = await prisma.vehicle.findUniqueOrThrow({
        where: { id: response.body.vehicle.id },
        include: { owner: true },
      });
      expect(stored.branchId).toBe(fixture.branchAId);
      expect(stored.owner).toBeNull();
    });

    it('asks which branch when the officer has no single one of their own', async () => {
      // This officer holds the permission in two branches.
      await request(server)
        .post('/api/v1/vehicles')
        .set('Cookie', cookies.twobranch!)
        .send({ plateNumberDisplay: plate('DR2') })
        .expect(400);
    });

    it('stores a partly given owner and never blanks a detail on amendment', async () => {
      const created = await declare({
        plateNumberDisplay: plate('DR3'),
        owner: { name: 'Only A Name' },
      }).expect(201);
      await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .send({ owner: { phone: OWNER.phone } })
        .expect(200);
      const stored = await prisma.vehicleOwner.findFirstOrThrow({
        where: { vehicleId: created.body.vehicle.id },
      });
      expect(stored.ownerName).toBe('Only A Name');
      expect(stored.ownerPhone).toBe('+2348031234567');
    });
  });

  describe('recording (vehicle.record, revision 1.3)', () => {
    it('records a vehicle ON_RECORD, never declared', async () => {
      const response = await record({ plateNumberDisplay: plate('RC1') }).expect(
        201,
      );

      // VEH-28 — the enumerator holds no vehicle.declare, so is not told the
      // declaration status, even of the record they just made.
      expect(response.body.vehicle).not.toHaveProperty('status');
      expect(response.body.vehicle).not.toHaveProperty('declaredAt');
      expect(response.body.vehicle.routeType.code).toBe('INTERSTATE');
      const stored = await prisma.vehicle.findUniqueOrThrow({
        where: { id: response.body.vehicle.id },
      });
      expect(stored.status).toBe('ON_RECORD');
      expect(stored.declaredAt).toBeNull();

      const audit = await prisma.auditEvent.findFirst({
        where: { subjectId: response.body.vehicle.id, action: 'vehicle.record' },
      });
      expect(audit).not.toBeNull();
      // Owner values stay in their own table, not in the audit trail.
      expect(JSON.stringify(audit?.afterValue)).not.toContain(OWNER.name);
    });

    it('records on the plate alone, into the recorder’s own branch (VEH-38)', async () => {
      const response = await request(server)
        .post('/api/v1/vehicles/record')
        .set('Cookie', cookies.enumerator!)
        .send({ plateNumberDisplay: plate('RC2') })
        .expect(201);
      const stored = await prisma.vehicle.findUniqueOrThrow({
        where: { id: response.body.vehicle.id },
      });
      expect(stored.status).toBe('ON_RECORD');
      expect(stored.branchId).toBe(fixture.branchAId);
      expect(stored.routeTypeId).toBeNull();
    });

    it('still refuses a blank plate', async () => {
      await request(server)
        .post('/api/v1/vehicles/record')
        .set('Cookie', cookies.enumerator!)
        .send({ plateNumberDisplay: '   ' })
        .expect(400);
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

  describe('the chassis number is optional (VEH-38, superseding VEH-34)', () => {
    it('declares and records a vehicle without one', async () => {
      await declare({
        plateNumberDisplay: plate('CH1'),
        chassisVinRestricted: undefined,
      }).expect(201);
      await record({
        plateNumberDisplay: plate('CH2'),
        chassisVinRestricted: undefined,
      }).expect(201);
    });

    it('refuses a blank one when one is sent', async () => {
      await record({
        plateNumberDisplay: plate('CH7'),
        chassisVinRestricted: '   ',
      }).expect(400);
    });

    it('will not let an amendment blank one', async () => {
      const created = await declare({ plateNumberDisplay: plate('CH3') }).expect(
        201,
      );
      await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .send({ chassisVinRestricted: '' })
        .expect(400);
    });

    it('tells every reader whether there is one, and only a restricted reader what it is', async () => {
      const created = await declare({
        plateNumberDisplay: plate('CH4'),
        chassisVinRestricted: 'E2E-CHASSIS-CH4',
      }).expect(201);

      const detail = await request(server)
        .get(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(detail.body.vehicle.chassisRecorded).toBe(true);
      expect(detail.body.vehicle).not.toHaveProperty('chassisVinRestricted');
      expect(JSON.stringify(detail.body)).not.toContain('E2E-CHASSIS-CH4');
    });

    it('leaves a legacy vehicle that has none readable, and says it has none', async () => {
      const legacy = await prisma.vehicle.create({
        data: {
          plateNumberNormalized: 'E2EVCH5',
          plateNumberDisplay: plate('CH5'),
          branchId: fixture.branchAId,
          status: 'ON_RECORD',
          declaredAt: null,
          isLegacyImport: true,
        },
      });

      const detail = await request(server)
        .get(`/api/v1/vehicles/${legacy.id}`)
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(detail.body.vehicle.chassisRecorded).toBe(false);
    });

    it('keeps the number out of the audit trail', async () => {
      const created = await declare({
        plateNumberDisplay: plate('CH6'),
        chassisVinRestricted: 'E2E-CHASSIS-CH6',
      }).expect(201);

      const events = await prisma.auditEvent.findMany({
        where: { subjectId: created.body.vehicle.id },
      });
      expect(events.length).toBeGreaterThan(0);
      expect(JSON.stringify(events)).not.toContain('E2E-CHASSIS-CH6');
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

    it('declares a legacy record with nothing supplied, keeping its notes (VEH-38)', async () => {
      // Shaped like a migrated row: ON_RECORD, no route type, no owner, no chassis.
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

      const declared = await request(server)
        .post(`/api/v1/vehicles/${legacy.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(201);
      expect(declared.body.vehicle.status).toBe('ACTIVE');

      const after = await prisma.vehicle.findUniqueOrThrow({
        where: { id: legacy.id },
      });
      // The legacy note survives the declaration — MIG-06 still needs it.
      expect(after.notes).toContain('Legacy status: ACTIVE');
      expect(after.declaredAt).not.toBeNull();
      expect(after.routeTypeId).toBeNull();
    });

    it('declares a suspended vehicle without lifting the suspension (VEH-38)', async () => {
      const suspended = await prisma.vehicle.create({
        data: {
          plateNumberNormalized: 'E2EVPR6',
          plateNumberDisplay: plate('PR6'),
          branchId: fixture.branchAId,
          status: 'SUSPENDED',
          declaredAt: null,
        },
      });

      const declared = await request(server)
        .post(`/api/v1/vehicles/${suspended.id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(201);
      expect(declared.body.vehicle.status).toBe('SUSPENDED');
      expect(declared.body.vehicle.declaredAt).not.toBeNull();

      // Lifting the suspension now returns it to ACTIVE: it was declared.
      await request(server)
        .patch(`/api/v1/vehicles/${suspended.id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'ACTIVE', reason: 'e2e: lifted' })
        .expect(200);
      const after = await prisma.vehicle.findUniqueOrThrow({
        where: { id: suspended.id },
      });
      expect(after.status).toBe('ACTIVE');
    });

    it('refuses to declare a retired or archived vehicle', async () => {
      for (const [suffix, status] of [
        ['PR7', 'RETIRED'],
        ['PR8', 'ARCHIVED'],
      ] as const) {
        const row = await prisma.vehicle.create({
          data: {
            plateNumberNormalized: `E2EV${suffix}`,
            plateNumberDisplay: plate(suffix),
            branchId: fixture.branchAId,
            status,
            declaredAt: null,
          },
        });
        await request(server)
          .post(`/api/v1/vehicles/${row.id}/declare`)
          .set('Cookie', cookies.declarer!)
          .send({})
          .expect(409);
      }
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

  describe('declaring several at once (item 63, VEH-38)', () => {
    /** A vehicle in branch A, as the legacy register left it, unless said otherwise. */
    async function seeded(
      suffix: string,
      extra: Record<string, unknown> = {},
      branchId: string = fixture.branchAId,
    ) {
      return prisma.vehicle.create({
        data: {
          plateNumberNormalized: `E2EV${suffix}`,
          plateNumberDisplay: plate(suffix),
          branchId,
          status: 'ON_RECORD',
          declaredAt: null,
          isLegacyImport: true,
          ...extra,
        },
      });
    }

    const declareMany = (who: string, vehicleIds: unknown) =>
      request(server)
        .post('/api/v1/vehicles/declare-many')
        .set('Cookie', cookies[who]!)
        .send({ vehicleIds });

    it('declares every ticked vehicle, with one audit event for each', async () => {
      const first = await seeded('BD1');
      const second = await seeded('BD2');
      const third = await seeded('BD3');

      const response = await declareMany('declarer', [
        first.id,
        second.id,
        third.id,
      ]).expect(201);

      expect(response.body).toEqual({ declared: 3, skipped: [] });
      for (const vehicle of [first, second, third]) {
        const row = await prisma.vehicle.findUniqueOrThrow({
          where: { id: vehicle.id },
        });
        expect(row.status).toBe('ACTIVE');
        expect(row.declaredAt).not.toBeNull();
        const events = await prisma.auditEvent.findMany({
          where: { subjectId: vehicle.id, action: 'vehicle.declare' },
        });
        expect(events).toHaveLength(1);
      }
    });

    it('needs only the plate, and leaves a suspended vehicle suspended', async () => {
      const suspended = await seeded('BD4', { status: 'SUSPENDED' });

      const response = await declareMany('declarer', [suspended.id]).expect(201);

      expect(response.body.declared).toBe(1);
      const row = await prisma.vehicle.findUniqueOrThrow({
        where: { id: suspended.id },
      });
      expect(row.status).toBe('SUSPENDED');
      expect(row.declaredAt).not.toBeNull();
    });

    it('skips what cannot be declared, says why, and declares the rest', async () => {
      const good = await seeded('BD5');
      const already = await seeded('BD6', {
        status: 'ACTIVE',
        declaredAt: new Date(),
      });
      const retired = await seeded('BD7', { status: 'RETIRED' });
      // The plate already holds an active declaration, so this record cannot be declared.
      await seeded('BD8', { status: 'ACTIVE', declaredAt: new Date() });
      const clash = await seeded('BD8', { plateNumberDisplay: plate('BD8') });
      const missing = '00000000-0000-4000-8000-000000000001';

      const response = await declareMany('declarer', [
        good.id,
        already.id,
        retired.id,
        clash.id,
        missing,
      ]).expect(201);

      expect(response.body.declared).toBe(1);
      const reasons = Object.fromEntries(
        response.body.skipped.map((entry: { id: string; reason: string }) => [
          entry.id,
          entry.reason,
        ]),
      );
      expect(reasons).toEqual({
        [already.id]: 'ALREADY_DECLARED',
        [retired.id]: 'LEFT_REGISTER',
        [clash.id]: 'PLATE_ACTIVE_ELSEWHERE',
        [missing]: 'NOT_FOUND',
      });
      const named = response.body.skipped.find(
        (entry: { id: string }) => entry.id === already.id,
      );
      expect(named.plate).toBe(plate('BD6'));
      expect(
        response.body.skipped.find((entry: { id: string }) => entry.id === missing)
          .plate,
      ).toBeNull();
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: good.id } })).status,
      ).toBe('ACTIVE');
    });

    it('answers a vehicle outside the caller’s area as it answers one that is not there', async () => {
      const elsewhere = await seeded('BD9', {}, fixture.branchBId);

      const response = await declareMany('declarer', [elsewhere.id]).expect(201);

      expect(response.body).toEqual({
        declared: 0,
        skipped: [{ id: elsewhere.id, plate: null, reason: 'NOT_FOUND' }],
      });
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: elsewhere.id } }))
          .declaredAt,
      ).toBeNull();
    });

    it('counts a repeated id once', async () => {
      const vehicle = await seeded('BD10');

      const response = await declareMany('declarer', [
        vehicle.id,
        vehicle.id,
      ]).expect(201);

      expect(response.body).toEqual({ declared: 1, skipped: [] });
      expect(
        await prisma.auditEvent.count({
          where: { subjectId: vehicle.id, action: 'vehicle.declare' },
        }),
      ).toBe(1);
    });

    it('refuses none, too many, or a malformed id', async () => {
      await declareMany('declarer', []).expect(400);
      await declareMany('declarer', ['not-a-uuid']).expect(400);
      const many = Array.from(
        { length: 51 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      );
      await declareMany('declarer', many).expect(400);
      await request(server)
        .post('/api/v1/vehicles/declare-many')
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(400);
    });

    it('accepts exactly fifty', async () => {
      const ids = Array.from(
        { length: 50 },
        (_, index) => `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      );

      const response = await declareMany('declarer', ids).expect(201);

      expect(response.body.declared).toBe(0);
      expect(response.body.skipped).toHaveLength(50);
    });

    it('is for a holder of vehicle.declare alone', async () => {
      const vehicle = await seeded('BD11');

      await declareMany('editor', [vehicle.id]).expect(403);
      await declareMany('enumerator', [vehicle.id]).expect(403);
      await declareMany('senior', [vehicle.id]).expect(403);

      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
          .declaredAt,
      ).toBeNull();
    });
  });

  describe('undeclaring (item 60, VEH-39)', () => {
    function undeclare(id: string, body: Record<string, unknown>, who = 'declarer') {
      return request(server)
        .post(`/api/v1/vehicles/${id}/undeclare`)
        .set('Cookie', cookies[who]!)
        .send(body);
    }

    it('returns an active vehicle to on record, uncounted, with the reason audited', async () => {
      const created = await declare({ plateNumberDisplay: plate('UD1') }).expect(
        201,
      );
      const id = created.body.vehicle.id as string;

      const response = await undeclare(id, { reason: 'e2e: declared by mistake' })
        .expect(201);
      expect(response.body.vehicle.status).toBe('ON_RECORD');
      expect(response.body.vehicle.declaredAt).toBeNull();

      const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe('ON_RECORD');
      expect(stored.declaredAt).toBeNull();

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { subjectId: id, action: 'vehicle.undeclare' },
      });
      expect(audit.reason).toBe('e2e: declared by mistake');
      expect(JSON.stringify(audit.beforeValue)).toContain('ACTIVE');
    });

    it('can be declared again, and counts only from the new date', async () => {
      const created = await declare({ plateNumberDisplay: plate('UD2') }).expect(
        201,
      );
      const id = created.body.vehicle.id as string;
      const first = (
        await prisma.vehicle.findUniqueOrThrow({ where: { id } })
      ).declaredAt!;

      await undeclare(id, { reason: 'e2e: undo' }).expect(201);
      await request(server)
        .post(`/api/v1/vehicles/${id}/declare`)
        .set('Cookie', cookies.declarer!)
        .send({})
        .expect(201);

      const again = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
      expect(again.status).toBe('ACTIVE');
      expect(again.declaredAt!.getTime()).toBeGreaterThanOrEqual(first.getTime());
      // One row throughout: nothing was deleted or duplicated.
      expect(
        await prisma.vehicle.count({ where: { plateNumberNormalized: 'E2EVUD2' } }),
      ).toBe(1);
    });

    it('keeps a suspended vehicle suspended, and lifting it then returns it to on record', async () => {
      const created = await declare({ plateNumberDisplay: plate('UD3') }).expect(
        201,
      );
      const id = created.body.vehicle.id as string;
      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'SUSPENDED', reason: 'e2e: suspended' })
        .expect(200);

      const response = await undeclare(id, { reason: 'e2e: uncount' }).expect(201);
      expect(response.body.vehicle.status).toBe('SUSPENDED');
      expect(response.body.vehicle.declaredAt).toBeNull();

      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'ACTIVE', reason: 'e2e: lifted' })
        .expect(200);
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('ON_RECORD');
    });

    it('asks for a reason', async () => {
      const created = await declare({ plateNumberDisplay: plate('UD4') }).expect(
        201,
      );
      await undeclare(created.body.vehicle.id, {}).expect(400);
      await undeclare(created.body.vehicle.id, { reason: 'no' }).expect(400);
    });

    it('refuses a vehicle that is not declared, retired, or archived', async () => {
      const onRecord = await record({ plateNumberDisplay: plate('UD5') }).expect(
        201,
      );
      await undeclare(onRecord.body.vehicle.id, { reason: 'e2e: nothing to undo' })
        .expect(409);

      for (const [suffix, status] of [
        ['UD6', 'RETIRED'],
        ['UD7', 'ARCHIVED'],
      ] as const) {
        const row = await prisma.vehicle.create({
          data: {
            plateNumberNormalized: `E2EV${suffix}`,
            plateNumberDisplay: plate(suffix),
            branchId: fixture.branchAId,
            status,
          },
        });
        await undeclare(row.id, { reason: 'e2e: terminal' }).expect(409);
      }
    });

    it('needs vehicle.declare, and answers 404 outside the caller’s scope', async () => {
      const created = await declare({ plateNumberDisplay: plate('UD8') }).expect(
        201,
      );
      const id = created.body.vehicle.id as string;

      await undeclare(id, { reason: 'e2e: not mine' }, 'reader').expect(403);
      await undeclare(id, { reason: 'e2e: not mine' }, 'suspender').expect(403);
      // Holds the permission, but in another branch.
      await undeclare(id, { reason: 'e2e: not mine' }, 'otherbranch').expect(404);

      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('ACTIVE');
    });
  });

  describe('declaration status (QUESTIONS.md VEH-28)', () => {
    it('shows the status only to a holder of vehicle.declare', async () => {
      const created = await declare({ plateNumberDisplay: plate('DS1') }).expect(
        201,
      );
      const id = created.body.vehicle.id;

      const asReader = await request(server)
        .get(`/api/v1/vehicles/${id}`)
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(asReader.body.vehicle).not.toHaveProperty('status');
      expect(asReader.body.vehicle).not.toHaveProperty('declaredAt');

      const asDeclarer = await request(server)
        .get(`/api/v1/vehicles/${id}`)
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(asDeclarer.body.vehicle.status).toBe('ACTIVE');
      expect(asDeclarer.body.vehicle.declaredAt).not.toBeNull();
    });

    it('leaves it off list rows, and lets no status filter find anything, without vehicle.declare', async () => {
      await declare({ plateNumberDisplay: plate('DS2') }).expect(201);

      const listed = await request(server)
        .get('/api/v1/vehicles')
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(listed.body.vehicles.length).toBeGreaterThan(0);
      for (const vehicle of listed.body.vehicles) {
        expect(vehicle).not.toHaveProperty('status');
        expect(vehicle).not.toHaveProperty('declaredAt');
      }

      const filtered = await request(server)
        .get('/api/v1/vehicles?status=ACTIVE')
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(filtered.body.vehicles).toEqual([]);

      const asDeclarer = await request(server)
        .get('/api/v1/vehicles?status=ACTIVE')
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(
        asDeclarer.body.vehicles.some(
          (v: { plateNumberDisplay: string; status: string }) =>
            v.plateNumberDisplay.includes('DS2') && v.status === 'ACTIVE',
        ),
      ).toBe(true);
    });

    it('refuses a status change from an officer who may not see the status', async () => {
      const created = await declare({ plateNumberDisplay: plate('DS3') }).expect(
        201,
      );

      await request(server)
        .patch(`/api/v1/vehicles/${created.body.vehicle.id}/status`)
        .set('Cookie', cookies.suspender!)
        .send({ status: 'SUSPENDED', reason: 'e2e: blind suspension' })
        .expect(403);
      const stored = await prisma.vehicle.findUniqueOrThrow({
        where: { id: created.body.vehicle.id },
      });
      expect(stored.status).toBe('ACTIVE');
    });

    it('checks the declarer’s scope before saying anything about the status', async () => {
      const created = await declare({ plateNumberDisplay: plate('DS4') }).expect(
        201,
      );

      // Declare scope in another branch only: refused for scope (403), never
      // told that this vehicle is already declared (409).
      await request(server)
        .post(`/api/v1/vehicles/${created.body.vehicle.id}/declare`)
        .set('Cookie', cookies.crossdeclarer!)
        .send({})
        .expect(403);
    });

    it('never returns the organisation’s materialised path', async () => {
      const created = await declare({ plateNumberDisplay: plate('DS5') }).expect(
        201,
      );

      const detail = await request(server)
        .get(`/api/v1/vehicles/${created.body.vehicle.id}`)
        .set('Cookie', cookies.declarer!)
        .expect(200);
      expect(Object.keys(detail.body.vehicle.organisation).sort()).toEqual([
        'id',
        'level',
        'name',
      ]);
      expect(JSON.stringify(detail.body)).not.toContain(`/${fixture.branchAId}/`);
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

      // PAY-19 — retirement is dated, so the levy can stop after its month.
      const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
      expect(stored.retiredAt).not.toBeNull();
    });

    it('keeps every route type a vehicle has had (PAY-19)', async () => {
      const created = await declare({ plateNumberDisplay: plate('RT1') }).expect(
        201,
      );
      const id = created.body.vehicle.id;

      await request(server)
        .patch(`/api/v1/vehicles/${id}`)
        .set('Cookie', cookies.declarer!)
        .send({ routeTypeId: fixture.townServiceId })
        .expect(200);
      // Setting the route type it already has changes nothing.
      await request(server)
        .patch(`/api/v1/vehicles/${id}`)
        .set('Cookie', cookies.declarer!)
        .send({ routeTypeId: fixture.townServiceId })
        .expect(200);

      const history = await prisma.vehicleRouteTypeChange.findMany({
        where: { vehicleId: id },
        orderBy: { changedAt: 'asc' },
      });
      expect(
        history.map((row) => [row.previousRouteTypeId, row.routeTypeId]),
      ).toEqual([
        [null, fixture.interstateId],
        [fixture.interstateId, fixture.townServiceId],
      ]);
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

    it('suspends a vehicle on record, and lifts it back to on record, never declaring it (item 57)', async () => {
      const recorded = await record({ plateNumberDisplay: plate('UR1') }).expect(
        201,
      );
      const id = recorded.body.vehicle.id;
      const status = (next: string, reason: string) =>
        request(server)
          .patch(`/api/v1/vehicles/${id}/status`)
          .set('Cookie', cookies.declarer!)
          .send({ status: next, reason });

      await status('SUSPENDED', 'e2e: sticker under review')
        .expect(200)
        .expect((res) => expect(res.body.vehicle.status).toBe('SUSPENDED'));
      await status('ACTIVE', 'e2e: review closed')
        .expect(200)
        .expect((res) => expect(res.body.vehicle.status).toBe('ON_RECORD'));

      const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
      expect(stored.declaredAt).toBeNull();
    });

    it('never declares a vehicle on record by a status change (item 57)', async () => {
      const recorded = await record({ plateNumberDisplay: plate('UR2') }).expect(
        201,
      );
      await request(server)
        .patch(`/api/v1/vehicles/${recorded.body.vehicle.id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'ACTIVE', reason: 'e2e: a back door' })
        .expect(409);
    });

    it('retires a vehicle on record, dated so its levy stops (item 57)', async () => {
      const recorded = await record({ plateNumberDisplay: plate('UR3') }).expect(
        201,
      );
      const id = recorded.body.vehicle.id;
      await request(server)
        .patch(`/api/v1/vehicles/${id}/status`)
        .set('Cookie', cookies.declarer!)
        .send({ status: 'RETIRED', reason: 'e2e: off the road' })
        .expect(200)
        .expect((res) => expect(res.body.vehicle.status).toBe('RETIRED'));

      const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
      expect(stored.retiredAt).not.toBeNull();
      expect(stored.declaredAt).toBeNull();
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

  describe('amending an imported vehicle (item 62, VEH-40)', () => {
    /** A vehicle that came with the legacy register, in branch A. */
    async function imported(suffix: string) {
      return prisma.vehicle.create({
        data: {
          plateNumberNormalized: `E2EV${suffix}`,
          plateNumberDisplay: plate(suffix),
          branchId: fixture.branchAId,
          status: 'ON_RECORD',
          declaredAt: null,
          isLegacyImport: true,
        },
      });
    }

    const amend = (who: string, id: string, data: Record<string, unknown>) =>
      request(server)
        .patch(`/api/v1/vehicles/${id}`)
        .set('Cookie', cookies[who]!)
        .send(data);

    const amendAsEnumerator = (id: string, data: Record<string, unknown>) =>
      request(server)
        .patch(`/api/v1/vehicles/${id}/imported`)
        .set('Cookie', cookies.enumerator!)
        .send(data);

    const editOf = async (who: string, id: string) =>
      (
        await request(server)
          .get(`/api/v1/vehicles/${id}`)
          .set('Cookie', cookies[who]!)
          .expect(200)
      ).body.vehicle.edit;

    it('lets an administrator amend it as often as they need', async () => {
      const vehicle = await imported('IE1');

      await amend('senior', vehicle.id, { make: 'First' }).expect(200);
      await amend('senior', vehicle.id, { make: 'Second' }).expect(200);
      await amend('senior', vehicle.id, { color: 'Green' }).expect(200);

      const row = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id },
      });
      expect(row.make).toBe('Second');
      expect(row.importedEditedAt).toBeNull();
      expect(await editOf('senior', vehicle.id)).toEqual({
        right: 'ANYTIME',
        via: 'UPDATE',
      });
    });

    it('gives a vehicle-record officer one edit, then locks it to them', async () => {
      const vehicle = await imported('IE2');
      expect(await editOf('editor', vehicle.id)).toEqual({
        right: 'ONCE',
        via: 'UPDATE',
      });

      await amend('editor', vehicle.id, {
        make: 'Toyota',
        routeTypeId: fixture.interstateId,
        owner: { name: 'Fixture Owner' },
      }).expect(200);
      await amend('editor', vehicle.id, { make: 'Honda' }).expect(409);

      const row = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id },
      });
      expect(row.make).toBe('Toyota');
      expect(row.routeTypeId).toBe(fixture.interstateId);
      expect(row.importedEditedAt).not.toBeNull();
      expect((await editOf('editor', vehicle.id)).right).toBe('NONE');

      // An administrator still can.
      await amend('senior', vehicle.id, { make: 'Honda' }).expect(200);
    });

    it('gives a field enumerator one edit through its own route', async () => {
      const vehicle = await imported('IE3');
      expect(await editOf('enumerator', vehicle.id)).toEqual({
        right: 'ONCE',
        via: 'RECORD',
      });

      await amendAsEnumerator(vehicle.id, {
        make: 'Hiace',
        vehicleCategoryId: null,
      }).expect(200);
      await amendAsEnumerator(vehicle.id, { make: 'Again' }).expect(409);

      expect((await editOf('enumerator', vehicle.id)).right).toBe('NONE');
    });

    it('shares the one edit: whoever uses it first locks the vehicle to the rest', async () => {
      const vehicle = await imported('IE4');

      await amendAsEnumerator(vehicle.id, { make: 'Hiace' }).expect(200);

      await amend('editor', vehicle.id, { make: 'Other' }).expect(409);
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
          .make,
      ).toBe('Hiace');
    });

    it('lets only one of two saves made at once through', async () => {
      const vehicle = await imported('IE5');

      const [first, second] = await Promise.all([
        amend('editor', vehicle.id, { make: 'Alpha' }),
        amendAsEnumerator(vehicle.id, { make: 'Beta' }),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
    });

    it('refuses the plate, the placement, and the driver to one edit, and keeps the edit', async () => {
      const vehicle = await imported('IE6');

      await amend('editor', vehicle.id, {
        plateNumberDisplay: plate('IE6X'),
      }).expect(403);
      await amend('editor', vehicle.id, {
        organisationId: fixture.unitAId,
      }).expect(403);
      await amend('editor', vehicle.id, {
        declaredByMemberId: fixture.memberId,
      }).expect(403);
      await amendAsEnumerator(vehicle.id, {
        plateNumberDisplay: plate('IE6X'),
      }).expect(403);

      // Nothing was spent by the refusals.
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
          .importedEditedAt,
      ).toBeNull();
      await amend('editor', vehicle.id, { make: 'Fine' }).expect(200);

      // An administrator may change all three.
      await amend('senior', vehicle.id, {
        declaredByMemberId: fixture.memberId,
      }).expect(200);
    });

    it('does not spend the edit on an empty save', async () => {
      const vehicle = await imported('IE7');

      await amend('editor', vehicle.id, {}).expect(400);

      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
          .importedEditedAt,
      ).toBeNull();
    });

    it('leaves a vehicle recorded through the System amendable as before', async () => {
      const created = await record({ plateNumberDisplay: plate('IE8') }).expect(
        201,
      );
      const id = created.body.vehicle.id;

      await amend('editor', id, { make: 'One' }).expect(200);
      await amend('editor', id, { make: 'Two' }).expect(200);
      expect(await editOf('editor', id)).toEqual({
        right: 'ANYTIME',
        via: 'UPDATE',
      });
      // The enumerator's route is for imported vehicles only.
      await amendAsEnumerator(id, { make: 'Three' }).expect(409);
      expect(await editOf('enumerator', id)).toEqual({
        right: 'NONE',
        via: 'RECORD',
      });
    });

    it('gives a reader nothing, and an enumerator no way through the general route', async () => {
      const vehicle = await imported('IE9');

      expect((await editOf('reader', vehicle.id)).right).toBe('NONE');
      await amend('enumerator', vehicle.id, { make: 'No' }).expect(403);
      await amend('reader', vehicle.id, { make: 'No' }).expect(403);
    });

    it('answers 404 for a vehicle outside the officer’s area', async () => {
      const vehicle = await imported('IE10');

      await amend('outsider', vehicle.id, { make: 'No' }).expect(404);
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
          .make,
      ).toBeNull();
    });

    it('audits the edit with the fields and the right, never the values', async () => {
      const vehicle = await imported('IE11');

      await amend('editor', vehicle.id, {
        make: 'Secret-Make-Value',
        chassisVinRestricted: 'E2E-CHASSIS-IE11',
      }).expect(200);

      const events = await prisma.auditEvent.findMany({
        where: { subjectId: vehicle.id, action: 'vehicle.update' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.afterValue).toMatchObject({
        fieldsAmended: ['make', 'chassisVinRestricted'],
        editRight: 'ONCE',
      });
      expect(JSON.stringify(events)).not.toContain('Secret-Make-Value');
      expect(JSON.stringify(events)).not.toContain('E2E-CHASSIS-IE11');
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
    // VEH-28 — may suspend, but holds no vehicle.declare to see a status with.
    await buildUser('suspender', branchA.id, ['vehicle.read', 'vehicle.suspend']);
    // Reads branch A, declares only in branch B.
    await buildUser('crossdeclarer', branchA.id, ['vehicle.read']);
    await grant('crossdeclarer', branchB.id, ['vehicle.declare']);
    // Item 62 (VEH-40). A record officer: one edit of an imported vehicle.
    await buildUser('editor', branchA.id, ['vehicle.read', 'vehicle.update']);
    // An administrator: amends an imported vehicle at any time.
    await buildUser('senior', branchA.id, [
      'vehicle.read',
      'vehicle.update',
      'vehicle.update_imported',
    ]);
    // May amend vehicles in branch B only.
    await buildUser('outsider', branchB.id, ['vehicle.read', 'vehicle.update']);
    // Holds the permission in two branches, so has no single branch of their own.
    await buildUser('twobranch', branchA.id, ['vehicle.declare']);
    await grant('twobranch', branchB.id, ['vehicle.declare']);

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
    await prisma.user.create({
      data: {
        email: `${who}.${TAG}@nurtw.test`.toLowerCase(),
        fullName: `${who} fixture`,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    await grant(who, organisationId, permissions);
  }

  async function grant(
    who: string,
    organisationId: string,
    permissions: readonly string[],
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: `${who}.${TAG}@nurtw.test`.toLowerCase() },
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

import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';

/**
 * Sticker issuance and attachment, end to end (PRD §10, §26, §9A,
 * `plans/08-sticker-inventory-qr.md`).
 *
 * The assertions that carry weight: a freshly issued sticker exists with no
 * vehicle; attaching it to a vehicle is a one-shot event — a second
 * attachment attempt (on either the sticker or the payment reference) is
 * refused, never silently reassigned; a legacy barcode not on the imported
 * register is refused as unknown; a legacy barcode presented against the
 * wrong plate is refused with no override; and attach never touches the
 * vehicle's own declaration status.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-sticker';
const PASSWORD = 'e2e-fixture-password-1';

interface Fixture {
  branchId: string;
  feeTypeId: string;
}

describe('Sticker issuance and attachment (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let fixture: Fixture;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    await cleanUp();

    const council = await prisma.organisation.create({
      data: { name: `Council ${TAG}`, level: 'COUNCIL', path: 'placeholder' },
    });
    await prisma.organisation.update({
      where: { id: council.id },
      data: { path: `/${council.id}/` },
    });
    const branch = await prisma.organisation.create({
      data: {
        name: `Branch ${TAG}`,
        level: 'BRANCH',
        parentId: council.id,
        path: `/${council.id}/placeholder`,
      },
    });
    await prisma.organisation.update({
      where: { id: branch.id },
      data: { path: `/${council.id}/${branch.id}/` },
    });

    const feeType = await prisma.feeType.findFirstOrThrow({
      where: { code: 'STICKER_NEW' },
    });

    fixture = { branchId: branch.id, feeTypeId: feeType.id };

    await buildUser('issuer', ['sticker.issue']);
    await buildUser('attacher', ['sticker.attach', 'vehicle.read']);
    await buildUser('bystander', ['vehicle.read']);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    for (const who of ['issuer', 'attacher', 'bystander']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  async function declareVehicle(plateSuffix: string) {
    return prisma.vehicle.create({
      data: {
        plateNumberDisplay: `E2ESTK-${plateSuffix}`,
        plateNumberNormalized: `E2ESTK${plateSuffix}`,
        branchId: fixture.branchId,
        status: 'ACTIVE',
      },
    });
  }

  async function confirmedPayment() {
    return prisma.payment.create({
      data: {
        feeTypeId: fixture.feeTypeId,
        subjectType: 'vehicle',
        subjectId: randomUUID(),
        dueKobo: 200_000,
        contractorFeeKobo: 200,
        totalChargedKobo: 200_200,
        channel: 'LINK',
        status: 'CONFIRMED',
        paystackReference: `${TAG}-${randomUUID()}`,
        confirmedAt: new Date(),
      },
    });
  }

  describe('issuing', () => {
    it('creates an unattached sticker', async () => {
      const response = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);

      expect(response.body.sticker.vehicleId).toBeNull();
      expect(response.body.sticker.attachedAt).toBeNull();
      expect(response.body.sticker.status).toBe('ISSUED');
    });

    it('refuses a caller without sticker.issue', async () => {
      await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.attacher!)
        .send({ templateVersion: 'v1' })
        .expect(403);
    });
  });

  describe('attaching a freshly issued sticker', () => {
    it('attaches it to a vehicle, funded by a confirmed payment', async () => {
      const issued = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);
      const vehicle = await declareVehicle('AA1');
      const payment = await confirmedPayment();

      const response = await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: issued.body.sticker.id,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(201);

      expect(response.body.sticker.status).toBe('ACTIVE');
      expect(response.body.sticker.vehicleId).toBe(vehicle.id);
      expect(response.body.sticker.attachedAt).not.toBeNull();

      // Attach never promotes the vehicle's own declaration status.
      const reloaded = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id },
      });
      expect(reloaded.status).toBe('ACTIVE'); // unchanged from creation
    });

    it('refuses attaching the same sticker twice — one-shot in its life', async () => {
      const issued = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);
      const vehicleA = await declareVehicle('BB2');
      const vehicleB = await declareVehicle('BB3');
      const paymentA = await confirmedPayment();
      const paymentB = await confirmedPayment();

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: issued.body.sticker.id,
          vehicleId: vehicleA.id,
          paymentId: paymentA.id,
        })
        .expect(201);

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: issued.body.sticker.id,
          vehicleId: vehicleB.id,
          paymentId: paymentB.id,
        })
        .expect(409);
    });

    it('refuses reusing a payment reference across two stickers', async () => {
      const first = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);
      const second = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);
      const vehicleA = await declareVehicle('CC4');
      const vehicleB = await declareVehicle('CC5');
      const payment = await confirmedPayment();

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: first.body.sticker.id,
          vehicleId: vehicleA.id,
          paymentId: payment.id,
        })
        .expect(201);

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: second.body.sticker.id,
          vehicleId: vehicleB.id,
          paymentId: payment.id,
        })
        .expect(409);
    });

    it('refuses a caller without sticker.attach', async () => {
      const issued = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);
      const vehicle = await declareVehicle('DD6');
      const payment = await confirmedPayment();

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.bystander!)
        .send({
          stickerId: issued.body.sticker.id,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(403);
    });
  });

  describe('reattaching a legacy barcode', () => {
    it('refuses a barcode not on the imported register — recorded as unknown', async () => {
      const sticker = await prisma.sticker.create({
        data: {
          stickerQrId: `${TAG}-unregistered`,
          legacyBarcode: `${TAG}-unknown-barcode`,
          registeredPlateNormalized: null,
          templateVersion: 'legacy',
          status: 'ISSUED',
        },
      });
      const vehicle = await declareVehicle('EE7');
      const payment = await confirmedPayment();

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);
    });

    it('refuses a barcode presented against the wrong plate, with no override', async () => {
      const boundPlate = 'E2ESTKWRONG1';
      const sticker = await prisma.sticker.create({
        data: {
          stickerQrId: `${TAG}-mismatched`,
          legacyBarcode: `${TAG}-mismatch-barcode`,
          registeredPlateNormalized: boundPlate,
          templateVersion: 'legacy',
          status: 'ISSUED',
        },
      });
      const vehicle = await declareVehicle('FF8'); // a different plate
      const payment = await confirmedPayment();

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);
    });

    it('attaches when the barcode matches its registered plate exactly', async () => {
      const vehicle = await declareVehicle('GG9');
      const sticker = await prisma.sticker.create({
        data: {
          stickerQrId: `${TAG}-matched`,
          legacyBarcode: `${TAG}-matching-barcode`,
          registeredPlateNormalized: vehicle.plateNumberNormalized,
          templateVersion: 'legacy',
          status: 'ISSUED',
        },
      });
      const payment = await confirmedPayment();

      const response = await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(201);

      expect(response.body.sticker.status).toBe('ACTIVE');
      expect(response.body.sticker.plateNumberAtIssue).toBe(
        vehicle.plateNumberNormalized,
      );
    });
  });

  async function buildUser(
    who: string,
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
          organisationId: fixture?.branchId ?? user.id,
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
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);

    const vehicles = await prisma.vehicle.findMany({
      where: { branchId: { in: orgIds } },
      select: { id: true },
    });
    const vehicleIds = vehicles.map((v) => v.id);

    await prisma.sticker.deleteMany({
      where: {
        OR: [
          { vehicleId: { in: vehicleIds } },
          { stickerQrId: { contains: TAG } },
        ],
      },
    });
    await prisma.payment.deleteMany({
      where: { paystackReference: { contains: TAG } },
    });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

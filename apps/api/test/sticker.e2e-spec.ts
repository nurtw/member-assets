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
 *
 * Item 17 adds: the payment must be the onboarding fee, made for the vehicle
 * being onboarded; every refusal is audited with its reason; the onboarding
 * state and the internal legacy lookup; and the restricted security code
 * never leaving the database.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-sticker';
const PASSWORD = 'e2e-fixture-password-1';

interface Fixture {
  branchId: string;
  otherBranchId: string;
  feeTypeIds: Record<string, string>;
  routeTypeId: string;
}

type FeeCode = 'STICKER_NEW' | 'STICKER_REATTACHMENT' | 'LEVY';

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
    // Outside every fixture user's scope.
    const otherBranch = await prisma.organisation.create({
      data: {
        name: `Other branch ${TAG}`,
        level: 'BRANCH',
        parentId: council.id,
        path: `/${council.id}/placeholder-other`,
      },
    });
    await prisma.organisation.update({
      where: { id: otherBranch.id },
      data: { path: `/${council.id}/${otherBranch.id}/` },
    });

    const feeTypes = await prisma.feeType.findMany({
      where: { code: { in: ['STICKER_NEW', 'STICKER_REATTACHMENT', 'LEVY'] } },
      select: { id: true, code: true },
    });

    // Revision 1.3 (Requirement 9A.2) — a vehicle needs a route type before
    // it can be onboarded.
    const routeType = await prisma.routeType.findUniqueOrThrow({
      where: { code: 'INTERCITY' },
    });

    fixture = {
      branchId: branch.id,
      otherBranchId: otherBranch.id,
      feeTypeIds: Object.fromEntries(feeTypes.map((f) => [f.code, f.id])),
      routeTypeId: routeType.id,
    };

    await buildUser('issuer', ['sticker.issue']);
    await buildUser('attacher', ['sticker.attach', 'vehicle.read']);
    await buildUser('bystander', ['vehicle.read']);
    await buildUser('verifier', ['verification.perform']);
    await buildUser('stocker', ['sticker.stock_intake']);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    for (const who of [
      'issuer',
      'attacher',
      'bystander',
      'verifier',
      'stocker',
    ]) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  async function declareVehicle(
    plateSuffix: string,
    {
      withRouteType = true,
      branchId = fixture.branchId,
    }: { withRouteType?: boolean; branchId?: string } = {},
  ) {
    return prisma.vehicle.create({
      data: {
        plateNumberDisplay: `E2ESTK-${plateSuffix}`,
        plateNumberNormalized: `E2ESTK${plateSuffix}`,
        branchId,
        status: 'ACTIVE',
        routeTypeId: withRouteType ? fixture.routeTypeId : null,
      },
    });
  }

  /**
   * A confirmed payment. Item 17: it must be the onboarding fee (`STICKER_NEW`
   * for a signed sticker, `STICKER_REATTACHMENT` for a legacy barcode) and made
   * for the vehicle being onboarded, so both are explicit here.
   */
  async function confirmedPayment(
    vehicleId: string,
    feeCode: FeeCode = 'STICKER_NEW',
    status: 'CONFIRMED' | 'PENDING' = 'CONFIRMED',
  ) {
    return prisma.payment.create({
      data: {
        feeTypeId: fixture.feeTypeIds[feeCode]!,
        subjectType: 'vehicle',
        subjectId: vehicleId,
        dueKobo: 200_000,
        contractorFeeKobo: 200,
        totalChargedKobo: 200_200,
        channel: 'LINK',
        status,
        paystackReference: `${TAG}-${randomUUID()}`,
        confirmedAt: status === 'CONFIRMED' ? new Date() : null,
      },
    });
  }

  /** A legacy register row, shaped as the legacy import writes it. */
  async function registerBarcode(label: string, plateNormalized: string) {
    return prisma.sticker.create({
      data: {
        stickerQrId: `${TAG}-${label}`,
        legacyBarcode: `${TAG}-${label}-barcode`,
        registeredPlateNormalized: plateNormalized,
        legacySecurityCode: 'ZZ9ZZ',
        templateVersion: 'legacy-barcode',
        status: 'ISSUED',
      },
    });
  }

  async function issueSticker() {
    const response = await request(server)
      .post('/api/v1/stickers')
      .set('Cookie', cookies.issuer!)
      .send({ templateVersion: 'v1' })
      .expect(201);
    return response.body.sticker as { id: string; stickerQrId: string };
  }

  async function refusalReason(subjectId: string): Promise<string | null> {
    const event = await prisma.auditEvent.findFirst({
      where: { action: 'sticker.attach', subjectId },
      orderBy: { createdAt: 'desc' },
    });
    return event?.reason ?? null;
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
      const payment = await confirmedPayment(vehicle.id);

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

      // Requirement 9A.1 — onboarding carries its own actor.
      const stored = await prisma.sticker.findUniqueOrThrow({
        where: { id: issued.body.sticker.id },
        include: { attachedByUser: { select: { email: true } } },
      });
      expect(stored.attachedByUser?.email).toBe(`attacher.${TAG}@nurtw.test`);
    });

    it('attaches by the number printed on the sticker', async () => {
      const issued = await issueSticker();
      const vehicle = await declareVehicle('AB1');
      const payment = await confirmedPayment(vehicle.id);

      const response = await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerQrId: issued.stickerQrId,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(201);

      expect(response.body.sticker.id).toBe(issued.id);
    });

    it.each([
      ['a levy', 'LEVY'],
      ['a reattachment fee', 'STICKER_REATTACHMENT'],
    ] as const)(
      'refuses a new sticker paid for with %s, and audits why',
      async (_label, feeCode) => {
        const issued = await issueSticker();
        const vehicle = await declareVehicle(`AC${feeCode.length}`);
        const payment = await confirmedPayment(vehicle.id, feeCode);

        await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          .send({ stickerId: issued.id, vehicleId: vehicle.id, paymentId: payment.id })
          .expect(409);

        expect(await refusalReason(issued.id)).toBe('PAYMENT_WRONG_FEE_TYPE');
        const after = await prisma.sticker.findUniqueOrThrow({
          where: { id: issued.id },
        });
        expect(after.attachedAt).toBeNull();
      },
    );

    it('refuses a payment made for another vehicle, and audits why', async () => {
      const issued = await issueSticker();
      const vehicle = await declareVehicle('AD1');
      const elsewhere = await declareVehicle('AD2');
      const payment = await confirmedPayment(elsewhere.id);

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({ stickerId: issued.id, vehicleId: vehicle.id, paymentId: payment.id })
        .expect(409);

      expect(await refusalReason(issued.id)).toBe('PAYMENT_WRONG_VEHICLE');
    });

    it('refuses a payment Paystack has not confirmed', async () => {
      const issued = await issueSticker();
      const vehicle = await declareVehicle('AE1');
      const payment = await confirmedPayment(vehicle.id, 'STICKER_NEW', 'PENDING');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({ stickerId: issued.id, vehicleId: vehicle.id, paymentId: payment.id })
        .expect(409);

      expect(await refusalReason(issued.id)).toBe('PAYMENT_NOT_CONFIRMED');
    });

    it('refuses a second sticker on a vehicle that already carries one', async () => {
      const first = await issueSticker();
      const second = await issueSticker();
      const vehicle = await declareVehicle('AF1');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: first.id,
          vehicleId: vehicle.id,
          paymentId: (await confirmedPayment(vehicle.id)).id,
        })
        .expect(201);

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerId: second.id,
          vehicleId: vehicle.id,
          paymentId: (await confirmedPayment(vehicle.id)).id,
        })
        .expect(409);

      expect(await refusalReason(second.id)).toBe('VEHICLE_ALREADY_HAS_STICKER');
    });

    it('refuses attaching the same sticker twice — one-shot in its life', async () => {
      const issued = await request(server)
        .post('/api/v1/stickers')
        .set('Cookie', cookies.issuer!)
        .send({ templateVersion: 'v1' })
        .expect(201);
      const vehicleA = await declareVehicle('BB2');
      const vehicleB = await declareVehicle('BB3');
      const paymentA = await confirmedPayment(vehicleA.id);
      const paymentB = await confirmedPayment(vehicleB.id);

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
      const payment = await confirmedPayment(vehicleA.id);

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
      const payment = await confirmedPayment(vehicle.id);

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
    it('refuses a barcode not on the register — audited as unknown, not a forgery', async () => {
      // The register is closed (VEH-21): a barcode with no row is unknown.
      const vehicle = await declareVehicle('EE7');
      const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: `${TAG}-never-on-the-register`,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'sticker.attach', subjectType: 'vehicle', subjectId: vehicle.id },
      });
      expect(event.reason).toBe('UNKNOWN_BARCODE');
      expect(event.afterValue).toMatchObject({
        outcome: 'REFUSED',
        presentedBarcode: `${TAG}-never-on-the-register`,
      });
    });

    it('refuses a barcode presented against the wrong plate, with no override', async () => {
      const sticker = await registerBarcode('mismatched', 'E2ESTKWRONG1');
      const vehicle = await declareVehicle('FF8'); // a different plate
      const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);

      expect(await refusalReason(sticker.id)).toBe('PLATE_MISMATCH');
    });

    it('refuses a reattachment paid for as a new sticker', async () => {
      const vehicle = await declareVehicle('FF9');
      const sticker = await registerBarcode('paid-as-new', vehicle.plateNumberNormalized);
      const payment = await confirmedPayment(vehicle.id, 'STICKER_NEW');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);

      expect(await refusalReason(sticker.id)).toBe('PAYMENT_WRONG_FEE_TYPE');
    });

    it('refuses a register row reached by its internal number, as a legacy barcode', async () => {
      // A legacy row carries an opaque stickerQrId too. Naming the row that
      // way must not skip the register and plate checks.
      const sticker = await registerBarcode('by-qr-id', 'E2ESTKWRONG2');
      const vehicle = await declareVehicle('FG1');
      const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          stickerQrId: sticker.stickerQrId,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);

      expect(await refusalReason(sticker.id)).toBe('PLATE_MISMATCH');
    });

    it('attaches when the barcode matches its registered plate, never returning the security code', async () => {
      const vehicle = await declareVehicle('GG9');
      const sticker = await registerBarcode('matched', vehicle.plateNumberNormalized);
      const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');

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
      // Requirement 9A.5 — a record only, never in a response.
      expect(response.body.sticker).not.toHaveProperty('legacySecurityCode');
      expect(response.body.sticker).not.toHaveProperty('registeredPlateNormalized');
      expect(JSON.stringify(response.body)).not.toContain('ZZ9ZZ');
    });

    it('refuses onboarding a vehicle with no route type (Requirement 9A.2, revision 1.3)', async () => {
      // Shaped like a legacy vehicle not yet given a route type.
      const vehicle = await declareVehicle('HH0', { withRouteType: false });
      const sticker = await registerBarcode('no-route', vehicle.plateNumberNormalized);
      const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(409);

      const after = await prisma.sticker.findUniqueOrThrow({
        where: { id: sticker.id },
      });
      expect(after.attachedAt).toBeNull();
    });
  });

  describe('onboarding state (item 17)', () => {
    it('lists eligible payments and whether the register holds a barcode, then shows the attachment', async () => {
      const vehicle = await declareVehicle('JJ1');
      const sticker = await registerBarcode('state', vehicle.plateNumberNormalized);
      const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');
      // Not eligible: a levy, a pending payment, and another vehicle's payment.
      await confirmedPayment(vehicle.id, 'LEVY');
      await confirmedPayment(vehicle.id, 'STICKER_NEW', 'PENDING');
      await confirmedPayment((await declareVehicle('JJ2')).id, 'STICKER_REATTACHMENT');

      const before = await request(server)
        .get(`/api/v1/stickers/onboarding/${vehicle.id}`)
        .set('Cookie', cookies.attacher!)
        .expect(200);

      expect(before.body.onboarding).toMatchObject({
        vehicleId: vehicle.id,
        hasRouteType: true,
        attachment: null,
        registerHoldsBarcodeForPlate: true,
      });
      expect(
        before.body.onboarding.eligiblePayments.map((p: { id: string }) => p.id),
      ).toEqual([payment.id]);
      // Whether the register holds a barcode, never which one.
      expect(JSON.stringify(before.body)).not.toContain(sticker.legacyBarcode!);

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: payment.id,
        })
        .expect(201);

      const after = await request(server)
        .get(`/api/v1/stickers/onboarding/${vehicle.id}`)
        .set('Cookie', cookies.attacher!)
        .expect(200);

      expect(after.body.onboarding.attachment).toMatchObject({
        kind: 'LEGACY',
        stickerNumber: sticker.legacyBarcode,
        attachedBy: 'attacher fixture',
        stickerStatus: 'ACTIVE',
      });
      expect(after.body.onboarding.registerHoldsBarcodeForPlate).toBe(false);
      expect(after.body.onboarding.eligiblePayments).toEqual([]);

      // The vehicle page shows onboarding without the sticker number.
      const detail = await request(server)
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Cookie', cookies.attacher!)
        .expect(200);
      expect(detail.body.vehicle.onboarding).toEqual({
        kind: 'LEGACY',
        attachedAt: after.body.onboarding.attachment.attachedAt,
        attachedBy: 'attacher fixture',
        stickerStatus: 'ACTIVE',
        letterReference: after.body.onboarding.attachment.letterReference,
      });
      expect(detail.body.vehicle.onboarding.letterReference).toEqual(
        expect.any(String),
      );
    });

    it('answers 404 for a vehicle outside the caller\'s scope', async () => {
      const vehicle = await declareVehicle('JJ3', {
        branchId: fixture.otherBranchId,
      });

      await request(server)
        .get(`/api/v1/stickers/onboarding/${vehicle.id}`)
        .set('Cookie', cookies.attacher!)
        .expect(404);
    });

    it('refuses a caller without sticker.attach', async () => {
      const vehicle = await declareVehicle('JJ4');

      await request(server)
        .get(`/api/v1/stickers/onboarding/${vehicle.id}`)
        .set('Cookie', cookies.bystander!)
        .expect(403);
    });
  });

  describe('the vehicle letter (Requirement 9A.6, item 18)', () => {
    async function onboard(suffix: string) {
      const vehicle = await prisma.vehicle.update({
        where: { id: (await declareVehicle(suffix)).id },
        data: { make: 'Toyota', model: 'Hiace', color: 'White' },
      });
      const sticker = await registerBarcode(`letter-${suffix}`, vehicle.plateNumberNormalized);
      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: (await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT')).id,
        })
        .expect(201);
      return { vehicle, sticker };
    }

    function pdf(path: string, cookie: string) {
      return request(server)
        .get(path)
        .set('Cookie', cookie)
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
    }

    it('is issued with the attachment, once, snapshotting what it prints', async () => {
      const { vehicle, sticker } = await onboard('LT1');

      const letters = await prisma.vehicleLetter.findMany({
        where: { vehicleId: vehicle.id },
        include: { issuedByUser: { select: { email: true } } },
      });
      expect(letters).toHaveLength(1);
      expect(letters[0]).toMatchObject({
        stickerId: sticker.id,
        templateVersion: 'v1',
        printedPlate: vehicle.plateNumberDisplay,
        printedMake: 'Toyota',
        printedModel: 'Hiace',
        printedColour: 'White',
        printedStickerNumber: sticker.legacyBarcode,
        printedBranch: `Branch ${TAG}`,
        printedUnit: null,
        // No driver linked: printed as not recorded, never guessed.
        printedMemberName: null,
        printedMembershipNumber: null,
        // No officer signature registered here (CARD-07).
        presidentSignatureId: null,
        generalSecretarySignatureId: null,
      });
      expect(letters[0]!.issuedByUser?.email).toBe(`attacher.${TAG}@nurtw.test`);

      const issued = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'vehicle_letter.issue', subjectId: letters[0]!.id },
      });
      expect(issued.afterValue).toMatchObject({
        letterReference: letters[0]!.letterReference,
      });

      // A later edit to the vehicle does not change the letter already issued.
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: { color: 'Blue' } });
      const again = await prisma.vehicleLetter.findUniqueOrThrow({
        where: { id: letters[0]!.id },
      });
      expect(again.printedColour).toBe('White');
    });

    it('is not issued when the attachment is refused', async () => {
      const vehicle = await declareVehicle('LT2');
      const sticker = await registerBarcode('letter-refused', 'E2ESTKNOTTHIS');

      await request(server)
        .post('/api/v1/stickers/attach')
        .set('Cookie', cookies.attacher!)
        .send({
          legacyBarcode: sticker.legacyBarcode,
          vehicleId: vehicle.id,
          paymentId: (await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT')).id,
        })
        .expect(409);

      expect(await prisma.vehicleLetter.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    });

    it('downloads as a PDF for anyone who can read the vehicle, audited as an export', async () => {
      const { vehicle } = await onboard('LT3');

      // The bystander holds vehicle.read alone: reading the vehicle includes its letter.
      const response = await pdf(`/api/v1/vehicles/${vehicle.id}/letter`, cookies.bystander!).expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['cache-control']).toBe('no-store');
      const letter = await prisma.vehicleLetter.findFirstOrThrow({
        where: { vehicleId: vehicle.id },
      });
      // Named by reference, which says nothing about the member or the plate.
      expect(response.headers['content-disposition']).toContain(letter.letterReference);
      expect((response.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');

      const exported = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'vehicle_letter.download', subjectId: letter.id },
      });
      expect(exported.afterValue).toMatchObject({ vehicleId: vehicle.id });
    });

    it('answers 404 for a vehicle with no letter', async () => {
      const vehicle = await declareVehicle('LT4');
      await request(server)
        .get(`/api/v1/vehicles/${vehicle.id}/letter`)
        .set('Cookie', cookies.bystander!)
        .expect(404);
    });

    it("answers 404 for a letter outside the caller's scope, the same as none", async () => {
      const vehicle = await declareVehicle('LT5', { branchId: fixture.otherBranchId });
      const sticker = await registerBarcode('letter-out-of-scope', vehicle.plateNumberNormalized);
      await prisma.vehicleLetter.create({
        data: {
          vehicleId: vehicle.id,
          stickerId: sticker.id,
          letterReference: `${TAG}-out-of-scope`,
          templateVersion: 'v1',
          printedPlate: vehicle.plateNumberDisplay,
          printedStickerNumber: sticker.legacyBarcode!,
        },
      });

      await request(server)
        .get(`/api/v1/vehicles/${vehicle.id}/letter`)
        .set('Cookie', cookies.bystander!)
        .expect(404);
    });

    it('refuses a caller without vehicle.read', async () => {
      const { vehicle } = await onboard('LT6');
      await request(server)
        .get(`/api/v1/vehicles/${vehicle.id}/letter`)
        .set('Cookie', cookies.verifier!)
        .expect(403);
    });

    describe('reissuing (QUESTIONS.md VEH-27)', () => {
      it('issues a new letter under a new reference, keeping the old one superseded', async () => {
        const { vehicle } = await onboard('LT7');
        const original = await prisma.vehicleLetter.findFirstOrThrow({
          where: { vehicleId: vehicle.id },
        });
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { color: 'Blue' },
        });

        const response = await request(server)
          .post(`/api/v1/vehicles/${vehicle.id}/letter/reissue`)
          .set('Cookie', cookies.attacher!)
          .send({ reason: 'e2e: repainted' })
          .expect(201);
        expect(response.body.letter.letterReference).not.toBe(
          original.letterReference,
        );

        const letters = await prisma.vehicleLetter.findMany({
          where: { vehicleId: vehicle.id },
          orderBy: { issuedAt: 'asc' },
        });
        expect(letters).toHaveLength(2);
        // The old letter is kept exactly as printed.
        expect(letters[0]).toMatchObject({
          id: original.id,
          printedColour: 'White',
        });
        expect(letters[0]!.supersededAt).not.toBeNull();
        expect(letters[1]).toMatchObject({
          letterReference: response.body.letter.letterReference,
          printedColour: 'Blue',
          replacesLetterId: original.id,
          reissueReason: 'e2e: repainted',
          supersededAt: null,
        });

        const audit = await prisma.auditEvent.findFirstOrThrow({
          where: { action: 'vehicle_letter.reissue', subjectId: letters[1]!.id },
        });
        expect(audit.reason).toBe('e2e: repainted');
        expect(audit.beforeValue).toMatchObject({
          letterReference: original.letterReference,
        });

        // Only the current letter downloads.
        const download = await pdf(
          `/api/v1/vehicles/${vehicle.id}/letter`,
          cookies.bystander!,
        ).expect(200);
        expect(download.headers['content-disposition']).toContain(
          response.body.letter.letterReference,
        );
      });

      it('requires a reason', async () => {
        const { vehicle } = await onboard('LT8');
        await request(server)
          .post(`/api/v1/vehicles/${vehicle.id}/letter/reissue`)
          .set('Cookie', cookies.attacher!)
          .send({ reason: '' })
          .expect(400);
      });

      it('refuses a caller without sticker.attach', async () => {
        const { vehicle } = await onboard('LT9');
        await request(server)
          .post(`/api/v1/vehicles/${vehicle.id}/letter/reissue`)
          .set('Cookie', cookies.bystander!)
          .send({ reason: 'e2e: not allowed' })
          .expect(403);
      });

      it('answers 404 for a vehicle with no letter to reissue', async () => {
        const vehicle = await declareVehicle('LT10');
        await request(server)
          .post(`/api/v1/vehicles/${vehicle.id}/letter/reissue`)
          .set('Cookie', cookies.attacher!)
          .send({ reason: 'e2e: nothing to reissue' })
          .expect(404);
      });
    });
  });

  describe('internal legacy lookup (Requirement 11.2)', () => {
    it('reads an unattached register barcode as recognised, not attached, with its plate', async () => {
      const sticker = await registerBarcode('lookup', 'E2ESTKLOOK1');

      const response = await request(server)
        .post('/api/v1/stickers/legacy-lookup')
        .set('Cookie', cookies.verifier!)
        .send({ barcode: sticker.legacyBarcode })
        .expect(200);

      expect(response.body.reading).toEqual({
        result: 'RECOGNISED_NOT_ATTACHED',
        message: 'Recognised sticker — not attached',
        registeredPlate: 'E2ESTKLOOK1',
      });
      expect(JSON.stringify(response.body)).not.toContain('ZZ9ZZ');

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'verification.legacy_barcode', subjectId: sticker.id },
      });
      expect(event.afterValue).toEqual({ outcome: 'RECOGNISED_NOT_ATTACHED' });
    });

    it('answers the generic 404 for a barcode not on the register, and audits it', async () => {
      const barcode = `${TAG}-lookup-unknown`;

      const response = await request(server)
        .post('/api/v1/stickers/legacy-lookup')
        .set('Cookie', cookies.verifier!)
        .send({ barcode })
        .expect(404);

      expect(response.body.error.message).toBe('No matching resource was found.');
      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'verification.legacy_barcode', subjectId: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(event.afterValue).toEqual({ outcome: 'NOT_FOUND', presentedBarcode: barcode });
    });

    it('is read-only: a lookup never attaches or changes the register row', async () => {
      const sticker = await registerBarcode('lookup-readonly', 'E2ESTKLOOK2');
      const before = await prisma.sticker.findUniqueOrThrow({ where: { id: sticker.id } });

      await request(server)
        .post('/api/v1/stickers/legacy-lookup')
        .set('Cookie', cookies.verifier!)
        .send({ barcode: sticker.legacyBarcode })
        .expect(200);

      const after = await prisma.sticker.findUniqueOrThrow({ where: { id: sticker.id } });
      expect(after).toEqual(before);
    });

    it('refuses a caller without verification.perform', async () => {
      await request(server)
        .post('/api/v1/stickers/legacy-lookup')
        .set('Cookie', cookies.attacher!)
        .send({ barcode: `${TAG}-anything` })
        .expect(403);
    });
  });


  describe('sticker stock (Requirement 9A.8, VEH-29)', () => {
    let counter = 0;

    /**
     * A barcode no real sticker carries: thirteen digits beginning 99, where
     * the imported ones are timestamps beginning 17.
     */
    function barcode(): string {
      counter += 1;
      return `99${String(Date.now()).slice(-9)}${String(counter).padStart(2, '0')}`;
    }

    /** What a camera reads from a legacy sticker: an address ending in its barcode. */
    function scanned(code: string): string {
      return `https://www.example.test/v/status/${code}`;
    }

    async function addToStock(code: string, who = 'stocker') {
      return request(server)
        .post('/api/v1/stickers/stock')
        .set('Cookie', cookies[who]!)
        .send({ code });
    }

    async function reading(vehicleId: string, code: string, who = 'attacher') {
      return request(server)
        .post(`/api/v1/stickers/onboarding/${vehicleId}/reading`)
        .set('Cookie', cookies[who]!)
        .send({ code });
    }

    it('adds a scanned sticker to stock, taking the barcode from what the camera read', async () => {
      const code = barcode();

      const response = await addToStock(scanned(code));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        outcome: 'ADDED',
        sticker: {
          stickerNumber: code,
          standing: 'IN_STOCK',
          addedBy: 'stocker fixture',
          attachedPlate: null,
        },
      });

      const stored = await prisma.sticker.findUniqueOrThrow({
        where: { legacyBarcode: code },
      });
      expect(stored).toMatchObject({
        status: 'ISSUED',
        templateVersion: 'legacy-barcode',
        // Bound to no plate until it is attached.
        registeredPlateNormalized: null,
        vehicleId: null,
        attachedAt: null,
      });
      expect(stored.stockAddedAt).not.toBeNull();

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'sticker.stock_add', subjectId: stored.id },
      });
      expect(event.afterValue).toEqual({ outcome: 'ADDED', legacyBarcode: code });
    });

    it('does not add a barcode twice, and says where it stands', async () => {
      const code = barcode();
      const first = await addToStock(code);

      const second = await addToStock(scanned(code));

      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({
        outcome: 'ALREADY_HELD',
        held: 'IN_STOCK',
        sticker: { id: first.body.sticker.id },
      });
      expect(
        await prisma.sticker.count({ where: { legacyBarcode: code } }),
      ).toBe(1);
    });

    it('leaves a barcode on the register as it is', async () => {
      const code = barcode();
      const registered = await prisma.sticker.create({
        data: {
          stickerQrId: `${TAG}-stock-registered`,
          legacyBarcode: code,
          registeredPlateNormalized: 'E2ESTKREG9',
          templateVersion: 'legacy-barcode',
          status: 'ISSUED',
        },
      });

      const response = await addToStock(code);

      expect(response.body).toEqual({
        outcome: 'ALREADY_HELD',
        held: 'ON_REGISTER',
        sticker: null,
      });
      // The plate the register records is not given out here.
      expect(JSON.stringify(response.body)).not.toContain('E2ESTKREG9');
      const after = await prisma.sticker.findUniqueOrThrow({
        where: { id: registered.id },
      });
      expect(after.stockAddedAt).toBeNull();
      expect(after.registeredPlateNormalized).toBe('E2ESTKREG9');
    });

    it.each([
      'https://example.test/menu',
      'not a barcode',
      '12345',
      'ab12cd34.k1.0123456789abcdef',
    ])('refuses %j: it is not a barcode', async (code) => {
      const response = await addToStock(code);

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        expect.objectContaining({ field: 'code' }),
      ]);
    });

    it('is for holders of sticker.stock_intake alone', async () => {
      for (const who of ['attacher', 'issuer', 'verifier']) {
        expect((await addToStock(barcode(), who)).status).toBe(403);
        await request(server)
          .get('/api/v1/stickers/stock')
          .set('Cookie', cookies[who]!)
          .expect(403);
      }
    });

    it('lists the stock, newest first, with its totals', async () => {
      const code = barcode();
      await addToStock(code);

      const response = await request(server)
        .get('/api/v1/stickers/stock')
        .set('Cookie', cookies.stocker!)
        .expect(200);

      expect(response.body.counts.inStock).toBeGreaterThanOrEqual(1);
      expect(response.body.stickers[0]).toMatchObject({
        stickerNumber: code,
        standing: 'IN_STOCK',
      });
      expect(response.body.truncated).toBe(false);
      // The security code and the register's plates are no part of it.
      expect(JSON.stringify(response.body)).not.toContain('ZZ9ZZ');
    });

    describe('attaching a sticker from stock', () => {
      it('tells the onboarding screen stock can give one, never how many', async () => {
        await addToStock(barcode());
        const vehicle = await declareVehicle('STK1');

        const response = await request(server)
          .get(`/api/v1/stickers/onboarding/${vehicle.id}`)
          .set('Cookie', cookies.attacher!)
          .expect(200);

        expect(response.body.onboarding).toMatchObject({
          registerHoldsBarcodeForPlate: false,
          stockHasStickers: true,
        });
      });

      it('attaches it to a vehicle the register never knew, paid for as a new sticker', async () => {
        const code = barcode();
        await addToStock(code);
        const vehicle = await declareVehicle('STK2');
        const payment = await confirmedPayment(vehicle.id, 'STICKER_NEW');

        const read = await reading(vehicle.id, scanned(code));
        expect(read.status).toBe(200);
        expect(read.body.reading).toEqual({
          result: 'CAN_ATTACH',
          stickerNumber: code,
          feeTypeCode: 'STICKER_NEW',
        });

        const response = await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          // Sent as the camera read it.
          .send({
            legacyBarcode: scanned(code),
            vehicleId: vehicle.id,
            paymentId: payment.id,
          })
          .expect(201);

        expect(response.body.sticker).toMatchObject({
          status: 'ACTIVE',
          vehicleId: vehicle.id,
          legacyBarcode: code,
          // The plate is bound by the attachment.
          plateNumberAtIssue: vehicle.plateNumberNormalized,
        });
        // Requirement 9A.6 — an onboarding from stock produces its letter too.
        expect(
          await prisma.vehicleLetter.count({ where: { vehicleId: vehicle.id } }),
        ).toBe(1);
        const event = await prisma.auditEvent.findFirstOrThrow({
          where: { action: 'sticker.attach', subjectId: response.body.sticker.id },
          orderBy: { createdAt: 'desc' },
        });
        expect(event.afterValue).toMatchObject({
          outcome: 'ATTACHED',
          origin: 'STOCK',
        });

        const stock = await request(server)
          .get('/api/v1/stickers/stock')
          .set('Cookie', cookies.stocker!)
          .expect(200);
        expect(
          stock.body.stickers.find(
            (entry: { stickerNumber: string }) => entry.stickerNumber === code,
          ),
        ).toMatchObject({
          standing: 'ATTACHED',
          attachedPlate: vehicle.plateNumberNormalized,
        });

        // Once in its life: the same sticker cannot go on another vehicle.
        const second = await declareVehicle('STK3');
        expect((await reading(second.id, code)).body.reading).toEqual({
          result: 'ALREADY_ATTACHED',
        });
        const secondPayment = await confirmedPayment(second.id, 'STICKER_NEW');
        await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          .send({
            legacyBarcode: code,
            vehicleId: second.id,
            paymentId: secondPayment.id,
          })
          .expect(409);
        expect(await refusalReason(response.body.sticker.id)).toBe(
          'ALREADY_ATTACHED',
        );
      });

      it('refuses one paid for as a reattachment', async () => {
        const code = barcode();
        const added = await addToStock(code);
        const vehicle = await declareVehicle('STK4');
        const payment = await confirmedPayment(vehicle.id, 'STICKER_REATTACHMENT');

        await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          .send({
            legacyBarcode: code,
            vehicleId: vehicle.id,
            paymentId: payment.id,
          })
          .expect(409);

        expect(await refusalReason(added.body.sticker.id)).toBe(
          'PAYMENT_WRONG_FEE_TYPE',
        );
      });

      it('still refuses a barcode that is neither on the register nor in stock', async () => {
        const code = barcode();
        const vehicle = await declareVehicle('STK5');
        const payment = await confirmedPayment(vehicle.id, 'STICKER_NEW');

        expect((await reading(vehicle.id, code)).body.reading).toEqual({
          result: 'NOT_HELD',
        });
        await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          .send({
            legacyBarcode: code,
            vehicleId: vehicle.id,
            paymentId: payment.id,
          })
          .expect(409);
        expect(await refusalReason(vehicle.id)).toBe('UNKNOWN_BARCODE');
      });
    });

    describe('the reading before an attachment (Requirement 9A.7)', () => {
      it('says a register barcode is for another vehicle, without naming it', async () => {
        const registered = await registerBarcode('reading-other', 'E2ESTKOTHR1');
        const vehicle = await declareVehicle('RD1');

        const response = await reading(vehicle.id, registered.legacyBarcode!);

        expect(response.body.reading).toEqual({ result: 'FOR_ANOTHER_VEHICLE' });
        expect(JSON.stringify(response.body)).not.toContain('E2ESTKOTHR1');
      });

      it('says a register barcode for this plate is reattached, at the reattachment fee', async () => {
        const vehicle = await declareVehicle('RD2');
        const registered = await registerBarcode(
          'reading-own',
          vehicle.plateNumberNormalized,
        );

        const response = await reading(vehicle.id, registered.legacyBarcode!);

        expect(response.body.reading).toEqual({
          result: 'CAN_ATTACH',
          stickerNumber: registered.legacyBarcode,
          feeTypeCode: 'STICKER_REATTACHMENT',
        });
        const event = await prisma.auditEvent.findFirstOrThrow({
          where: { action: 'sticker.attach_reading', subjectId: registered.id },
        });
        expect(event.afterValue).toEqual({
          outcome: 'CAN_ATTACH',
          vehicleId: vehicle.id,
        });
      });

      it('changes nothing', async () => {
        const code = barcode();
        const added = await addToStock(code);
        const vehicle = await declareVehicle('RD3');
        const before = await prisma.sticker.findUniqueOrThrow({
          where: { id: added.body.sticker.id },
        });

        await reading(vehicle.id, code);

        expect(
          await prisma.sticker.findUniqueOrThrow({
            where: { id: added.body.sticker.id },
          }),
        ).toEqual(before);
      });

      it('answers 404 for a vehicle outside the caller\'s scope, and 403 without sticker.attach', async () => {
        const outside = await declareVehicle('RD4', {
          branchId: fixture.otherBranchId,
        });
        expect((await reading(outside.id, barcode())).status).toBe(404);

        const inside = await declareVehicle('RD5');
        expect((await reading(inside.id, barcode(), 'bystander')).status).toBe(
          403,
        );
      });
    });

    describe('withdrawing', () => {
      async function withdraw(id: string, body: Record<string, string>, who = 'stocker') {
        return request(server)
          .post(`/api/v1/stickers/stock/${id}/withdrawal`)
          .set('Cookie', cookies[who]!)
          .send(body);
      }

      it('takes a sticker out of stock for a reason, for good', async () => {
        const code = barcode();
        const added = await addToStock(code);
        const id = added.body.sticker.id as string;

        const response = await withdraw(id, { reason: 'e2e: torn in the box' });

        expect(response.status).toBe(200);
        expect(response.body.sticker).toMatchObject({ id, standing: 'WITHDRAWN' });
        const event = await prisma.auditEvent.findFirstOrThrow({
          where: { action: 'sticker.stock_withdraw', subjectId: id },
        });
        expect(event.reason).toBe('e2e: torn in the box');
        expect(event.beforeValue).toEqual({ status: 'ISSUED' });
        expect(event.afterValue).toEqual({ status: 'CANCELLED' });

        // It can never be attached.
        const vehicle = await declareVehicle('WD1');
        expect((await reading(vehicle.id, code)).body.reading).toEqual({
          result: 'NOT_AVAILABLE',
        });
        const payment = await confirmedPayment(vehicle.id, 'STICKER_NEW');
        await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          .send({ legacyBarcode: code, vehicleId: vehicle.id, paymentId: payment.id })
          .expect(409);
        expect(await refusalReason(id)).toBe('STICKER_NOT_AVAILABLE');

        // Its barcode cannot be added again, and it cannot be withdrawn twice.
        expect((await addToStock(code)).body).toMatchObject({
          outcome: 'ALREADY_HELD',
          held: 'WITHDRAWN',
        });
        expect((await withdraw(id, { reason: 'e2e: again' })).status).toBe(409);
        // Nothing was deleted.
        expect(
          await prisma.sticker.count({ where: { legacyBarcode: code } }),
        ).toBe(1);
      });

      it('needs a reason', async () => {
        const added = await addToStock(barcode());

        const response = await withdraw(added.body.sticker.id, { reason: ' ' });

        expect(response.status).toBe(400);
        expect(response.body.error.details).toEqual([
          expect.objectContaining({ field: 'reason' }),
        ]);
      });

      it('refuses a sticker already on a vehicle', async () => {
        const code = barcode();
        const added = await addToStock(code);
        const vehicle = await declareVehicle('WD2');
        const payment = await confirmedPayment(vehicle.id, 'STICKER_NEW');
        await request(server)
          .post('/api/v1/stickers/attach')
          .set('Cookie', cookies.attacher!)
          .send({ legacyBarcode: code, vehicleId: vehicle.id, paymentId: payment.id })
          .expect(201);

        expect(
          (await withdraw(added.body.sticker.id, { reason: 'e2e: too late' }))
            .status,
        ).toBe(409);
      });

      it('answers 404 for a sticker that was never in stock, and 403 without the permission', async () => {
        const registered = await registerBarcode('withdraw-register', 'E2ESTKWDR1');
        expect(
          (await withdraw(registered.id, { reason: 'e2e: not stock' })).status,
        ).toBe(404);

        const added = await addToStock(barcode());
        expect(
          (await withdraw(added.body.sticker.id, { reason: 'e2e: no' }, 'attacher'))
            .status,
        ).toBe(403);
      });
    });

    it('reads as in stock to an officer who looks it up, with no plate', async () => {
      const code = barcode();
      await addToStock(code);

      const response = await request(server)
        .post('/api/v1/stickers/legacy-lookup')
        .set('Cookie', cookies.verifier!)
        .send({ barcode: scanned(code) })
        .expect(200);

      expect(response.body.reading).toEqual({
        result: 'IN_STOCK',
        message: 'Recognised sticker — in stock, not attached',
      });
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

    // Letters first: they reference both the vehicle and the sticker.
    await prisma.vehicleLetter.deleteMany({
      where: {
        OR: [
          { vehicleId: { in: vehicleIds } },
          { sticker: { stickerQrId: { contains: TAG } } },
          { sticker: { issuedByUserId: { in: userIds } } },
          { sticker: { stockAddedByUserId: { in: userIds } } },
        ],
      },
    });
    await prisma.sticker.deleteMany({
      where: {
        OR: [
          { vehicleId: { in: vehicleIds } },
          { stickerQrId: { contains: TAG } },
          // Issued by a fixture user and left unattached by a refusal test.
          { issuedByUserId: { in: userIds } },
          // Taken into stock by one.
          { stockAddedByUserId: { in: userIds } },
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

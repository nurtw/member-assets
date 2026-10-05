import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { isPayLinkCode } from '@nurtw/domain';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { DuesService } from './../src/payments/dues.service.js';
import {
  PAY_LINK_PAYMENTS_PER_HOUR,
  PAY_LINK_VIEWS_PER_MINUTE,
} from './../src/payments/pay-link.service.js';
import { PaymentsService } from './../src/payments/payments.service.js';
import { SettlementService } from './../src/payments/settlement.service.js';
import { SettingsService } from './../src/settings/settings.service.js';

/**
 * Personal pay links, end to end (PRD Requirement 27.8, revision 1.9;
 * `QUESTIONS.md` PAY-21; `plans/31-pay-now.md`).
 *
 * Paystack is never called: `global.fetch` is stubbed. The settlement account
 * is a single shared row the payments suite saves alongside this one, so
 * `SettlementService.getActive` is stubbed here, as the dedicated-account
 * suite does. The limits are settings for the whole database, so this suite
 * switches them by spying on `SettingsService` for its own app.
 *
 * What carries weight: the public page answers the same for a vehicle that
 * owes and one that is paid up, and reads no dues to do it; a link is given
 * only within the officer's scope; a replaced link stops at once and is kept;
 * a payment from a link records no officer and is credited like any other;
 * the return address cannot leave the web application; and the public routes
 * are limited per address.
 */

// Paystack returns the payer to the web application; this is its origin here.
const WEB_ORIGIN = 'https://portal.pay-links.nurtw.test';
process.env.CORS_ORIGINS = WEB_ORIGIN;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-paylinks';
const PASSWORD = 'e2e-fixture-password-1';
const SUBACCOUNT = `ACCT_${TAG}`;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Words a public answer must never carry: each would say what is owed or paid. */
const DUES_WORDS =
  /owed|owing|arrears|outstanding|paid|unpaid|overdue|credit|covered|balance|status/i;

/** Noon in Lagos on the 15th, `monthsAgo` calendar months back. */
function midMonth(monthsAgo: number): Date {
  const lagosNow = new Date(Date.now() + LAGOS_OFFSET_MS);
  return new Date(
    Date.UTC(
      lagosNow.getUTCFullYear(),
      lagosNow.getUTCMonth() - monthsAgo,
      15,
      12,
    ) - LAGOS_OFFSET_MS,
  );
}

interface FetchCall {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('Pay links (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let dues: DuesService;
  let branchId: string;
  let otherBranchId: string;
  let routeTypeId: string;
  let owingVehicleId: string;
  let paidVehicleId: string;
  let memberId: string;
  let settlementStub: { id: string; subaccountCode: string } | null = null;
  const limits: Record<string, number> = {};
  const cookies: Record<string, string> = {};
  const fetchCalls: FetchCall[] = [];
  const verifiedAmounts = new Map<string, number>();

  beforeAll(async () => {
    await cleanUp();

    const council = await prisma.organisation.create({
      data: { name: `Council ${TAG}`, level: 'COUNCIL', path: 'placeholder' },
    });
    await prisma.organisation.update({
      where: { id: council.id },
      data: { path: `/${council.id}/` },
    });
    const branches: string[] = [];
    for (const name of ['Branch', 'Other branch']) {
      const branch = await prisma.organisation.create({
        data: {
          name: `${name} ${TAG}`,
          level: 'BRANCH',
          parentId: council.id,
          path: `/${council.id}/placeholder-${name}`,
        },
      });
      await prisma.organisation.update({
        where: { id: branch.id },
        data: { path: `/${council.id}/${branch.id}/` },
      });
      branches.push(branch.id);
    }
    [branchId, otherBranchId] = branches as [string, string];
    routeTypeId = (
      await prisma.routeType.findUniqueOrThrow({ where: { code: 'INTERCITY' } })
    ).id;

    await buildUser(
      'officer',
      ['payment.initiate', 'payment.read', 'vehicle.read'],
      branchId,
    );
    await buildUser('reader', ['payment.read', 'vehicle.read'], branchId);
    await buildUser('outsider', ['payment.initiate'], otherBranchId);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body
          ? (JSON.parse(init.body as string) as Record<string, unknown>)
          : undefined;
        fetchCalls.push({ url, method, body });

        if (url.includes('/transaction/initialize')) {
          return jsonResponse({
            status: true,
            message: 'ok',
            data: {
              authorization_url: `https://paystack.test/pay/${String(body?.reference)}`,
              access_code: 'mock_access_code',
              reference: body?.reference,
            },
          });
        }
        if (url.includes('/transaction/verify/')) {
          const reference = decodeURIComponent(url.split('/').pop()!);
          return jsonResponse({
            status: true,
            message: 'ok',
            data: {
              status: 'success',
              amount: verifiedAmounts.get(reference) ?? 0,
              currency: 'NGN',
              reference,
              fees: 1500,
            },
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
    dues = app.get(DuesService);

    settlementStub = { id: randomUUID(), subaccountCode: SUBACCOUNT };
    vi.spyOn(app.get(SettlementService), 'getActive').mockImplementation(
      async () => settlementStub as never,
    );
    // Generous unless a test says otherwise, so the suite's own traffic never
    // trips a limit it is not testing.
    const settings = app.get(SettingsService);
    const real = settings.getPositiveInteger.bind(settings);
    vi.spyOn(settings, 'getPositiveInteger').mockImplementation(
      async (key, fallback) =>
        key === PAY_LINK_VIEWS_PER_MINUTE || key === PAY_LINK_PAYMENTS_PER_HOUR
          ? (limits[key] ?? 10_000)
          : real(key, fallback),
    );

    for (const who of ['officer', 'reader', 'outsider']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }

    // Two vehicles onboarded three months ago: one has paid nothing, the other
    // is paid up. What the Union knows about them differs; what the public
    // page says about them must not.
    owingVehicleId = (await vehicle(3)).id;
    paidVehicleId = (await vehicle(3)).id;
    const owed = await dues.vehicleDues(paidVehicleId);
    await confirmedLevy(paidVehicleId, owed.outstandingKobo);

    memberId = (
      await prisma.member.create({
        data: {
          surname: 'Fixture',
          firstName: 'Paylink',
          organisationId: branchId,
          status: 'ACTIVE',
          membershipNumber: `${TAG}-0001`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- The officer's side ---------------------------------------------------------

  describe('getting a pay link', () => {
    it('makes one for a vehicle, named by its plate, and audits it', async () => {
      const response = await linkFor('vehicle', owingVehicleId);
      expect(response.status).toBe(200);
      expect(isPayLinkCode(response.body.code)).toBe(true);
      expect(response.body).toMatchObject({
        subjectType: 'vehicle',
        subjectId: owingVehicleId,
        label: 'E2EPAY-1',
      });

      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'pay_link.create', subjectId: owingVehicleId },
      });
      expect(audit?.afterValue).toEqual({ payLinkId: response.body.id });
      // The code opens the page to anyone, so it stays out of the audit trail.
      expect(JSON.stringify(audit)).not.toContain(response.body.code);
    });

    it('answers the same link when asked again', async () => {
      const first = await linkFor('vehicle', owingVehicleId);
      const second = await linkFor('vehicle', owingVehicleId);
      expect(second.body.code).toBe(first.body.code);
      expect(
        await prisma.payLink.count({ where: { subjectId: owingVehicleId } }),
      ).toBe(1);
    });

    it('names a member by first name and membership number, nothing more', async () => {
      const response = await linkFor('member', memberId);
      expect(response.status).toBe(200);
      expect(response.body.label).toBe(`Paylink · ${TAG}-0001`);
      expect(response.body.label).not.toContain('Fixture');
    });

    it('answers 404 outside the officer’s scope, as for no such subject', async () => {
      const outside = await linkFor('vehicle', owingVehicleId, 'outsider');
      const missing = await linkFor('vehicle', randomUUID());
      expect(outside.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(outside.body.error.code).toBe(missing.body.error.code);
    });

    it('needs payment.initiate', async () => {
      expect((await linkFor('vehicle', owingVehicleId, 'reader')).status).toBe(
        403,
      );
      await request(server)
        .post('/api/v1/pay-links')
        .send({ subjectType: 'vehicle', subjectId: owingVehicleId })
        .expect(401);
    });
  });

  describe('replacing a pay link', () => {
    it('needs a reason', async () => {
      const link = (await linkFor('member', memberId)).body;
      await request(server)
        .post(`/api/v1/pay-links/${link.id}/replace`)
        .set('Cookie', cookies.officer!)
        .send({ reason: ' ' })
        .expect(400);
    });

    it('stops the old link at once, and keeps it with who and why', async () => {
      const old = (await linkFor('member', memberId)).body;
      await request(server).get(`/api/v1/pay/${old.code}`).expect(200);

      const replaced = await request(server)
        .post(`/api/v1/pay-links/${old.id}/replace`)
        .set('Cookie', cookies.officer!)
        .send({ reason: 'Sent to the wrong number' })
        .expect(200);
      expect(replaced.body.code).not.toBe(old.code);
      expect(replaced.body.id).not.toBe(old.id);

      await request(server).get(`/api/v1/pay/${old.code}`).expect(404);
      await request(server)
        .get(`/api/v1/pay/${replaced.body.code}`)
        .expect(200);

      const kept = await prisma.payLink.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(kept.revokedAt).not.toBeNull();
      expect(kept.revokeReason).toBe('Sent to the wrong number');
      expect(kept.revokedByUserId).not.toBeNull();
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'pay_link.replace', subjectId: memberId },
      });
      expect(audit?.reason).toBe('Sent to the wrong number');
      expect(audit?.beforeValue).toEqual({ payLinkId: old.id });
      expect(audit?.afterValue).toEqual({ payLinkId: replaced.body.id });
    });

    it('cannot be done from outside the scope, or to a replaced link', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      await request(server)
        .post(`/api/v1/pay-links/${link.id}/replace`)
        .set('Cookie', cookies.outsider!)
        .send({ reason: 'Not mine to replace' })
        .expect(404);

      const revoked = await prisma.payLink.findFirstOrThrow({
        where: { subjectId: memberId, revokedAt: { not: null } },
      });
      await request(server)
        .post(`/api/v1/pay-links/${revoked.id}/replace`)
        .set('Cookie', cookies.officer!)
        .send({ reason: 'Already replaced' })
        .expect(404);
    });
  });

  // --- The public side ------------------------------------------------------------

  describe('the public pay page', () => {
    it('offers a vehicle its levy at the published amount, with the fee on top', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      const response = await request(server)
        .get(`/api/v1/pay/${link.code}`)
        .expect(200);

      expect(response.body.subjectType).toBe('vehicle');
      expect(response.body.label).toBe('E2EPAY-1');
      expect(response.body.open).toBe(true);
      expect(response.body.options).toHaveLength(1);
      const [levy] = response.body.options;
      const owing = await dues.vehicleDues(owingVehicleId);
      expect(levy.feeTypeCode).toBe('LEVY');
      expect(levy.dueKobo).toBe(owing.currentAmountKobo);
      expect(levy.totalKobo).toBe(levy.dueKobo + levy.feeKobo);
      expect(levy.feeKobo).toBeGreaterThan(0);
      // The identifiers stay inside: the code is all the page needs.
      expect(JSON.stringify(response.body)).not.toContain(owingVehicleId);
    });

    it('offers a member the yearly fee', async () => {
      const link = (await linkFor('member', memberId)).body;
      const response = await request(server)
        .get(`/api/v1/pay/${link.code}`)
        .expect(200);
      expect(
        response.body.options.map(
          (option: { feeTypeCode: string }) => option.feeTypeCode,
        ),
      ).toEqual(['MEMBERSHIP']);
    });

    it('answers the same for a vehicle that owes and one that is paid up', async () => {
      const [owing, paid] = await Promise.all([
        dues.vehicleDues(owingVehicleId),
        dues.vehicleDues(paidVehicleId),
      ]);
      // The Union's own view of the two differs…
      expect(owing.status).toBe('IN_ARREARS');
      expect(paid.status).toBe('PAID');

      const read = [
        vi.spyOn(dues, 'vehicleDues'),
        vi.spyOn(dues, 'memberDues'),
      ];
      const owingLink = (await linkFor('vehicle', owingVehicleId)).body;
      const paidLink = (await linkFor('vehicle', paidVehicleId)).body;
      const owingPage = await request(server)
        .get(`/api/v1/pay/${owingLink.code}`)
        .expect(200);
      const paidPage = await request(server)
        .get(`/api/v1/pay/${paidLink.code}`)
        .expect(200);

      // …and the public page's does not, beyond the plate.
      expect({ ...owingPage.body, label: null }).toEqual({
        ...paidPage.body,
        label: null,
      });
      for (const page of [owingPage, paidPage]) {
        expect(JSON.stringify(page.body.options)).not.toMatch(DUES_WORDS);
        expect(Object.keys(page.body).join(' ')).not.toMatch(DUES_WORDS);
      }
      // It never read the dues to begin with.
      for (const spy of read) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    });

    it('answers one generic 404 for a malformed, unknown, or replaced code', async () => {
      const replaced = await prisma.payLink.findFirstOrThrow({
        where: { subjectId: memberId, revokedAt: { not: null } },
      });
      const answers = await Promise.all(
        [
          'not-a-code',
          randomUUID().replace(/-/g, '').slice(0, 22),
          replaced.code,
        ].map((code) => request(server).get(`/api/v1/pay/${code}`)),
      );
      for (const answer of answers) {
        expect(answer.status).toBe(404);
        expect({ ...answer.body.error, requestId: null }).toEqual({
          ...answers[0]!.body.error,
          requestId: null,
        });
      }
    });

    it('says payments are not open while there is no settlement account', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      const before = settlementStub;
      settlementStub = null;
      try {
        const page = await request(server)
          .get(`/api/v1/pay/${link.code}`)
          .expect(200);
        expect(page.body.open).toBe(false);
        await request(server)
          .post(`/api/v1/pay/${link.code}`)
          .send({ feeTypeCode: 'LEVY', payerEmail: 'driver@example.test' })
          .expect(400);
      } finally {
        settlementStub = before;
      }
    });
  });

  describe('paying from a link', () => {
    it('starts a Paystack payment with no officer recorded', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      const response = await request(server)
        .post(`/api/v1/pay/${link.code}`)
        .send({
          feeTypeCode: 'LEVY',
          payerEmail: 'driver@example.test',
          returnUrl: `${WEB_ORIGIN}/pay/${link.code}?paid=1`,
        })
        .expect(200);
      expect(Object.keys(response.body)).toEqual(['authorizationUrl']);

      const call = fetchCalls
        .filter((c) => c.url.includes('/transaction/initialize'))
        .pop();
      expect(call?.body?.email).toBe('driver@example.test');
      expect(call?.body?.subaccount).toBe(SUBACCOUNT);
      expect(call?.body?.callback_url).toBe(
        `${WEB_ORIGIN}/pay/${link.code}?paid=1`,
      );

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { paystackReference: String(call?.body?.reference) },
      });
      expect(payment).toMatchObject({
        subjectType: 'vehicle',
        subjectId: owingVehicleId,
        channel: 'LINK',
        status: 'PENDING',
        initiatedByUserId: null,
      });
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'payment.initiate', subjectId: payment.id },
      });
      expect(audit?.actorUserId).toBeNull();
      expect(audit?.afterValue).toMatchObject({ payLinkId: link.id });
    });

    it('is confirmed and credited like any other payment', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      const before = await dues.vehicleDues(owingVehicleId);
      await request(server)
        .post(`/api/v1/pay/${link.code}`)
        .send({ feeTypeCode: 'LEVY', payerEmail: 'driver@example.test' })
        .expect(200);
      const reference = String(
        fetchCalls
          .filter((c) => c.url.includes('/transaction/initialize'))
          .pop()?.body?.reference,
      );
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { paystackReference: reference },
      });
      verifiedAmounts.set(reference, payment.totalChargedKobo);
      await app.get(PaymentsService).confirm(reference);

      const after = await dues.vehicleDues(owingVehicleId);
      expect(after.outstandingKobo).toBe(
        before.outstandingKobo - payment.dueKobo,
      );
    });

    it('refuses a fee the link does not offer, and starts nothing', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      const before = await prisma.payment.count({
        where: { subjectId: owingVehicleId },
      });
      for (const feeTypeCode of [
        'MEMBERSHIP',
        'STICKER_NEW',
        'STICKER_REATTACHMENT',
      ]) {
        const response = await request(server)
          .post(`/api/v1/pay/${link.code}`)
          .send({ feeTypeCode, payerEmail: 'driver@example.test' })
          .expect(400);
        expect(response.body.error.details[0].field).toBe('feeTypeCode');
      }
      expect(
        await prisma.payment.count({ where: { subjectId: owingVehicleId } }),
      ).toBe(before);
    });

    it('refuses a return address outside the web application', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      const response = await request(server)
        .post(`/api/v1/pay/${link.code}`)
        .send({
          feeTypeCode: 'LEVY',
          payerEmail: 'driver@example.test',
          returnUrl: 'https://elsewhere.example/thanks',
        })
        .expect(400);
      expect(response.body.error.details[0].field).toBe('returnUrl');
    });

    it('needs an email, and a known link', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      await request(server)
        .post(`/api/v1/pay/${link.code}`)
        .send({ feeTypeCode: 'LEVY', payerEmail: 'not an email' })
        .expect(400);
      await request(server)
        .post('/api/v1/pay/not-a-code')
        .send({ feeTypeCode: 'LEVY', payerEmail: 'driver@example.test' })
        .expect(404);
    });
  });

  describe('the limits, per address', () => {
    afterEach(() => {
      delete limits[PAY_LINK_VIEWS_PER_MINUTE];
      delete limits[PAY_LINK_PAYMENTS_PER_HOUR];
    });

    it('stop one address opening pay links without end', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      await prisma.publicRateCounter.deleteMany({
        where: { key: { startsWith: 'pay:' } },
      });
      limits[PAY_LINK_VIEWS_PER_MINUTE] = 2;

      await request(server).get(`/api/v1/pay/${link.code}`).expect(200);
      await request(server).get(`/api/v1/pay/${link.code}`).expect(200);
      const refused = await request(server)
        .get(`/api/v1/pay/${link.code}`)
        .expect(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      // Refused before the code is looked at, so a limit cannot be used to test codes.
      await request(server).get('/api/v1/pay/not-a-code').expect(429);
    });

    it('stop one address starting payments without end', async () => {
      const link = (await linkFor('vehicle', owingVehicleId)).body;
      await prisma.publicRateCounter.deleteMany({
        where: { key: { startsWith: 'pay:' } },
      });
      limits[PAY_LINK_PAYMENTS_PER_HOUR] = 1;
      const pay = () =>
        request(server)
          .post(`/api/v1/pay/${link.code}`)
          .send({ feeTypeCode: 'LEVY', payerEmail: 'driver@example.test' });

      expect((await pay()).status).toBe(200);
      const before = await prisma.payment.count({
        where: { subjectId: owingVehicleId },
      });
      const refused = await pay();
      expect(refused.status).toBe(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(
        await prisma.payment.count({ where: { subjectId: owingVehicleId } }),
      ).toBe(before);
    });
  });

  // --- Helpers --------------------------------------------------------------------

  function linkFor(
    subjectType: 'vehicle' | 'member',
    subjectId: string,
    who: 'officer' | 'reader' | 'outsider' = 'officer',
  ) {
    return request(server)
      .post('/api/v1/pay-links')
      .set('Cookie', cookies[who]!)
      .send({ subjectType, subjectId });
  }

  let plates = 0;
  /** A vehicle onboarded `onboardedMonthsAgo` months back, so its levy has fallen due. */
  async function vehicle(onboardedMonthsAgo: number) {
    plates += 1;
    const created = await prisma.vehicle.create({
      data: {
        plateNumberDisplay: `E2EPAY-${plates}`,
        plateNumberNormalized: `E2EPAY${plates}`,
        branchId,
        status: 'ON_RECORD',
        declaredAt: null,
        routeTypeId,
      },
    });
    await prisma.sticker.create({
      data: {
        stickerQrId: `${TAG}-${plates}`,
        templateVersion: 'v1',
        status: 'ACTIVE',
        vehicleId: created.id,
        plateNumberAtIssue: created.plateNumberNormalized,
        attachedAt: midMonth(onboardedMonthsAgo),
      },
    });
    return created;
  }

  /** A levy payment confirmed today, as the ledger records one. */
  async function confirmedLevy(vehicleId: string, amountKobo: number) {
    const levy = await prisma.feeType.findUniqueOrThrow({
      where: { code: 'LEVY' },
    });
    await prisma.payment.create({
      data: {
        feeTypeId: levy.id,
        subjectType: 'vehicle',
        subjectId: vehicleId,
        dueKobo: amountKobo,
        contractorFeeKobo: 0,
        totalChargedKobo: amountKobo,
        channel: 'LINK',
        status: 'CONFIRMED',
        paystackReference: `${TAG}-${randomUUID()}`,
        confirmedAt: new Date(),
        ledgerEntries: {
          create: {
            direction: 'CREDIT',
            amountKobo,
            description: 'Due settled',
          },
        },
      },
    });
  }

  function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function buildUser(
    who: string,
    permissions: readonly string[],
    organisationId: string,
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
    const subjectIds = [
      ...(await prisma.vehicle.findMany({
        where: { branchId: { in: orgIds } },
        select: { id: true },
      })),
      ...(await prisma.member.findMany({
        where: { organisationId: { in: orgIds } },
        select: { id: true },
      })),
    ].map((row) => row.id);
    // A payment started from a link carries Paystack's own kind of reference
    // and no officer, so these are found by what they were paid for.
    const payments = await prisma.payment.findMany({
      where: { subjectId: { in: subjectIds } },
      select: { id: true },
    });
    const paymentIds = payments.map((payment) => payment.id);

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { subjectId: { in: [...subjectIds, ...paymentIds] } },
        ],
      },
    });
    await prisma.ledgerEntry.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.payLink.deleteMany({
      where: { subjectId: { in: subjectIds } },
    });
    await prisma.publicRateCounter.deleteMany({
      where: { key: { startsWith: 'pay:' } },
    });
    await prisma.sticker.deleteMany({
      where: { stickerQrId: { contains: TAG } },
    });
    await prisma.vehicle.deleteMany({ where: { branchId: { in: orgIds } } });
    await prisma.member.deleteMany({
      where: { organisationId: { in: orgIds } },
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

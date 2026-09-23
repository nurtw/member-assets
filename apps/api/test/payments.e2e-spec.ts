import { createHmac } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';

/**
 * Payments, end to end (PRD §27, `plans/16-payments.md`).
 *
 * Paystack itself is never called: `global.fetch` is stubbed so these tests
 * are fast and deterministic, but the HMAC signature check on the webhook
 * runs for real, against the real `PAYSTACK_SECRET_KEY` from `.env` — that
 * is the one control PRD Requirement 27.5 actually depends on, and it must
 * not be mocked away.
 *
 * The assertions that carry weight: the processing fee is computed and
 * charged, not merely the due; a placeholder fee type can never be charged
 * live; an invalid webhook signature is refused before any database access;
 * confirmation always re-verifies with Paystack rather than trusting the
 * webhook payload; and a second settlement-account save updates the same
 * subaccount rather than minting a new one.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-payments';
const PASSWORD = 'e2e-fixture-password-1';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  throw new Error(
    'PAYSTACK_SECRET_KEY must be set in apps/api/.env to run this suite.',
  );
}

function signWebhook(rawBody: string): string {
  return createHmac('sha512', PAYSTACK_SECRET_KEY!).update(rawBody).digest('hex');
}

interface FetchCall {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let orgId: string;
  const cookies: Record<string, string> = {};
  const fetchCalls: FetchCall[] = [];
  let verifyAmountKobo = 0;
  let verifyStatus = 'success';

  beforeAll(async () => {
    await cleanUp();

    const council = await prisma.organisation.create({
      data: { name: `Council ${TAG}`, level: 'COUNCIL', path: 'placeholder' },
    });
    await prisma.organisation.update({
      where: { id: council.id },
      data: { path: `/${council.id}/` },
    });
    orgId = council.id;

    await buildUser('payer', ['payment.initiate', 'payment.read']);
    await buildUser('settler', ['payment.manage_settlement']);
    await buildUser('bystander', ['payment.read']);

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
              authorization_url: 'https://paystack.test/pay/mock',
              access_code: 'mock_access_code',
              reference: body?.reference,
            },
          });
        }
        if (url.includes('/transaction/verify/')) {
          return jsonResponse({
            status: true,
            message: 'ok',
            data: {
              status: verifyStatus,
              amount: verifyAmountKobo,
              currency: 'NGN',
              reference: decodeURIComponent(url.split('/').pop()!),
              fees: 1500,
            },
          });
        }
        if (url.includes('/bank/resolve')) {
          return jsonResponse({
            status: true,
            message: 'ok',
            data: { account_name: 'NURTW ANAMBRA TEST ACCOUNT' },
          });
        }
        if (url.includes('/subaccount') && method === 'POST') {
          return jsonResponse({
            status: true,
            message: 'ok',
            data: { subaccount_code: 'ACCT_e2e_mock' },
          });
        }
        if (url.includes('/subaccount/') && method === 'PUT') {
          return jsonResponse({ status: true, message: 'ok', data: {} });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // `rawBody: true` mirrors main.ts — without it `request.rawBody` is
    // undefined and the webhook signature check cannot run at all.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    for (const who of ['payer', 'settler', 'bystander']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  describe('initiating a payment', () => {
    it('charges the due plus the processing fee, not the due alone', async () => {
      const response = await request(server)
        .post('/api/v1/payments/initiate')
        .set('Cookie', cookies.payer!)
        .send({
          feeTypeCode: 'STICKER_NEW',
          subjectType: 'vehicle',
          subjectId: crypto.randomUUID(),
          payerEmail: 'owner@nurtw.test',
        })
        .expect(201);

      expect(response.body.dueKobo).toBe(200_000);
      expect(response.body.totalChargedKobo).toBeGreaterThan(
        response.body.dueKobo,
      );
      expect(response.body.contractorFeeKobo).toBeGreaterThan(0);
      expect(response.body.authorizationUrl).toBe(
        'https://paystack.test/pay/mock',
      );

      // A sticker fee is CONTRACTOR_ONLY (Requirement 27.4): no subaccount,
      // no transaction_charge split.
      const call = fetchCalls.find((c) => c.url.includes('/transaction/initialize'));
      expect(call?.body?.subaccount).toBeUndefined();
      expect(call?.body?.transaction_charge).toBeUndefined();
    });

    it('refuses a caller without payment.initiate', async () => {
      await request(server)
        .post('/api/v1/payments/initiate')
        .set('Cookie', cookies.bystander!)
        .send({
          feeTypeCode: 'STICKER_NEW',
          subjectType: 'vehicle',
          subjectId: crypto.randomUUID(),
          payerEmail: 'owner@nurtw.test',
        })
        .expect(403);
    });

    it('refuses a fee type marked as a placeholder (Requirement 27.2)', async () => {
      await prisma.feeType.create({
        data: {
          code: `${TAG}-PLACEHOLDER`,
          label: 'Placeholder fixture',
          amountKobo: 100_000,
          recurrence: 'ONE_OFF',
          chargedAgainst: 'VEHICLE',
          settlement: 'CONTRACTOR_ONLY',
          isPlaceholder: true,
        },
      });

      await request(server)
        .post('/api/v1/payments/initiate')
        .set('Cookie', cookies.payer!)
        .send({
          feeTypeCode: `${TAG}-PLACEHOLDER`,
          subjectType: 'vehicle',
          subjectId: crypto.randomUUID(),
          payerEmail: 'owner@nurtw.test',
        })
        .expect(400);
    });

    it('splits a NURTW due once the settlement account exists', async () => {
      await request(server)
        .post('/api/v1/payments/settlement')
        .set('Cookie', cookies.settler!)
        .send({
          bankCode: '058',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          password: PASSWORD,
          reason: 'e2e fixture',
        })
        .expect(201);

      const response = await request(server)
        .post('/api/v1/payments/initiate')
        .set('Cookie', cookies.payer!)
        .send({
          feeTypeCode: 'LEVY',
          subjectType: 'vehicle',
          subjectId: crypto.randomUUID(),
          payerEmail: 'owner@nurtw.test',
        })
        .expect(201);

      const call = fetchCalls
        .filter((c) => c.url.includes('/transaction/initialize'))
        .pop();
      expect(call?.body?.subaccount).toBe('ACCT_e2e_mock');
      expect(call?.body?.bearer).toBe('account');
      // The subaccount receives exactly the due; the main account keeps
      // the rest (Requirement 27.4).
      expect(call?.body?.transaction_charge).toBe(
        response.body.totalChargedKobo - response.body.dueKobo,
      );
    });
  });

  describe('the settlement account', () => {
    it('updates the SAME subaccount on a second save, never a second one', async () => {
      await request(server)
        .post('/api/v1/payments/settlement')
        .set('Cookie', cookies.settler!)
        .send({
          bankCode: '058',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          password: PASSWORD,
          reason: 'e2e fixture: first save',
        })
        .expect(201);

      const createCalls = fetchCalls.filter(
        (c) => c.url.endsWith('/subaccount') && c.method === 'POST',
      );

      await request(server)
        .post('/api/v1/payments/settlement')
        .set('Cookie', cookies.settler!)
        .send({
          bankCode: '011',
          bankName: 'First Bank',
          accountNumber: '9876543210',
          password: PASSWORD,
          reason: 'e2e fixture: change bank',
        })
        .expect(201);

      const createCallsAfter = fetchCalls.filter(
        (c) => c.url.endsWith('/subaccount') && c.method === 'POST',
      );
      const updateCalls = fetchCalls.filter(
        (c) => c.url.includes('/subaccount/') && c.method === 'PUT',
      );

      // No new subaccount was created on the second save.
      expect(createCallsAfter.length).toBe(createCalls.length);
      expect(updateCalls.length).toBeGreaterThan(0);

      const account = await prisma.settlementAccount.findFirst({
        where: { isActive: true },
      });
      expect(account?.subaccountCode).toBe('ACCT_e2e_mock');
      expect(account?.bankCode).toBe('011');
    });

    it('refuses a wrong password and audits the failed attempt', async () => {
      await request(server)
        .post('/api/v1/payments/settlement')
        .set('Cookie', cookies.settler!)
        .send({
          bankCode: '058',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          password: 'definitely-wrong',
          reason: 'e2e fixture: should fail',
        })
        .expect(400);

      const failure = await prisma.auditEvent.findFirst({
        where: {
          action: 'payment.settlement.update',
          reason: 'e2e fixture: should fail',
        },
      });
      expect(failure).toBeTruthy();
      expect(
        (failure?.afterValue as Record<string, unknown> | null)?.outcome,
      ).toBe('REJECTED_WRONG_PASSWORD');
    });

    it('refuses a caller without payment.manage_settlement', async () => {
      await request(server)
        .post('/api/v1/payments/settlement')
        .set('Cookie', cookies.payer!)
        .send({
          bankCode: '058',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          password: PASSWORD,
          reason: 'e2e fixture',
        })
        .expect(403);
    });
  });

  describe('the webhook', () => {
    it('refuses a payload with no signature, before touching the database', async () => {
      await request(server)
        .post('/api/v1/payments/webhook')
        .send({ event: 'charge.success', data: { reference: 'nonexistent' } })
        .expect(401);
    });

    it('refuses a payload with an invalid signature', async () => {
      await request(server)
        .post('/api/v1/payments/webhook')
        .set('x-paystack-signature', 'not-the-right-signature')
        .send({ event: 'charge.success', data: { reference: 'nonexistent' } })
        .expect(401);
    });

    it('confirms a payment on a validly signed event, but only after re-verifying with Paystack', async () => {
      const initiated = await request(server)
        .post('/api/v1/payments/initiate')
        .set('Cookie', cookies.payer!)
        .send({
          feeTypeCode: 'STICKER_NEW',
          subjectType: 'vehicle',
          subjectId: crypto.randomUUID(),
          payerEmail: 'owner@nurtw.test',
        })
        .expect(201);

      const { reference, totalChargedKobo } = initiated.body;
      verifyAmountKobo = totalChargedKobo;
      verifyStatus = 'success';

      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference },
      });

      await request(server)
        .post('/api/v1/payments/webhook')
        .set('x-paystack-signature', signWebhook(payload))
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(201);

      const payment = await prisma.payment.findUnique({
        where: { paystackReference: reference },
      });
      expect(payment?.status).toBe('CONFIRMED');

      const ledgerEntry = await prisma.ledgerEntry.findFirst({
        where: { paymentId: payment!.id },
      });
      expect(ledgerEntry?.direction).toBe('CREDIT');
      expect(ledgerEntry?.amountKobo).toBe(payment!.dueKobo);
    });

    it('does not confirm when Paystack itself reports the transaction as failed', async () => {
      const initiated = await request(server)
        .post('/api/v1/payments/initiate')
        .set('Cookie', cookies.payer!)
        .send({
          feeTypeCode: 'STICKER_NEW',
          subjectType: 'vehicle',
          subjectId: crypto.randomUUID(),
          payerEmail: 'owner@nurtw.test',
        })
        .expect(201);

      const { reference } = initiated.body;
      verifyStatus = 'failed';

      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference },
      });

      await request(server)
        .post('/api/v1/payments/webhook')
        .set('x-paystack-signature', signWebhook(payload))
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(201);

      const payment = await prisma.payment.findUnique({
        where: { paystackReference: reference },
      });
      expect(payment?.status).toBe('FAILED');
    });
  });

  function jsonResponse(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
          organisationId: orgId,
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

    const payments = await prisma.payment.findMany({
      where: { initiatedByUserId: { in: userIds } },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);

    await prisma.ledgerEntry.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.feeType.deleteMany({ where: { code: { contains: TAG } } });
    await prisma.settlementAccount.deleteMany({
      where: { subaccountCode: 'ACCT_e2e_mock' },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organisation.deleteMany({
      where: { name: { contains: TAG } },
    });
  }
});

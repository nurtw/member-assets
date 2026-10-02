import { createHmac, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { DedicatedAccountService } from './../src/payments/dedicated-account.service.js';
import { SettlementService } from './../src/payments/settlement.service.js';

/**
 * Dedicated accounts, end to end (PRD Requirement 27.7,
 * `plans/23-dedicated-accounts.md`).
 *
 * Paystack is never called: `global.fetch` is stubbed. The webhook's HMAC
 * check runs for real, as in the payments suite, because Requirement 27.5
 * depends on it.
 *
 * The settlement account is a single shared row, and the payments suite runs
 * alongside this one and saves its own. So `SettlementService.getActive` is
 * stubbed here instead of a second active row being written.
 *
 * What carries weight: Paystack is sent only what it requires; a transfer is
 * re-verified and credited with what NURTW received; the credit pays the
 * oldest dues first across the membership fee and the levy; a replay changes
 * nothing; two transfers at once cannot both pay one month; held credit pays
 * the next month once it falls; and the percentage route is guarded and
 * audited.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-dedicated';
const PASSWORD = 'e2e-fixture-password-1';
const PERCENTAGE_KEY = 'payments.dedicated_account.contractor_percentage';
const ORDER_KEY = 'payments.dedicated_account.allocation_order';
const SUBACCOUNT = `ACCT_${TAG}`;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY must be set in apps/api/.env to run this suite.');
}

function signWebhook(rawBody: string): string {
  return createHmac('sha512', PAYSTACK_SECRET_KEY!).update(rawBody).digest('hex');
}

/** Noon in Lagos on the 15th, `monthsAgo` calendar months back. */
function midMonth(monthsAgo: number): Date {
  const lagosNow = new Date(Date.now() + LAGOS_OFFSET_MS);
  return new Date(
    Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth() - monthsAgo, 15, 12) -
      LAGOS_OFFSET_MS,
  );
}

function monthLabel(instant: Date): string {
  const lagos = new Date(instant.getTime() + LAGOS_OFFSET_MS);
  return `${lagos.getUTCFullYear()}-${String(lagos.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface FetchCall {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

/** What the stubbed `GET /transaction/verify/:reference` answers. */
interface VerifiedTransfer {
  status: string;
  amount: number;
  channel: string;
  customerCode: string;
  accountNumber: string;
  subaccountShare?: number;
}

describe('Dedicated accounts (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let dedicated: DedicatedAccountService;
  let branchId: string;
  let otherBranchId: string;
  let routeTypeId: string;
  let settingsBefore: { key: string; value: string }[] = [];
  const cookies: Record<string, string> = {};
  const fetchCalls: FetchCall[] = [];
  const verifications = new Map<string, VerifiedTransfer>();
  let paystackRefuses = false;
  let settlementStub: { id: string; subaccountCode: string } | null = null;
  let opened = 0;

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
    routeTypeId = (await prisma.routeType.findUniqueOrThrow({ where: { code: 'INTERCITY' } }))
      .id;

    // Put both settings back exactly as they were found, afterwards.
    settingsBefore = await prisma.systemSetting.findMany({
      where: { key: { in: [PERCENTAGE_KEY, ORDER_KEY] } },
      select: { key: true, value: true },
    });
    await setSetting(PERCENTAGE_KEY, '1.5');
    await setSetting(ORDER_KEY, 'OLDEST_FIRST');

    await buildUser(
      'officer',
      ['payment.initiate', 'payment.read', 'member.read', 'vehicle.read'],
      branchId,
    );
    await buildUser('reader', ['payment.read'], branchId);
    await buildUser('outsider', ['payment.initiate', 'payment.read'], otherBranchId);
    await buildUser('settler', ['payment.manage_settlement'], branchId);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body
          ? (JSON.parse(init.body as string) as Record<string, unknown>)
          : undefined;
        fetchCalls.push({ url, method, body });

        if (paystackRefuses) {
          return jsonResponse({ status: false, message: 'Refused by the stub' }, 400);
        }
        if (url.endsWith('/customer') && method === 'POST') {
          return jsonResponse({
            status: true,
            message: 'ok',
            data: { customer_code: `CUS_${TAG}_${String(body?.email)}` },
          });
        }
        if (url.endsWith('/dedicated_account') && method === 'POST') {
          opened += 1;
          return jsonResponse({
            status: true,
            message: 'ok',
            data: {
              id: 2_000_000_000 - Math.floor(Math.random() * 1_000_000_000),
              account_number: `99${String(Date.now() % 1e8).padStart(8, '0')}`.slice(0, 10),
              account_name: `NURTW/${String(body?.customer)}`,
              bank: { name: 'Test Bank', id: 1, slug: 'test-bank' },
            },
          });
        }
        if (url.includes('/subaccount/') && method === 'PUT') {
          return jsonResponse({ status: true, message: 'ok', data: {} });
        }
        if (url.includes('/transaction/verify/')) {
          const reference = decodeURIComponent(url.split('/').pop()!);
          const transfer = verifications.get(reference);
          if (!transfer) {
            throw new Error(`No verification fixture for ${reference}`);
          }
          return jsonResponse({
            status: true,
            message: 'ok',
            data: {
              status: transfer.status,
              amount: transfer.amount,
              currency: 'NGN',
              reference,
              fees: 1_000,
              channel: transfer.channel,
              paid_at: new Date().toISOString(),
              customer: { customer_code: transfer.customerCode },
              authorization: { receiver_bank_account_number: transfer.accountNumber },
              fees_split:
                transfer.subaccountShare === undefined
                  ? null
                  : { paystack: 1_000, integration: 0, subaccount: transfer.subaccountShare },
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
    dedicated = app.get(DedicatedAccountService);

    settlementStub = { id: randomUUID(), subaccountCode: SUBACCOUNT };
    vi.spyOn(app.get(SettlementService), 'getActive').mockImplementation(
      async () => settlementStub as never,
    );

    for (const who of ['officer', 'reader', 'outsider', 'settler']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await cleanUp();
    await prisma.systemSetting.deleteMany({ where: { key: { in: [PERCENTAGE_KEY, ORDER_KEY] } } });
    for (const setting of settingsBefore) {
      await prisma.systemSetting.create({ data: setting });
    }
    await app.close();
    await prisma.$disconnect();
  });

  // --- Fixtures -------------------------------------------------------------------

  let members = 0;
  async function member(
    options: { status?: 'ACTIVE' | 'PENDING'; phone?: boolean; approvedMonthsAgo?: number } = {},
  ) {
    members += 1;
    const created = await prisma.member.create({
      data: {
        surname: `Fixture${members}`,
        firstName: 'Dedicated',
        organisationId: branchId,
        status: options.status ?? 'ACTIVE',
        ...(options.phone === false
          ? {}
          : {
              contact: {
                create: { phone: '+2348000000000', residentialAddress: 'Fixture address' },
              },
            }),
      },
    });
    if (options.approvedMonthsAgo !== undefined) {
      await prisma.membershipApplication.create({
        data: {
          applicationNumber: `${TAG}-${randomUUID()}`,
          status: 'APPROVED',
          memberId: created.id,
          reviewedAt: midMonth(options.approvedMonthsAgo),
        },
      });
    }
    return created;
  }

  let plates = 0;
  /** A vehicle driven by `memberId`, onboarded `onboardedMonthsAgo` months back. */
  async function vehicle(memberId: string, onboardedMonthsAgo: number) {
    plates += 1;
    const created = await prisma.vehicle.create({
      data: {
        plateNumberDisplay: `E2EDVA-${plates}`,
        plateNumberNormalized: `E2EDVA${plates}`,
        branchId,
        status: 'ON_RECORD',
        declaredAt: null,
        routeTypeId,
        declaredByMemberId: memberId,
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

  /** A member paid up on membership, by a link payment confirmed today. */
  async function payMembership(memberId: string) {
    const membership = await prisma.feeType.findUniqueOrThrow({ where: { code: 'MEMBERSHIP' } });
    const dues = await memberDues(memberId);
    await prisma.payment.create({
      data: {
        feeTypeId: membership.id,
        subjectType: 'member',
        subjectId: memberId,
        dueKobo: dues.currentAmountKobo,
        contractorFeeKobo: 0,
        totalChargedKobo: dues.currentAmountKobo,
        channel: 'LINK',
        status: 'CONFIRMED',
        paystackReference: `${TAG}-${randomUUID()}`,
        confirmedAt: new Date(),
        ledgerEntries: {
          create: {
            direction: 'CREDIT',
            amountKobo: dues.currentAmountKobo,
            description: 'Due settled',
          },
        },
      },
    });
  }

  async function assign(memberId: string) {
    const response = await request(server)
      .post(`/api/v1/members/${memberId}/dedicated-account`)
      .set('Cookie', cookies.officer!)
      .send({ email: `m${memberId.slice(0, 8)}.${TAG}@nurtw.test` })
      .expect(201);
    return prisma.dedicatedAccount.findFirstOrThrow({
      where: { memberId, active: true },
      select: { paystackCustomerCode: true, accountNumber: true },
    }).then((account) => ({ ...account, response: response.body.dedicatedAccount }));
  }

  /** Paystack's webhook for a transfer into `account`, after setting what verify says. */
  async function transfer(
    account: { paystackCustomerCode: string; accountNumber: string },
    figures: { amount: number; subaccountShare?: number; status?: string },
  ): Promise<string> {
    const reference = `${TAG}-${randomUUID()}`;
    verifications.set(reference, {
      status: figures.status ?? 'success',
      amount: figures.amount,
      channel: 'dedicated_nuban',
      customerCode: account.paystackCustomerCode,
      accountNumber: account.accountNumber,
      subaccountShare: figures.subaccountShare,
    });
    await deliver(reference);
    return reference;
  }

  async function deliver(reference: string) {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { reference, channel: 'dedicated_nuban' },
    });
    await request(server)
      .post('/api/v1/payments/webhook')
      .set('x-paystack-signature', signWebhook(payload))
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);
  }

  async function state(memberId: string, who = 'officer') {
    const response = await request(server)
      .get(`/api/v1/members/${memberId}/dedicated-account`)
      .set('Cookie', cookies[who]!)
      .expect(200);
    return response.body.dedicatedAccount;
  }

  async function memberDues(memberId: string) {
    const response = await request(server)
      .get(`/api/v1/members/${memberId}/dues`)
      .set('Cookie', cookies.officer!)
      .expect(200);
    return response.body.dues;
  }

  async function vehicleDues(vehicleId: string) {
    const response = await request(server)
      .get(`/api/v1/vehicles/${vehicleId}/dues`)
      .set('Cookie', cookies.officer!)
      .expect(200);
    return response.body.dues;
  }

  async function allocations(reference: string) {
    return prisma.payment.findMany({
      where: { dedicatedTransfer: { paystackReference: reference } },
      orderBy: { paystackReference: 'asc' },
      select: {
        subjectType: true,
        subjectId: true,
        dueKobo: true,
        duePeriod: true,
        channel: true,
        status: true,
        feeType: { select: { code: true } },
        ledgerEntries: { select: { direction: true, amountKobo: true } },
      },
    });
  }

  // --- Assigning ------------------------------------------------------------------

  describe('assigning an account', () => {
    it('says why an account cannot be assigned, in the order an officer can act on', async () => {
      const pending = await member({ status: 'PENDING' });
      expect((await state(pending.id)).unassignableBecause).toBe('NOT_ACTIVE_MEMBER');

      const noPhone = await member({ phone: false });
      expect((await state(noPhone.id)).unassignableBecause).toBe('NO_PHONE_ON_RECORD');

      const ready = await member();
      settlementStub = null;
      try {
        expect((await state(ready.id)).unassignableBecause).toBe('NO_SETTLEMENT_ACCOUNT');
      } finally {
        settlementStub = { id: randomUUID(), subaccountCode: SUBACCOUNT };
      }

      await prisma.systemSetting.deleteMany({ where: { key: PERCENTAGE_KEY } });
      try {
        const unpriced = await state(ready.id);
        expect(unpriced.unassignableBecause).toBe('NO_CONTRACTOR_PERCENTAGE');
        expect(unpriced.contractorPercentage).toBeNull();
        expect(unpriced.owedNow.sendKobo).toBeNull();
        await request(server)
          .post(`/api/v1/members/${ready.id}/dedicated-account`)
          .set('Cookie', cookies.officer!)
          .send({ email: `ready.${TAG}@nurtw.test` })
          .expect(409);
      } finally {
        await setSetting(PERCENTAGE_KEY, '1.5');
      }

      expect((await state(ready.id)).unassignableBecause).toBeNull();
    });

    it('opens an account split to the NURTW subaccount, sending Paystack only what it requires', async () => {
      const someone = await member();
      const account = await assign(someone.id);

      const customer = fetchCalls.filter((c) => c.url.endsWith('/customer')).pop();
      expect(Object.keys(customer!.body!).sort()).toEqual([
        'email',
        'first_name',
        'last_name',
        'phone',
      ]);
      const opening = fetchCalls.filter((c) => c.url.endsWith('/dedicated_account')).pop();
      expect(opening!.body).toMatchObject({
        customer: account.paystackCustomerCode,
        subaccount: SUBACCOUNT,
      });

      expect(account.response.accountNumber).toBe(account.accountNumber);
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'payment.dedicated_account.assign', subjectId: someone.id },
      });
      expect((audit?.afterValue as Record<string, unknown> | null)?.outcome).toBe('ASSIGNED');

      const after = await state(someone.id);
      expect(after.account.accountNumber).toBe(account.accountNumber);
      expect(after.unassignableBecause).toBe('ALREADY_ASSIGNED');
      await request(server)
        .post(`/api/v1/members/${someone.id}/dedicated-account`)
        .set('Cookie', cookies.officer!)
        .send({ email: `again.${TAG}@nurtw.test` })
        .expect(409);
    });

    it('audits a Paystack refusal and opens nothing', async () => {
      const someone = await member();
      paystackRefuses = true;
      try {
        await request(server)
          .post(`/api/v1/members/${someone.id}/dedicated-account`)
          .set('Cookie', cookies.officer!)
          .send({ email: `refused.${TAG}@nurtw.test` })
          .expect(502);
      } finally {
        paystackRefuses = false;
      }
      expect(await prisma.dedicatedAccount.count({ where: { memberId: someone.id } })).toBe(0);
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'payment.dedicated_account.assign', subjectId: someone.id },
      });
      expect((audit?.afterValue as Record<string, unknown> | null)?.outcome).toBe(
        'REJECTED_BY_PAYSTACK',
      );
    });

    it('answers 404 outside the caller’s scope, and 403 without payment.initiate', async () => {
      const someone = await member();
      await request(server)
        .get(`/api/v1/members/${someone.id}/dedicated-account`)
        .set('Cookie', cookies.outsider!)
        .expect(404);
      await request(server)
        .post(`/api/v1/members/${someone.id}/dedicated-account`)
        .set('Cookie', cookies.outsider!)
        .send({ email: `outsider.${TAG}@nurtw.test` })
        .expect(404);
      await request(server)
        .post(`/api/v1/members/${someone.id}/dedicated-account`)
        .set('Cookie', cookies.reader!)
        .send({ email: `reader.${TAG}@nurtw.test` })
        .expect(403);
      // A reader may see the state, though.
      await state(someone.id, 'reader');
    });
  });

  // --- Receiving ------------------------------------------------------------------

  describe('receiving a transfer (Requirement 27.7, PAY-12)', () => {
    it('credits what NURTW received, and pays the oldest dues first across membership and levy', async () => {
      // Approved four months back, so the fee has been owed longest; the
      // vehicle owes the two months since onboarding and this one.
      const driver = await member({ approvedMonthsAgo: 4 });
      const car = await vehicle(driver.id, 3);
      const account = await assign(driver.id);

      const fee = (await memberDues(driver.id)).outstandingKobo as number;
      const months = (await vehicleDues(car.id)).unpaidMonths as {
        month: string;
        outstandingKobo: number;
      }[];
      expect(months).toHaveLength(3);
      const before = await state(driver.id);
      expect(before.owedNow.creditKobo).toBe(
        fee + months.reduce((sum, month) => sum + month.outstandingKobo, 0),
      );
      expect(before.owedNow.sendKobo).toBeGreaterThan(before.owedNow.creditKobo);

      const credit = fee + months[0]!.outstandingKobo + 200_000;
      const reference = await transfer(account, { amount: credit + 50_000, subaccountShare: credit });

      const recorded = await prisma.dedicatedAccountTransfer.findUniqueOrThrow({
        where: { paystackReference: reference },
      });
      expect(recorded).toMatchObject({
        amountKobo: credit + 50_000,
        creditKobo: credit,
        creditBasis: 'PAYSTACK_SPLIT',
      });

      const paid = await allocations(reference);
      expect(paid.map((p) => [p.feeType.code, p.duePeriod, p.dueKobo])).toEqual([
        ['MEMBERSHIP', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), fee],
        ['LEVY', months[0]!.month, months[0]!.outstandingKobo],
        ['LEVY', months[1]!.month, 200_000],
      ]);
      for (const payment of paid) {
        expect(payment).toMatchObject({ channel: 'DEDICATED_ACCOUNT', status: 'CONFIRMED' });
        expect(payment.ledgerEntries).toEqual([
          { direction: 'CREDIT', amountKobo: payment.dueKobo },
        ]);
      }

      // Item 22's schedule reads the allocations like any other payment.
      expect((await memberDues(driver.id)).status).toBe('PAID');
      const levy = await vehicleDues(car.id);
      expect(levy.unpaidMonths.map((m: { month: string }) => m.month)).toEqual([
        months[1]!.month,
        months[2]!.month,
      ]);
      expect(levy.unpaidMonths[0].outstandingKobo).toBe(months[1]!.outstandingKobo - 200_000);

      const after = await state(driver.id);
      expect(after.heldCreditKobo).toBe(0);
      expect(after.transfers[0]).toMatchObject({ reference, creditKobo: credit, heldKobo: 0 });
      expect(after.transfers[0].allocations[1]).toMatchObject({
        label: car.plateNumberDisplay,
        period: months[0]!.month,
      });

      // A replayed webhook records nothing new.
      await deliver(reference);
      expect(await prisma.dedicatedAccountTransfer.count({ where: { paystackReference: reference } }))
        .toBe(1);
      expect(await allocations(reference)).toHaveLength(3);
    });

    it('holds what is left, and pays the next month once it falls', async () => {
      const driver = await member({ approvedMonthsAgo: 2 });
      await payMembership(driver.id);
      const car = await vehicle(driver.id, 1);
      const account = await assign(driver.id);
      const [current] = (await vehicleDues(car.id)).unpaidMonths;

      const reference = await transfer(account, {
        amount: 2_000_000,
        subaccountShare: current.outstandingKobo + 300_000,
      });
      expect((await allocations(reference)).map((p) => p.dueKobo)).toEqual([
        current.outstandingKobo,
      ]);
      expect((await state(driver.id)).heldCreditKobo).toBe(300_000);

      // Nothing new has fallen due yet, so a sweep now moves nothing.
      expect(await dedicated.sweep()).toBe(0);

      const lagosNow = new Date(Date.now() + LAGOS_OFFSET_MS);
      const nextMonth = new Date(
        Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth() + 1, 2, 12) - LAGOS_OFFSET_MS,
      );
      await dedicated.sweep(nextMonth);

      const paid = await allocations(reference);
      expect(paid.map((p) => [p.duePeriod, p.dueKobo])).toEqual([
        [current.month, current.outstandingKobo],
        [monthLabel(nextMonth), 300_000],
      ]);
      expect((await state(driver.id)).heldCreditKobo).toBe(0);

      // Run twice, it does nothing the second time.
      await dedicated.sweep(nextMonth);
      expect(await allocations(reference)).toHaveLength(2);
    });

    it('cannot pay one month twice when two transfers arrive together', async () => {
      const driver = await member({ approvedMonthsAgo: 2 });
      await payMembership(driver.id);
      const car = await vehicle(driver.id, 1);
      const account = await assign(driver.id);
      const [current] = (await vehicleDues(car.id)).unpaidMonths;

      const references = [`${TAG}-${randomUUID()}`, `${TAG}-${randomUUID()}`];
      for (const reference of references) {
        verifications.set(reference, {
          status: 'success',
          amount: current.outstandingKobo,
          channel: 'dedicated_nuban',
          customerCode: account.paystackCustomerCode,
          accountNumber: account.accountNumber,
          subaccountShare: current.outstandingKobo,
        });
      }
      await Promise.all(references.map((reference) => deliver(reference)));

      const paidToMonth = await prisma.payment.aggregate({
        where: { subjectId: car.id, duePeriod: current.month, channel: 'DEDICATED_ACCOUNT' },
        _sum: { dueKobo: true },
      });
      expect(paidToMonth._sum.dueKobo).toBe(current.outstandingKobo);
      expect((await state(driver.id)).heldCreditKobo).toBe(current.outstandingKobo);
    });

    it('falls back to the contractor percentage when Paystack gives no split figure', async () => {
      const driver = await member({ approvedMonthsAgo: 1 });
      const account = await assign(driver.id);
      const reference = await transfer(account, { amount: 1_000_000 });
      expect(
        await prisma.dedicatedAccountTransfer.findUniqueOrThrow({
          where: { paystackReference: reference },
        }),
      ).toMatchObject({ creditKobo: 985_000, creditBasis: 'PERCENTAGE_SETTING' });
    });

    it('audits a transfer that matches no member, and one Paystack does not confirm', async () => {
      const unmatched = await transfer(
        { paystackCustomerCode: `CUS_${TAG}_nobody`, accountNumber: '9900000000' },
        { amount: 700_000, subaccountShare: 690_000 },
      );
      const driver = await member();
      const account = await assign(driver.id);
      const failed = await transfer(account, { amount: 700_000, status: 'failed' });

      for (const [reference, action] of [
        [unmatched, 'payment.dedicated.unmatched'],
        [failed, 'payment.dedicated.refused'],
      ] as const) {
        expect(
          await prisma.dedicatedAccountTransfer.count({ where: { paystackReference: reference } }),
        ).toBe(0);
        const audit = await prisma.auditEvent.findFirst({
          where: { action, afterValue: { path: ['reference'], equals: reference } },
        });
        expect(audit).toBeTruthy();
      }
    });
  });

  // --- The contractor percentage ----------------------------------------------------

  describe('setting the contractor percentage (PAY-11)', () => {
    const route = '/api/v1/payments/settlement/dedicated-percentage';

    it('refuses a wrong password and audits the attempt', async () => {
      await request(server)
        .put(route)
        .set('Cookie', cookies.settler!)
        .send({ percentage: 2, password: 'definitely-wrong', reason: `${TAG}: wrong password` })
        .expect(400);
      const audit = await prisma.auditEvent.findFirst({
        where: {
          action: 'payment.settlement.dedicated_percentage',
          reason: `${TAG}: wrong password`,
        },
      });
      expect((audit?.afterValue as Record<string, unknown> | null)?.outcome).toBe(
        'REJECTED_WRONG_PASSWORD',
      );
    });

    it('updates the subaccount at Paystack, then the setting', async () => {
      await request(server)
        .put(route)
        .set('Cookie', cookies.settler!)
        .send({ percentage: 2.25, password: PASSWORD, reason: `${TAG}: confirmed pricing` })
        .expect(200);
      const update = fetchCalls
        .filter((c) => c.url.includes(`/subaccount/${SUBACCOUNT}`) && c.method === 'PUT')
        .pop();
      expect(update?.body?.percentage_charge).toBe(2.25);
      expect(
        (await prisma.systemSetting.findUnique({ where: { key: PERCENTAGE_KEY } }))?.value,
      ).toBe('2.25');
      await setSetting(PERCENTAGE_KEY, '1.5');
    });

    it('changes nothing when Paystack refuses', async () => {
      paystackRefuses = true;
      try {
        await request(server)
          .put(route)
          .set('Cookie', cookies.settler!)
          .send({ percentage: 3, password: PASSWORD, reason: `${TAG}: refused` })
          .expect(400);
      } finally {
        paystackRefuses = false;
      }
      expect(
        (await prisma.systemSetting.findUnique({ where: { key: PERCENTAGE_KEY } }))?.value,
      ).toBe('1.5');
    });

    it('refuses more than two decimal places, and a caller without the permission', async () => {
      await request(server)
        .put(route)
        .set('Cookie', cookies.settler!)
        .send({ percentage: 1.234, password: PASSWORD, reason: `${TAG}: too precise` })
        .expect(400);
      await request(server)
        .put(route)
        .set('Cookie', cookies.officer!)
        .send({ percentage: 2, password: PASSWORD, reason: `${TAG}: not allowed` })
        .expect(403);
    });
  });

  // --- Helpers --------------------------------------------------------------------

  async function setSetting(key: string, value: string) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
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
    const transfers = await prisma.dedicatedAccountTransfer.findMany({
      where: { paystackReference: { contains: TAG } },
      select: { id: true },
    });

    // Webhook-driven audit entries carry no actor; they are found by subject,
    // or by the fixture reference they name.
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { subjectId: { in: transfers.map((transfer) => transfer.id) } },
          { afterValue: { path: ['reference'], string_contains: TAG } },
        ],
      },
    });
    await prisma.ledgerEntry.deleteMany({
      where: { payment: { paystackReference: { contains: TAG } } },
    });
    await prisma.payment.deleteMany({ where: { paystackReference: { contains: TAG } } });
    await prisma.dedicatedAccountTransfer.deleteMany({
      where: { paystackReference: { contains: TAG } },
    });
    await prisma.dedicatedAccount.deleteMany({
      where: { member: { organisationId: { in: orgIds } } },
    });
    await prisma.sticker.deleteMany({ where: { stickerQrId: { contains: TAG } } });
    await prisma.vehicle.deleteMany({ where: { branchId: { in: orgIds } } });
    await prisma.membershipApplication.deleteMany({
      where: { applicationNumber: { contains: TAG } },
    });
    await prisma.member.deleteMany({ where: { organisationId: { in: orgIds } } });
    await prisma.userPermissionGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

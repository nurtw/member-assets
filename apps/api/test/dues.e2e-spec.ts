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
 * The dues schedule, end to end (PRD Requirements 27.8, 27.13,
 * `plans/22-dues-schedule.md`).
 *
 * The rules themselves are unit-tested in `@nurtw/domain`. What carries weight
 * here is that the service feeds them the right facts: the onboarding date
 * from the first attachment, credit from the ledger net of refunds, the amount
 * in force when each month fell due, and the go-live date from settings — and
 * that a record outside the caller's scope answers 404.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-dues';
const PASSWORD = 'e2e-fixture-password-1';
const GO_LIVE_KEY = 'dues.go_live_date';
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

interface Fixture {
  branchId: string;
  otherBranchId: string;
  routeTypeId: string;
  levyId: string;
  membershipId: string;
  /** What one month of levy costs the fixture vehicle today. */
  levyKobo: number;
}

/** Noon in Lagos on the 15th, `monthsAgo` calendar months back. */
function midMonth(monthsAgo: number): Date {
  const lagosNow = new Date(Date.now() + LAGOS_OFFSET_MS);
  return new Date(
    Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth() - monthsAgo, 15, 12) -
      LAGOS_OFFSET_MS,
  );
}

function monthLabel(monthsAgo: number): string {
  const lagos = new Date(midMonth(monthsAgo).getTime() + LAGOS_OFFSET_MS);
  return `${lagos.getUTCFullYear()}-${String(lagos.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('Dues (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let fixture: Fixture;
  let goLiveBefore: { value: string } | null = null;
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

    const routeType = await prisma.routeType.findUniqueOrThrow({
      where: { code: 'INTERCITY' },
    });
    const levy = await prisma.feeType.findUniqueOrThrow({
      where: { code: 'LEVY' },
      include: { prices: true },
    });
    const membership = await prisma.feeType.findUniqueOrThrow({
      where: { code: 'MEMBERSHIP' },
    });

    fixture = {
      branchId: branches[0]!,
      otherBranchId: branches[1]!,
      routeTypeId: routeType.id,
      levyId: levy.id,
      membershipId: membership.id,
      levyKobo:
        levy.prices.find((price) => price.routeTypeId === routeType.id)?.amountKobo ??
        levy.amountKobo,
    };

    goLiveBefore = await prisma.systemSetting.findUnique({
      where: { key: GO_LIVE_KEY },
      select: { value: true },
    });
    await prisma.systemSetting.deleteMany({ where: { key: GO_LIVE_KEY } });

    await buildUser('reader', ['vehicle.read', 'member.read'], fixture.branchId);
    await buildUser('outsider', ['vehicle.read', 'member.read'], fixture.otherBranchId);
    await buildUser('feeadmin', ['fee_type.manage', 'payment.read'], fixture.branchId);
    await buildUser('nobody', ['payment.read'], fixture.branchId);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    for (const who of ['reader', 'outsider', 'feeadmin', 'nobody']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    await cleanUp();
    // Put the go-live date back exactly as it was found.
    await prisma.systemSetting.deleteMany({ where: { key: GO_LIVE_KEY } });
    if (goLiveBefore) {
      await prisma.systemSetting.create({
        data: { key: GO_LIVE_KEY, value: goLiveBefore.value },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  let plates = 0;
  /** A vehicle, onboarded `onboardedMonthsAgo` months back when given. */
  async function vehicle(onboardedMonthsAgo: number | null) {
    plates += 1;
    const created = await prisma.vehicle.create({
      data: {
        plateNumberDisplay: `E2EDUE-${plates}`,
        plateNumberNormalized: `E2EDUE${plates}`,
        branchId: fixture.branchId,
        status: 'ON_RECORD',
        declaredAt: null,
        routeTypeId: fixture.routeTypeId,
      },
    });
    if (onboardedMonthsAgo !== null) {
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
    }
    return created;
  }

  /** A confirmed payment with its ledger credit, as `PaymentsService.confirm` writes it. */
  async function credit(
    feeTypeId: string,
    subject: { type: 'vehicle' | 'member'; id: string },
    amountKobo: number,
    confirmedAt = new Date(),
  ) {
    return prisma.payment.create({
      data: {
        feeTypeId,
        subjectType: subject.type,
        subjectId: subject.id,
        dueKobo: amountKobo,
        contractorFeeKobo: 0,
        totalChargedKobo: amountKobo,
        channel: 'LINK',
        status: 'CONFIRMED',
        paystackReference: `${TAG}-${randomUUID()}`,
        confirmedAt,
        ledgerEntries: {
          create: { direction: 'CREDIT', amountKobo, description: 'Due settled' },
        },
      },
    });
  }

  async function vehicleDues(id: string, who = 'reader') {
    const response = await request(server)
      .get(`/api/v1/vehicles/${id}/dues`)
      .set('Cookie', cookies[who]!)
      .expect(200);
    return response.body.dues;
  }

  async function memberDues(id: string) {
    const response = await request(server)
      .get(`/api/v1/members/${id}/dues`)
      .set('Cookie', cookies.reader!)
      .expect(200);
    return response.body.dues;
  }

  let members = 0;
  async function member(data: { legacyId?: string } = {}) {
    members += 1;
    return prisma.member.create({
      data: {
        surname: `Fixture${members}`,
        firstName: TAG,
        organisationId: fixture.branchId,
        status: 'ACTIVE',
        ...data,
      },
    });
  }

  describe('the levy on a vehicle (Requirement 27.13)', () => {
    it('is not due for a vehicle that has not been onboarded', async () => {
      const dues = await vehicleDues((await vehicle(null)).id);
      expect(dues).toMatchObject({
        status: 'NOT_DUE',
        firstDueOn: null,
        monthsDue: 0,
        unpaidMonths: [],
        outstandingKobo: 0,
        currentAmountKobo: fixture.levyKobo,
      });
    });

    it('is not due in the month of onboarding itself', async () => {
      const dues = await vehicleDues((await vehicle(0)).id);
      expect(dues.status).toBe('NOT_DUE');
      expect(dues.monthsDue).toBe(0);
      expect(dues.nextDueOn).toBe(dues.firstDueOn);
    });

    it('accumulates from the month after onboarding, and reads as arrears', async () => {
      // Onboarded three months ago: the two months since, and this one.
      const dues = await vehicleDues((await vehicle(3)).id);
      expect(dues.status).toBe('IN_ARREARS');
      expect(dues.monthsDue).toBe(3);
      expect(dues.unpaidMonths.map((m: { month: string }) => m.month)).toEqual([
        monthLabel(2),
        monthLabel(1),
        monthLabel(0),
      ]);
      expect(dues.outstandingKobo).toBe(3 * fixture.levyKobo);
    });

    it('pays the oldest months first from the ledger, then holds the rest as credit', async () => {
      const onboarded = await vehicle(3);
      const subject = { type: 'vehicle' as const, id: onboarded.id };

      await credit(fixture.levyId, subject, 2 * fixture.levyKobo);
      let dues = await vehicleDues(onboarded.id);
      expect(dues.status).toBe('OWED');
      expect(dues.unpaidMonths.map((m: { month: string }) => m.month)).toEqual([monthLabel(0)]);

      await credit(fixture.levyId, subject, 2 * fixture.levyKobo);
      dues = await vehicleDues(onboarded.id);
      expect(dues).toMatchObject({
        status: 'PAID',
        outstandingKobo: 0,
        unpaidMonths: [],
        creditKobo: fixture.levyKobo,
      });
    });

    it('counts only levy paid for this vehicle', async () => {
      const onboarded = await vehicle(2);
      const elsewhere = await vehicle(2);
      // Another vehicle's levy, and a sticker fee on this one: neither is its levy.
      await credit(fixture.levyId, { type: 'vehicle', id: elsewhere.id }, 5 * fixture.levyKobo);
      const stickerFee = await prisma.feeType.findUniqueOrThrow({
        where: { code: 'STICKER_NEW' },
      });
      await credit(stickerFee.id, { type: 'vehicle', id: onboarded.id }, 5 * fixture.levyKobo);

      const dues = await vehicleDues(onboarded.id);
      expect(dues.outstandingKobo).toBe(2 * fixture.levyKobo);
    });

    it('owes again after a refund, which is a reversing entry (Requirement 27.9)', async () => {
      const onboarded = await vehicle(1);
      const payment = await credit(
        fixture.levyId,
        { type: 'vehicle', id: onboarded.id },
        fixture.levyKobo,
      );
      expect((await vehicleDues(onboarded.id)).status).toBe('PAID');

      await prisma.ledgerEntry.create({
        data: {
          paymentId: payment.id,
          direction: 'DEBIT',
          amountKobo: fixture.levyKobo,
          description: 'Refund',
        },
      });
      expect(await vehicleDues(onboarded.id)).toMatchObject({
        status: 'OWED',
        outstandingKobo: fixture.levyKobo,
      });
    });

    it('keeps a paid month paid after the levy rises, and records the change', async () => {
      const onboarded = await vehicle(3);
      await credit(
        fixture.levyId,
        { type: 'vehicle', id: onboarded.id },
        2 * fixture.levyKobo,
      );
      const key = { feeTypeId: fixture.levyId, routeTypeId: fixture.routeTypeId };
      const rowsBefore = await prisma.feeAmountHistory.count({ where: key });
      const raised = fixture.levyKobo + 100_000;

      try {
        await request(server)
          .put('/api/v1/fee-types/LEVY/prices/INTERCITY')
          .set('Cookie', cookies.feeadmin!)
          .send({ amountKobo: raised, reason: 'e2e: levy rise' })
          .expect(200);

        // The first change also writes the amount it replaced, as the baseline.
        const history = await prisma.feeAmountHistory.findMany({
          where: key,
          orderBy: { effectiveFrom: 'asc' },
        });
        expect(history.length).toBe(rowsBefore === 0 ? 2 : rowsBefore + 1);
        expect(history.at(-1)!.amountKobo).toBe(raised);
        if (rowsBefore === 0) {
          expect(history[0]).toMatchObject({ amountKobo: fixture.levyKobo });
          expect(history[0]!.effectiveFrom.getTime()).toBe(0);
        }

        const dues = await vehicleDues(onboarded.id);
        // The two paid months are still paid, and the month owed is still
        // owed at the amount in force when it fell due.
        expect(dues.unpaidMonths).toEqual([
          expect.objectContaining({
            month: monthLabel(0),
            amountKobo: fixture.levyKobo,
            outstandingKobo: fixture.levyKobo,
          }),
        ]);
        expect(dues.status).toBe('OWED');
        // The next month will cost the new amount.
        expect(dues.currentAmountKobo).toBe(raised);
      } finally {
        await request(server)
          .put('/api/v1/fee-types/LEVY/prices/INTERCITY')
          .set('Cookie', cookies.feeadmin!)
          .send({ amountKobo: fixture.levyKobo, reason: 'e2e: restore' })
          .expect(200);
      }
    });

    it('stops after the month the vehicle is retired in (PAY-19)', async () => {
      const retired = await vehicle(5);
      await prisma.vehicle.update({
        where: { id: retired.id },
        data: { status: 'RETIRED', retiredAt: midMonth(3) },
      });

      const dues = await vehicleDues(retired.id);
      // Onboarded five months back: the levy fell due four and three months
      // back, and stopped with the month of retirement.
      expect(dues.monthsDue).toBe(2);
      expect(dues.unpaidMonths.map((month: { month: string }) => month.month)).toEqual([
        monthLabel(4),
        monthLabel(3),
      ]);
      expect(dues.nextDueOn).toBeNull();
    });

    it('prices each month at the route type the vehicle had on its 1st (PAY-19)', async () => {
      // A route type of the test's own, priced apart from the real ones, so
      // no other suite's levy changes while this runs.
      const ownRouteType = await prisma.routeType.create({
        data: { code: `E2E_DUES_${randomUUID().slice(0, 8)}`, label: `Route ${TAG}` },
      });
      const ownPrice = fixture.levyKobo + 200_000;
      await prisma.feeTypePrice.create({
        data: {
          feeTypeId: fixture.levyId,
          routeTypeId: ownRouteType.id,
          amountKobo: ownPrice,
        },
      });
      const onboarded = await vehicle(3);
      try {
        // On the test's route type from before onboarding, moved to the
        // fixture's in the middle of last month.
        await prisma.vehicleRouteTypeChange.createMany({
          data: [
            {
              vehicleId: onboarded.id,
              routeTypeId: ownRouteType.id,
              previousRouteTypeId: null,
              changedAt: midMonth(6),
            },
            {
              vehicleId: onboarded.id,
              routeTypeId: fixture.routeTypeId,
              previousRouteTypeId: ownRouteType.id,
              changedAt: midMonth(1),
            },
          ],
        });

        const dues = await vehicleDues(onboarded.id);
        expect(
          dues.unpaidMonths.map((month: { month: string; amountKobo: number }) => [
            month.month,
            month.amountKobo,
          ]),
        ).toEqual([
          [monthLabel(2), ownPrice],
          [monthLabel(1), ownPrice],
          [monthLabel(0), fixture.levyKobo],
        ]);
      } finally {
        await prisma.vehicleRouteTypeChange.deleteMany({
          where: { vehicleId: onboarded.id },
        });
        await prisma.feeTypePrice.deleteMany({
          where: { routeTypeId: ownRouteType.id },
        });
        await prisma.routeType.delete({ where: { id: ownRouteType.id } });
      }
    });

    it('answers 404 outside the caller’s scope, and 403 without vehicle.read', async () => {
      const onboarded = await vehicle(1);
      await request(server)
        .get(`/api/v1/vehicles/${onboarded.id}/dues`)
        .set('Cookie', cookies.outsider!)
        .expect(404);
      await request(server)
        .get(`/api/v1/vehicles/${onboarded.id}/dues`)
        .set('Cookie', cookies.nobody!)
        .expect(403);
    });

    it('is not part of the vehicle record itself', async () => {
      // Requirement 27.8 — dues sit beside a result, never inside the record
      // other channels are projected from.
      const onboarded = await vehicle(2);
      const response = await request(server)
        .get(`/api/v1/vehicles/${onboarded.id}`)
        .set('Cookie', cookies.reader!)
        .expect(200);
      // Looks for the dues fields themselves: the fixture's own names contain
      // the word "dues", so a plain word search would match them.
      expect(Object.keys(response.body.vehicle)).not.toContain('dues');
      expect(JSON.stringify(response.body)).not.toMatch(
        /outstandingKobo|creditKobo|unpaidMonths|monthsDue|IN_ARREARS|"OWED"/,
      );
    });
  });

  describe('the membership fee (Requirement 27.13, PAY-03)', () => {
    it('has not started for a member who was never approved', async () => {
      const dues = await memberDues((await member()).id);
      expect(dues).toMatchObject({
        status: 'NOT_DUE',
        firstDueOn: null,
        notStartedBecause: 'NOT_APPROVED',
      });
    });

    it('is owed from approval', async () => {
      const approved = await member();
      const reviewedAt = midMonth(1);
      await prisma.membershipApplication.create({
        data: {
          applicationNumber: `${TAG}-${randomUUID()}`,
          status: 'APPROVED',
          memberId: approved.id,
          reviewedAt,
        },
      });

      expect(await memberDues(approved.id)).toMatchObject({
        status: 'OWED',
        firstDueOn: reviewedAt.toISOString(),
        owedSince: reviewedAt.toISOString(),
        notStartedBecause: null,
      });
    });

    it('waits for a go-live date for a migrated member, then counts from it (GOV-11)', async () => {
      const migrated = await member({ legacyId: `${TAG}-${randomUUID()}` });

      expect(await memberDues(migrated.id)).toMatchObject({
        status: 'NOT_DUE',
        notStartedBecause: 'NO_GO_LIVE_DATE',
      });

      await prisma.systemSetting.create({
        data: { key: GO_LIVE_KEY, value: '2026-01-05' },
      });
      try {
        expect(await memberDues(migrated.id)).toMatchObject({
          status: 'OWED',
          // The start of that day in Lagos.
          owedSince: '2026-01-04T23:00:00.000Z',
          notStartedBecause: null,
        });
      } finally {
        await prisma.systemSetting.deleteMany({ where: { key: GO_LIVE_KEY } });
      }
    });

    it('is paid for 12 months from the day it is paid, and owed again after a refund', async () => {
      const approved = await member();
      await prisma.membershipApplication.create({
        data: {
          applicationNumber: `${TAG}-${randomUUID()}`,
          status: 'APPROVED',
          memberId: approved.id,
          reviewedAt: midMonth(4),
        },
      });
      const paidOn = midMonth(2);
      const payment = await credit(
        fixture.membershipId,
        { type: 'member', id: approved.id },
        3_000_000,
        paidOn,
      );

      const dues = await memberDues(approved.id);
      expect(dues.status).toBe('PAID');
      const until = new Date(dues.coveredUntil);
      // Twelve months on from the payment, to the day.
      expect(until.getTime() - paidOn.getTime()).toBeGreaterThan(364 * 86_400_000);
      expect(until.getTime() - paidOn.getTime()).toBeLessThan(367 * 86_400_000);

      await prisma.ledgerEntry.create({
        data: {
          paymentId: payment.id,
          direction: 'DEBIT',
          amountKobo: 3_000_000,
          description: 'Refund',
        },
      });
      expect((await memberDues(approved.id)).status).toBe('OWED');
    });

    it('answers 404 outside the caller’s scope, and 403 without member.read', async () => {
      const someone = await member();
      await request(server)
        .get(`/api/v1/members/${someone.id}/dues`)
        .set('Cookie', cookies.outsider!)
        .expect(404);
      await request(server)
        .get(`/api/v1/members/${someone.id}/dues`)
        .set('Cookie', cookies.nobody!)
        .expect(403);
    });
  });

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

    // The amount history is append-only in the application. A test that
    // changed a real fee's amount takes its own rows back out, so a shared
    // database is not left recording a price nobody set.
    await prisma.feeAmountHistory.deleteMany({
      where: { changedByUserId: { in: userIds } },
    });

    await prisma.ledgerEntry.deleteMany({
      where: { payment: { paystackReference: { contains: TAG } } },
    });
    await prisma.payment.deleteMany({
      where: { paystackReference: { contains: TAG } },
    });
    await prisma.sticker.deleteMany({ where: { stickerQrId: { contains: TAG } } });
    await prisma.vehicle.deleteMany({ where: { branchId: { in: orgIds } } });
    await prisma.membershipApplication.deleteMany({
      where: { applicationNumber: { contains: TAG } },
    });
    await prisma.member.deleteMany({ where: { organisationId: { in: orgIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.userPermissionGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './../src/app.module.js';
import { ApiRequestLogService } from '../src/api-client/api-request-log.service.js';
import { SessionService } from '../src/auth/session.service.js';
import { HousekeepingService } from '../src/housekeeping/housekeeping.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What housekeeping removes, and what it leaves. Rows are made by hand with
 * the dates the cases need, under a request id and an email of this suite's
 * own so nothing else is touched.
 */
describe('Housekeeping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logs: ApiRequestLogService;
  let sessions: SessionService;
  let housekeeping: HousekeepingService;
  let userId: string;
  const requestId = 'housekeeping-e2e';
  const email = 'housekeeping-e2e@example.test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    logs = app.get(ApiRequestLogService);
    sessions = app.get(SessionService);
    housekeeping = app.get(HousekeepingService);

    const user = await prisma.user.create({
      data: { email, fullName: 'Housekeeping Test', passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.apiRequestLog.deleteMany({ where: { requestId } });
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  const logRow = (createdAt: Date) =>
    prisma.apiRequestLog.create({
      data: {
        requestId,
        endpoint: 'GET /housekeeping',
        scope: null,
        resultClass: 'MATCH',
        statusCode: 200,
        createdAt,
      },
    });

  it('deletes access-log rows older than twelve months, and keeps newer ones', async () => {
    const now = new Date();
    const old = await logRow(new Date(now.getTime() - 400 * DAY_MS));
    const recent = await logRow(new Date(now.getTime() - 300 * DAY_MS));

    await logs.prune(now);

    expect(await prisma.apiRequestLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.apiRequestLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });

  it('deletes sessions expired over a month ago, and keeps the rest', async () => {
    const now = new Date();
    const make = (suffix: string, expiresAt: Date) =>
      prisma.userSession.create({
        data: { userId, tokenHash: `housekeeping-${suffix}`, expiresAt },
      });
    const longGone = await make('gone', new Date(now.getTime() - 40 * DAY_MS));
    const justExpired = await make('just', new Date(now.getTime() - 2 * DAY_MS));
    const live = await make('live', new Date(now.getTime() + DAY_MS));

    await sessions.prune(now);

    expect(await prisma.userSession.findUnique({ where: { id: longGone.id } })).toBeNull();
    expect(await prisma.userSession.findUnique({ where: { id: justExpired.id } })).not.toBeNull();
    expect(await prisma.userSession.findUnique({ where: { id: live.id } })).not.toBeNull();
  });

  it('registers the jobs with the one timer, and runs them without failing', async () => {
    expect(await housekeeping.runOnce()).toEqual([]);
  });
});

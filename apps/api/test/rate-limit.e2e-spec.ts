import { randomInt, randomUUID } from 'node:crypto';

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_RATE_LIMIT_PROFILES } from '@nurtw/contracts';
import { generateIdentifier } from '@nurtw/domain';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { generateApiToken } from './../src/api-client/api-token.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { RequireScope } from './../src/auth/require-scope.decorator.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { RateLimitService } from './../src/rate-limit/rate-limit.service.js';

/**
 * Rate limiting and abuse detection, end to end (PRD §14 —
 * `plans/13-rate-limiting-and-abuse.md`).
 *
 * The assertions that carry weight:
 *
 * - a client over its rate, hourly quota, or daily quota receives `429` with
 *   a `Retry-After` (acceptance criterion 7), and the refusal is not counted;
 * - plates tested in sequence pause the organisation while it is well inside
 *   its quota (criterion 8), as do forged codes and a run of non-matches;
 * - a pause is audited, shown to an officer, and lifted only with a reason;
 * - every number comes from a profile an officer changes at runtime;
 * - an external request must carry its own request id, and every answer
 *   carries the System's.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-ratelimit';
const PASSWORD = 'e2e-fixture-password-1';
const SIGNING_SECRET = 'e2e-fixture-ratelimit-signing-secret';

/** Everything generous, so a test changes only what it is about. */
const BASE = {
  verificationPerMinute: 6000,
  aggregatePerMinute: 6000,
  burst: 1000,
  hourlyQuota: null as number | null,
  dailyQuota: 10_000_000,
  windowMinutes: 10,
  forgeryThreshold: 100_000,
  missThreshold: 1_000_000,
  missPercent: 100,
  sequenceThreshold: 100_000,
  sequenceReach: 3,
  pauseMinutes: 60,
};

@Controller('e2e-ratelimit-probe')
class ProbeController {
  @RequireScope('aggregate:vehicles:total')
  @Get('total')
  total() {
    return { ok: true };
  }
}

describe('Rate limiting and abuse detection (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const savedSecret = process.env.STICKER_SIGNING_SECRET;
  const cookies: Record<string, string> = {};
  let profileSerial = 0;
  let minimalProfileId: string;

  beforeAll(async () => {
    process.env.STICKER_SIGNING_SECRET = SIGNING_SECRET;
    await cleanUp();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    const council = await prisma.organisation.findFirstOrThrow({
      where: { level: 'COUNCIL' },
    });
    minimalProfileId = (
      await prisma.disclosureProfile.findUniqueOrThrow({
        where: { code: 'MINIMAL_VERIFICATION' },
      })
    ).id;
    const users: Record<string, readonly string[]> = {
      // The API administrator of PRD §16.
      admin: ['api_client.read', 'api_client.manage'],
      // The security administrator, who changes limit profiles.
      security: ['api_client.read', 'rate_limit.manage'],
    };
    for (const [who, permissions] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: {
          email: `${who}.${TAG}@nurtw.test`,
          fullName: `${who} ${TAG}`,
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
            organisationId: council.id,
            grantedByUserId: user.id,
            reason: 'e2e fixture',
          },
        });
      }
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: `${who}.${TAG}@nurtw.test`, password: PASSWORD })
        .expect(200);
      const raw = response.headers['set-cookie'];
      cookies[who] = (Array.isArray(raw) ? raw[0]! : raw!).split(';')[0]!;
    }
  });

  afterAll(async () => {
    if (savedSecret === undefined) {
      delete process.env.STICKER_SIGNING_SECRET;
    } else {
      process.env.STICKER_SIGNING_SECRET = savedSecret;
    }
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- Helpers -------------------------------------------------------------------

  /** An organisation of its own, on a profile of its own, with a token. */
  async function organisation(
    limits: Partial<typeof BASE> = {},
    dailyQuota: number | null = null,
  ) {
    const code = `E2E_RATELIMIT_${++profileSerial}`;
    await prisma.rateLimitProfile.create({
      data: { code, label: `${TAG} ${code}`, ...BASE, ...limits },
    });
    const client = await prisma.apiClient.create({
      data: {
        organisationName: `${code} ${TAG}`,
        status: 'ACTIVE',
        businessPurpose: 'End-to-end fixture for rate limits.',
        technicalContactName: 'Fixture contact',
        technicalContactEmail: 'fixture@example.test',
        agreementReference: 'DSA/E2E',
        agreementDate: new Date('2026-09-01T00:00:00Z'),
        approvedAt: new Date(),
        rateLimitProfile: code,
        dailyQuota,
        allowedIpRanges: [],
        disclosureProfileId: minimalProfileId,
        scopes: {
          create: [
            'vehicle:verify:plate',
            'sticker:verify:qr',
            'member:verify:membership',
            'aggregate:vehicles:total',
          ].map((scope) => ({ scope })),
        },
      },
    });
    const generated = generateApiToken();
    await prisma.apiToken.create({
      data: {
        clientId: client.id,
        tokenHash: generated.hash,
        tokenPrefix: generated.prefix,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { id: client.id, profile: code, token: generated.token };
  }

  const requestId = () => `${TAG}-${randomUUID()}`;

  function external(
    token: string,
    path: string,
    body: object,
    id: string | null = requestId(),
  ) {
    const pending = request(server)
      .post(`/api/v1/verification/${path}`)
      .set('Authorization', `Bearer ${token}`);
    if (id !== null) {
      pending.set('X-Request-ID', id);
    }
    return pending.send(body);
  }

  const plate = (token: string, value: string, id?: string) =>
    external(token, 'vehicle/plate', { plate_number: value }, id);

  async function officer(
    method: 'get' | 'post' | 'put',
    path: string,
    body?: object,
    who = 'admin',
  ) {
    const pending = request(server)
      [method](`/api/v1${path}`)
      .set('Cookie', cookies[who]!);
    return body ? pending.send(body) : pending;
  }

  async function logOf(clientId: string) {
    return prisma.apiRequestLog.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function usedToday(clientId: string): Promise<number> {
    const response = await officer('get', `/api-clients/${clientId}`);
    expect(response.status).toBe(200);
    return response.body.client.limits.usedToday as number;
  }

  // --- The quota layer -------------------------------------------------------------

  describe('the rate and burst', () => {
    it('answers 429 with Retry-After once the burst is spent (criterion 7)', async () => {
      // One a minute refills too slowly to matter during the test.
      const { id, token } = await organisation({
        verificationPerMinute: 1,
        burst: 3,
      });
      for (let index = 0; index < 3; index += 1) {
        expect((await plate(token, 'E2ERLBURST')).status).toBe(200);
      }
      const refused = await plate(token, 'E2ERLBURST');
      expect(refused.status).toBe(429);
      const retryAfter = Number(refused.headers['retry-after']);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(refused.body.error).toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded.',
      });
      expect(Object.keys(refused.body.error).sort()).toEqual([
        'code',
        'message',
        'requestId',
      ]);

      const log = await logOf(id);
      expect(log.at(-1)).toMatchObject({
        resultClass: 'RATE_LIMITED',
        statusCode: 429,
        rateLimited: true,
      });
      // A refusal is not counted against the quota.
      expect(await usedToday(id)).toBe(3);
    });

    it('holds a total to its own, slower rate, apart from verification', async () => {
      const { token } = await organisation({ aggregatePerMinute: 1, burst: 2 });
      const total = () =>
        request(server)
          .get('/api/v1/e2e-ratelimit-probe/total')
          .set('Authorization', `Bearer ${token}`)
          .set('X-Request-ID', requestId());

      expect((await total()).status).toBe(200);
      expect((await total()).status).toBe(200);
      expect((await total()).status).toBe(429);
      // The verification bucket is untouched.
      expect((await plate(token, 'E2ERLTOTAL')).status).toBe(200);
    });

    it('shares one bucket between an organisation’s tokens', async () => {
      const { id, token } = await organisation({
        verificationPerMinute: 1,
        burst: 2,
      });
      const second = generateApiToken();
      await prisma.apiToken.create({
        data: {
          clientId: id,
          tokenHash: second.hash,
          tokenPrefix: second.prefix,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          retiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      expect((await plate(token, 'E2ERLSHARE')).status).toBe(200);
      expect((await plate(second.token, 'E2ERLSHARE')).status).toBe(200);
      expect((await plate(token, 'E2ERLSHARE')).status).toBe(429);
    });
  });

  describe('the quotas', () => {
    it('refuses past the hourly quota, until the next hour', async () => {
      const { id, token } = await organisation({ hourlyQuota: 2 });
      expect((await plate(token, 'E2ERLHOUR')).status).toBe(200);
      expect((await plate(token, 'E2ERLHOUR')).status).toBe(200);
      const refused = await plate(token, 'E2ERLHOUR');
      expect(refused.status).toBe(429);
      expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(3600);
      expect((await logOf(id)).at(-1)?.resultClass).toBe('HOURLY_QUOTA');
    });

    it('refuses past the daily quota, until midnight in Lagos', async () => {
      const { id, token } = await organisation({ dailyQuota: 2 });
      expect((await plate(token, 'E2ERLDAY')).status).toBe(200);
      expect((await plate(token, 'E2ERLDAY')).status).toBe(200);
      const refused = await plate(token, 'E2ERLDAY');
      expect(refused.status).toBe(429);
      const retryAfter = Number(refused.headers['retry-after']);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(86_400);
      expect((await logOf(id)).at(-1)?.resultClass).toBe('DAILY_QUOTA');
      expect(await usedToday(id)).toBe(2);
    });

    it('applies an organisation’s own daily quota over its profile’s', async () => {
      const { id, token } = await organisation({ dailyQuota: 1000 }, 1);
      expect((await plate(token, 'E2ERLOWN')).status).toBe(200);
      expect((await plate(token, 'E2ERLOWN')).status).toBe(429);
      const detail = await officer('get', `/api-clients/${id}`);
      expect(detail.body.client.limits).toMatchObject({
        dailyQuota: 1,
        dailyQuotaOverride: 1,
        usedToday: 1,
      });
    });
  });

  // --- The detection layer -----------------------------------------------------------

  describe('abuse detection (Requirement 14.2)', () => {
    it('pauses an organisation testing plates in sequence, inside its quota (criterion 8)', async () => {
      const { id, token } = await organisation({ sequenceThreshold: 5 });
      for (const number of [101, 102, 103, 104]) {
        expect((await plate(token, `E2ERL${number}XY`)).status).toBe(200);
      }
      expect(
        await prisma.apiClientPause.count({ where: { clientId: id } }),
      ).toBe(0);
      // The fifth step is answered, then the organisation is paused.
      expect((await plate(token, 'E2ERL105XY')).status).toBe(200);

      const refused = await plate(token, 'E2ERL106XY');
      expect(refused.status).toBe(429);
      const retryAfter = Number(refused.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(3500);
      expect(retryAfter).toBeLessThanOrEqual(3600);
      expect((await logOf(id)).at(-1)).toMatchObject({
        resultClass: 'PAUSED',
        statusCode: 429,
      });
      // Five checks of a daily quota of ten million.
      expect(await usedToday(id)).toBe(5);

      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'api_client.pause', subjectId: id },
      });
      expect(event?.actorUserId).toBeNull();
      expect(event?.afterValue).toMatchObject({
        signal: 'SEQUENTIAL_PLATES',
        pauseMinutes: 60,
        evidence: { plateRun: 5 },
      });
      // The evidence is counts, never the plates presented.
      expect(JSON.stringify(event?.afterValue)).not.toContain('E2ERL');
    });

    it('does not count plates that are far apart as a sequence', async () => {
      const { id, token } = await organisation({ sequenceThreshold: 3 });
      for (const number of [100, 200, 300, 400, 500]) {
        expect((await plate(token, `E2ERL${number}AB`)).status).toBe(200);
      }
      expect(
        await prisma.apiClientPause.count({ where: { clientId: id } }),
      ).toBe(0);
    });

    it('pauses an organisation sending forged sticker codes', async () => {
      const { id, token } = await organisation({ forgeryThreshold: 3 });
      for (let index = 0; index < 3; index += 1) {
        const response = await external(token, 'sticker/qr', {
          sticker_qr_id: `${TAG}-${index}.k1.forged`,
        });
        expect(response.status).toBe(200);
        expect(response.body.result).toBe('NO_MATCH_FOUND');
      }
      expect((await plate(token, 'E2ERLFORGE')).status).toBe(429);
      const pause = await prisma.apiClientPause.findFirst({
        where: { clientId: id },
      });
      expect(pause?.signal).toBe('FORGED_CODES');
    });

    it('pauses an organisation whose checks mostly match nothing', async () => {
      const { id, token } = await organisation({
        missThreshold: 4,
        missPercent: 80,
      });
      for (let index = 0; index < 4; index += 1) {
        const number = generateIdentifier(() => randomInt(256));
        expect((await external(token, 'membership', { number })).status).toBe(
          200,
        );
      }
      expect((await plate(token, 'E2ERLMISS')).status).toBe(429);
      const pause = await prisma.apiClientPause.findFirst({
        where: { clientId: id },
      });
      expect(pause?.signal).toBe('HIGH_MISS_RATE');
    });

    it('does not count a request refused as badly formed', async () => {
      const { id, token } = await organisation({ missThreshold: 2 });
      for (let index = 0; index < 4; index += 1) {
        expect(
          (await external(token, 'vehicle/plate', { plate_number: '---' }))
            .status,
        ).toBe(400);
      }
      expect(
        await prisma.apiClientPause.count({ where: { clientId: id } }),
      ).toBe(0);
    });

    it('shows the pause to an officer, who lifts it only with a reason', async () => {
      const { id, token } = await organisation({ sequenceThreshold: 2 });
      await plate(token, 'E2ERL300CD');
      await plate(token, 'E2ERL301CD');
      expect((await plate(token, 'E2ERL302CD')).status).toBe(429);

      const list = await officer('get', '/api-clients');
      const row = (
        list.body.clients as { id: string; pausedUntil: string | null }[]
      ).find((client) => client.id === id);
      expect(row?.pausedUntil).not.toBeNull();
      const detail = await officer('get', `/api-clients/${id}`);
      expect(detail.body.client.pause).toMatchObject({
        signal: 'SEQUENTIAL_PLATES',
        active: true,
      });

      expect(
        (await officer('post', `/api-clients/${id}/pause/lift`, {})).status,
      ).toBe(400);
      expect(
        (
          await officer(
            'post',
            `/api-clients/${id}/pause/lift`,
            { reason: 'Integration fault fixed' },
            'security',
          )
        ).status,
      ).toBe(403);
      const lifted = await officer('post', `/api-clients/${id}/pause/lift`, {
        reason: 'Integration fault fixed',
      });
      expect(lifted.status).toBe(201);
      expect(lifted.body.client.pausedUntil).toBeNull();
      expect(lifted.body.client.pause.active).toBe(false);

      // The evidence started again, so the next check is answered.
      expect((await plate(token, 'E2ERL303CD')).status).toBe(200);
      expect(
        (
          await officer('post', `/api-clients/${id}/pause/lift`, {
            reason: 'Again',
          })
        ).status,
      ).toBe(409);

      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'api_client.pause_lift', subjectId: id },
      });
      expect(event?.reason).toBe('Integration fault fixed');
      expect(event?.actorUserId).not.toBeNull();
    });
  });

  // --- Runtime configuration (Requirement 14.1) -----------------------------------------

  describe('limit profiles', () => {
    it('start as the two client types of proposal §14.2', async () => {
      const response = await officer('get', '/rate-limits/profiles');
      expect(response.status).toBe(200);
      const byCode = new Map(
        (response.body.profiles as { code: string }[]).map((profile) => [
          profile.code,
          profile,
        ]),
      );
      for (const { code, ...values } of SYSTEM_RATE_LIMIT_PROFILES) {
        const { description: _description, ...numbers } = values;
        expect(byCode.get(code)).toMatchObject(numbers);
      }
    });

    it('are changed at runtime, applying to the next request', async () => {
      const { profile, token } = await organisation({
        verificationPerMinute: 1,
        burst: 1,
      });
      expect((await plate(token, 'E2ERLLIVE')).status).toBe(200);
      expect((await plate(token, 'E2ERLLIVE')).status).toBe(429);

      const body = {
        ...BASE,
        label: 'Raised',
        verificationPerMinute: 6000,
        reason: 'Raised after review',
      };
      expect(
        (await officer('put', `/rate-limits/profiles/${profile}`, body)).status,
      ).toBe(403);
      const changed = await officer(
        'put',
        `/rate-limits/profiles/${profile}`,
        body,
        'security',
      );
      expect(changed.status).toBe(200);
      expect(changed.body.profile).toMatchObject({
        code: profile,
        verificationPerMinute: 6000,
        clientCount: 1,
      });
      // The bucket refills at the new rate at once.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect((await plate(token, 'E2ERLLIVE')).status).toBe(200);

      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'rate_limit_profile.update' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(event?.reason).toBe('Raised after review');
      expect(event?.beforeValue).toMatchObject({ verificationPerMinute: 1 });
      expect(event?.afterValue).toMatchObject({ verificationPerMinute: 6000 });
    });

    it('refuses a number out of bounds, and a profile that does not exist', async () => {
      const { profile } = await organisation();
      expect(
        (
          await officer(
            'put',
            `/rate-limits/profiles/${profile}`,
            { ...BASE, label: 'Bad', burst: 0, reason: 'Testing bounds' },
            'security',
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await officer(
            'put',
            '/rate-limits/profiles/E2E_RATELIMIT_NONE',
            { ...BASE, label: 'None', reason: 'Testing absence' },
            'security',
          )
        ).status,
      ).toBe(404);
    });

    it('are given to an organisation with a reason, and audited', async () => {
      const { id } = await organisation();
      const set = await officer('put', `/api-clients/${id}/limits`, {
        rateLimitProfile: 'TRUSTED',
        dailyQuota: 2500,
        reason: 'Approved for roadside checks',
      });
      expect(set.status).toBe(200);
      expect(set.body.client.limits).toMatchObject({
        profile: { code: 'TRUSTED' },
        dailyQuota: 2500,
        dailyQuotaOverride: 2500,
      });
      expect(
        (
          await officer('put', `/api-clients/${id}/limits`, {
            rateLimitProfile: 'E2E_RATELIMIT_NONE',
            dailyQuota: null,
            reason: 'No such profile',
          })
        ).status,
      ).toBe(404);
      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'api_client.limits_change', subjectId: id },
      });
      expect(event?.afterValue).toEqual({
        rateLimitProfile: 'TRUSTED',
        dailyQuota: 2500,
      });
    });
  });

  // --- Request ids (proposal §14.3) ----------------------------------------------------

  describe('request ids', () => {
    it('refuse an external request without one, and spend no quota on it', async () => {
      const { id, token } = await organisation();
      expect((await plate(token, 'E2ERLNOID')).status).toBe(200);
      const bare = await external(
        token,
        'vehicle/plate',
        { plate_number: 'E2ERLNOID' },
        null,
      );
      expect(bare.status).toBe(400);
      expect(bare.body.error.details).toEqual([
        { field: 'X-Request-ID', message: expect.any(String) },
      ]);
      const log = await logOf(id);
      expect(log.at(-1)).toMatchObject({
        resultClass: 'NO_REQUEST_ID',
        statusCode: 400,
      });
      expect(await usedToday(id)).toBe(1);
    });

    it('carry the System’s own id beside the caller’s, in the answer and the log', async () => {
      const { id, token } = await organisation();
      const mine = requestId();
      const response = await plate(token, 'E2ERLIDS', mine);
      expect(response.status).toBe(200);
      expect(response.body.request_id).toBe(mine);
      const serverId = response.headers['x-server-request-id'];
      expect(serverId).toMatch(/^[0-9a-f-]{36}$/);
      expect(serverId).not.toBe(mine);
      const [row] = await logOf(id);
      expect(row).toMatchObject({ requestId: mine, serverRequestId: serverId });
    });
  });

  describe('housekeeping', () => {
    it('prunes counters and detection state whose window has passed', async () => {
      const { id, token } = await organisation();
      await plate(token, 'E2ERL900ZZ');
      const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await app.get(RateLimitService).prune(later);
      expect(
        await prisma.apiRateCounter.count({ where: { clientId: id } }),
      ).toBe(0);
      expect(
        await prisma.apiAbuseWindow.count({ where: { clientId: id } }),
      ).toBe(0);
      expect(
        await prisma.apiSequenceState.count({ where: { clientId: id } }),
      ).toBe(0);
    });
  });

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const clients = await prisma.apiClient.findMany({
      where: { organisationName: { contains: TAG } },
      select: { id: true },
    });
    const clientIds = clients.map((client) => client.id);

    await prisma.apiRequestLog.deleteMany({
      where: {
        OR: [
          { clientId: { in: clientIds } },
          { requestId: { startsWith: TAG } },
        ],
      },
    });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { subjectId: { in: clientIds } },
          { actorUserId: { in: userIds } },
          { requestId: { startsWith: TAG } },
        ],
      },
    });
    await prisma.apiClient.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.rateLimitProfile.deleteMany({
      where: { code: { startsWith: 'E2E_RATELIMIT_' } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

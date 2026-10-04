import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { generateApiToken } from './../src/api-client/api-token.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';

/**
 * Vehicle totals for outside organisations, end to end (PRD §13 —
 * `plans/14-aggregate-reporting.md`).
 *
 * The assertions that carry weight:
 *
 * - the grand total refuses any parameter (Requirement 13.2), and a filtered
 *   total refuses any filter that is not approved (13.1);
 * - a filtered total below 25 answers SUPPRESSED by the same route, status,
 *   and shape (criterion 9, Requirement 13.4), and any other is rounded;
 * - only vehicles declared and onboarded count: never one merely on record
 *   (criterion 14), retired, suspended, or without a sticker;
 * - no answer names a vehicle or mentions declaration (criterion 15).
 *
 * The fixture builds its own council, zone, and two branches, so the
 * filtered totals are exact whatever else is in the database.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-aggregate';
const LIMITS_CODE = 'E2E_AGGREGATE_LIMITS';
const ONBOARDED = new Date('2026-08-15T09:00:00Z');

describe('Vehicle totals (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const categories: string[] = [];
  const answers: string[] = [];
  let serial = 0;

  beforeAll(async () => {
    await cleanUp();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    async function node(
      key: string,
      level: 'COUNCIL' | 'ZONE' | 'BRANCH',
      parent: { id: string; path: string } | null,
    ) {
      const row = await prisma.organisation.create({
        data: {
          name: `${key} ${TAG}`,
          level,
          parentId: parent?.id ?? null,
          path: `placeholder-${key}`,
        },
      });
      const path = `${parent?.path ?? '/'}${row.id}/`;
      await prisma.organisation.update({
        where: { id: row.id },
        data: { path },
      });
      ids[key] = row.id;
      return { id: row.id, path };
    }
    const council = await node('council', 'COUNCIL', null);
    const zone = await node('zone', 'ZONE', council);
    const wide = await node('wide', 'BRANCH', zone);
    const small = await node('small', 'BRANCH', zone);

    const rows = await prisma.vehicleCategory.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      take: 2,
    });
    categories.push(...rows.map((row) => row.code));
    const routeType = await prisma.routeType.findUniqueOrThrow({
      where: { code: 'INTERCITY' },
    });

    async function vehicles(
      count: number,
      branchId: string,
      options: {
        status?: 'ACTIVE' | 'ON_RECORD' | 'RETIRED' | 'SUSPENDED';
        declared?: boolean;
        sticker?: boolean;
        retiredAt?: Date;
        category?: string;
      } = {},
    ) {
      const category = rows.find(
        (row) => row.code === (options.category ?? rows[0]!.code),
      )!;
      for (let index = 0; index < count; index += 1) {
        const plate = `E2EAGG${String(++serial).padStart(4, '0')}`;
        const vehicle = await prisma.vehicle.create({
          data: {
            plateNumberDisplay: plate,
            plateNumberNormalized: plate,
            branchId,
            status: options.status ?? 'ACTIVE',
            declaredAt: options.declared === false ? null : ONBOARDED,
            retiredAt: options.retiredAt ?? null,
            isLegacyImport: options.status === 'ON_RECORD',
            vehicleCategoryId: category.id,
            routeTypeId: routeType.id,
          },
        });
        if (options.sticker !== false) {
          await prisma.sticker.create({
            data: {
              stickerQrId: `${TAG}-${plate}`,
              status: 'ACTIVE',
              signingKeyId: 'k1',
              templateVersion: 'v1',
              vehicleId: vehicle.id,
              plateNumberAtIssue: plate,
              attachedAt: ONBOARDED,
            },
          });
        }
      }
    }

    // The wide branch: 30 counted, 20 of one category and 10 of the other.
    await vehicles(20, wide.id);
    await vehicles(10, wide.id, { category: rows[1]!.code });
    // None of these counts now.
    await vehicles(4, wide.id, { status: 'ON_RECORD', declared: false });
    await vehicles(3, wide.id, { sticker: false });
    await vehicles(2, wide.id, { status: 'SUSPENDED' });
    await vehicles(2, wide.id, {
      status: 'RETIRED',
      retiredAt: new Date('2026-09-10T09:00:00Z'),
    });
    // The small branch: 5 counted.
    await vehicles(5, small.id);

    await prisma.rateLimitProfile.create({
      data: {
        code: LIMITS_CODE,
        label: 'E2E generous',
        verificationPerMinute: 6000,
        aggregatePerMinute: 6000,
        burst: 1000,
        hourlyQuota: null,
        dailyQuota: 10_000_000,
        windowMinutes: 10,
        forgeryThreshold: 100_000,
        missThreshold: 1_000_000,
        missPercent: 100,
        sequenceThreshold: 100_000,
        sequenceReach: 1,
        pauseMinutes: 1,
      },
    });
    const profileId = (
      await prisma.disclosureProfile.findUniqueOrThrow({
        where: { code: 'AGGREGATE_REPORTING' },
      })
    ).id;
    async function organisation(key: string, scopes: readonly string[]) {
      const client = await prisma.apiClient.create({
        data: {
          organisationName: `${key} ${TAG}`,
          status: 'ACTIVE',
          businessPurpose: 'End-to-end fixture for vehicle totals.',
          technicalContactName: 'Fixture contact',
          technicalContactEmail: 'fixture@example.test',
          agreementReference: 'DSA/E2E',
          agreementDate: new Date('2026-09-01T00:00:00Z'),
          approvedAt: new Date(),
          disclosureProfileId: profileId,
          rateLimitProfile: LIMITS_CODE,
          allowedIpRanges: [],
          scopes: { create: scopes.map((scope) => ({ scope })) },
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
      tokens[key] = generated.token;
      ids[`client:${key}`] = client.id;
    }
    await organisation('both', [
      'aggregate:vehicles:total',
      'aggregate:vehicles:read',
      'organization:metadata:read',
    ]);
    await organisation('totalOnly', ['aggregate:vehicles:total']);
    await organisation('filteredOnly', ['aggregate:vehicles:read']);
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  async function get(path: string, who = 'both', query: object = {}) {
    const response = await request(server)
      .get(`/api/v1/${path}`)
      .query(query)
      .set('Authorization', `Bearer ${tokens[who]}`)
      .set('X-Request-ID', `${TAG}-${randomUUID()}`);
    // A refusal echoes only the caller's own request, and the metadata names
    // the Union's branches (other suites' fixtures among them); the totals
    // are what criterion 15 is about.
    if (response.status === 200 && path.startsWith('aggregates/')) {
      answers.push(response.text);
    }
    return response;
  }
  const filtered = (query: object, who = 'both') =>
    get('aggregates/vehicles', who, query);
  const count = (response: { body: { totals: { vehicle_count: unknown } } }) =>
    response.body.totals.vehicle_count;

  describe('access', () => {
    it('answers each tier only to its own scope', async () => {
      expect(
        (await get('aggregates/vehicles/total', 'filteredOnly')).status,
      ).toBe(403);
      expect((await filtered({}, 'totalOnly')).status).toBe(403);
      expect((await get('metadata/organisation', 'totalOnly')).status).toBe(
        403,
      );
      await request(server)
        .get('/api/v1/aggregates/vehicles/total')
        .set('X-Request-ID', `${TAG}-none`)
        .expect(401);
    });
  });

  describe('the grand total (Requirement 13.2)', () => {
    it('is an exact count, with no rounding', async () => {
      const response = await get('aggregates/vehicles/total', 'totalOnly');
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual([
        'data_as_of',
        'filters_applied',
        'limitation',
        'request_id',
        'result',
        'statement',
        'totals',
        'verified_at',
      ]);
      expect(response.body.result).toBe('AGGREGATE_ONLY');
      expect(Number.isInteger(count(response))).toBe(true);
      expect(count(response) as number).toBeGreaterThanOrEqual(35);
    });

    it('refuses any parameter, rather than ignoring it', async () => {
      for (const query of [
        { zone_id: ids.zone },
        { period: '2026-09' },
        { anything: '1' },
      ]) {
        const response = await get('aggregates/vehicles/total', 'both', query);
        expect(response.status).toBe(400);
      }
    });
  });

  describe('a filtered total', () => {
    it('counts only vehicles declared and onboarded, rounded (criterion 14)', async () => {
      // 30 counted; 4 on record, 3 without a sticker, 2 suspended, and 2
      // retired are not.
      const response = await filtered({ branch_id: ids.wide });
      expect(response.status).toBe(200);
      expect(count(response)).toBe(30);
      expect(response.body.rounded_to_nearest).toBe(10);
      expect(response.body.filters_applied).toEqual({ branch_id: ids.wide });
    });

    it('rounds a zone’s 35 to 40, so a branch cannot be subtracted out', async () => {
      const zone = await filtered({ zone_id: ids.zone });
      expect(count(zone)).toBe(40);
      expect(count(await filtered({ branch_id: ids.wide }))).toBe(30);
      // 40 - 30 is not the small branch's 5, which is suppressed.
      expect(count(await filtered({ branch_id: ids.small }))).toBe(
        'SUPPRESSED',
      );
    });

    it('suppresses a total below 25 by the same route, status, and shape (Requirement 13.4)', async () => {
      const shown = await filtered({ branch_id: ids.wide });
      const hidden = await filtered({
        branch_id: ids.wide,
        vehicle_category: categories[1],
      });
      expect(hidden.status).toBe(200);
      expect(count(hidden)).toBe('SUPPRESSED');
      expect(Object.keys(hidden.body).sort()).toEqual(
        Object.keys(shown.body).sort(),
      );
      expect(
        count(
          await filtered({
            branch_id: ids.wide,
            vehicle_category: categories[0],
          }),
        ),
      ).toBe('SUPPRESSED');
    });

    it('counts a period as at its end', async () => {
      // Before anything was onboarded.
      expect(
        count(await filtered({ branch_id: ids.wide, period: '2026-07' })),
      ).toBe('SUPPRESSED');
      // At the end of August the two retired vehicles still counted: 32.
      const august = await filtered({ branch_id: ids.wide, period: '2026-08' });
      expect(count(august)).toBe(30);
      expect(august.body.data_as_of).toBe('2026-08-31T22:59:59.999Z');
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'aggregate.external.vehicles',
          requestId: august.request.getHeader('X-Request-ID') as string,
        },
      });
      expect(audit.afterValue).toMatchObject({ count: 32, answered: 30 });
      expect(
        count(await filtered({ branch_id: ids.wide, period: '2026-Q3' })),
      ).toBe(30);
    });

    it('refuses a period that has not begun', async () => {
      const response = await filtered({ period: '2999' });
      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        { field: 'period', message: expect.any(String) },
      ]);
    });

    it('refuses any filter that is not approved (Requirement 13.1)', async () => {
      for (const query of [
        { unit_id: ids.wide },
        { declaration_status: 'ACTIVE' },
        { plate_number: 'E2EAGG0001' },
        { page: '2' },
        { zone_id: ids.zone, branch_id: ids.wide },
        { period: '2026-09-01' },
      ]) {
        expect((await filtered(query)).status, JSON.stringify(query)).toBe(400);
      }
    });

    it('refuses a zone, branch, or category not in the metadata', async () => {
      expect((await filtered({ zone_id: ids.wide })).status).toBe(400);
      expect((await filtered({ branch_id: ids.zone })).status).toBe(400);
      expect((await filtered({ zone_id: randomUUID() })).status).toBe(400);
      expect(
        (await filtered({ vehicle_category: 'E2E_NO_SUCH_CATEGORY' })).status,
      ).toBe(400);
    });
  });

  describe('the metadata', () => {
    it('names the zones, branches, and categories a filter may use', async () => {
      const response = await get('metadata/organisation');
      expect(response.status).toBe(200);
      expect(response.body.zones).toContainEqual({
        id: ids.zone,
        name: `zone ${TAG}`,
      });
      expect(response.body.branches).toContainEqual({
        id: ids.wide,
        name: `wide ${TAG}`,
        zone_id: ids.zone,
      });
      expect(
        (response.body.vehicle_categories as { code: string }[]).map(
          (category) => category.code,
        ),
      ).toEqual(expect.arrayContaining(categories));
    });
  });

  describe('every answer', () => {
    it('is logged and audited against the organisation, never as a check', async () => {
      const log = await prisma.apiRequestLog.findMany({
        where: { clientId: ids['client:both'] },
      });
      expect(log.map((row) => row.resultClass)).toEqual(
        expect.arrayContaining([
          'TOTAL',
          'SUPPRESSED',
          'METADATA',
          'INVALID_REQUEST',
        ]),
      );
      expect(
        await prisma.apiClientPause.count({
          where: { clientId: ids['client:both'] },
        }),
      ).toBe(0);
    });

    it('names no vehicle, and says nothing of declaration (criterion 15)', () => {
      expect(answers.length).toBeGreaterThan(10);
      const all = answers.join('\n');
      expect(all).not.toContain('E2EAGG');
      expect(all.toLowerCase()).not.toContain('declar');
      expect(all.toLowerCase()).not.toContain('dues');
    });
  });

  async function cleanUp(): Promise<void> {
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
      where: { requestId: { startsWith: TAG } },
    });
    await prisma.apiClient.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.rateLimitProfile.deleteMany({ where: { code: LIMITS_CODE } });
    await prisma.sticker.deleteMany({
      where: { stickerQrId: { startsWith: TAG } },
    });
    await prisma.vehicle.deleteMany({
      where: { plateNumberNormalized: { startsWith: 'E2EAGG' } },
    });
    const nodes = await prisma.organisation.findMany({
      where: { name: { endsWith: TAG } },
      select: { id: true, level: true },
    });
    for (const level of ['BRANCH', 'ZONE', 'COUNCIL'] as const) {
      await prisma.organisation.deleteMany({
        where: {
          id: {
            in: nodes.filter((row) => row.level === level).map((row) => row.id),
          },
        },
      });
    }
  }
});

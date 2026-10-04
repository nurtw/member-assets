import { randomUUID } from 'node:crypto';

import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_DISCLOSURE_PROFILES } from '@nurtw/contracts';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashApiToken } from './../src/api-client/api-token.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import {
  RequireScope,
  type ExternalRequest,
} from './../src/auth/require-scope.decorator.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';

/**
 * API clients and scopes, end to end (PRD §12.1, §15 —
 * `plans/11-api-clients-and-scopes.md`).
 *
 * The assertions that carry weight:
 *
 * - an organisation is approved only with an agreement, a profile, and a
 *   scope from the catalogue (Requirements 12.4, 12.8);
 * - a token is returned once and stored only as a hash (Requirement 12.1);
 * - revoking a token, or suspending or revoking its organisation, holds on the
 *   very next request (acceptance criterion 11);
 * - a session never satisfies a scope route and a token never satisfies a
 *   permission route (Decisions 9.1, 9.8);
 * - a profile can name no internal-only field (Requirement 12.7).
 *
 * No external route exists until item 12, so the token path is exercised
 * through the two probe routes below, which exist only in this suite.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-apiclient';
const PASSWORD = 'e2e-fixture-password-1';
const PROFILE_CODE = 'E2E_APICLIENT_INSURER';
const TOKEN_FORM = /^nurtw_[a-hjkmnp-z2-9]{8}_[A-Za-z0-9_-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Limits this suite's organisations are held to: high enough that no test
 * here meets one. Limits themselves are `rate-limit.e2e-spec.ts`'s.
 */
const LIMITS_CODE = 'E2E_APICLIENT_LIMITS';
const GENEROUS_LIMITS = {
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
};

@Controller('e2e-probe')
class ProbeController {
  /** Answers with the client the guard resolved, as a scope route sees it. */
  @RequireScope('vehicle:verify:plate')
  @Get('plate')
  plate(@Req() request: ExternalRequest) {
    return { client: request.apiClient };
  }

  @RequireScope('aggregate:vehicles:total')
  @Get('total')
  total() {
    return { ok: true };
  }
}

interface TokenSummary {
  id: string;
  prefix: string;
  state: string;
  expiresAt: string;
  retiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  expiringSoon: boolean;
}

interface ClientDetail {
  id: string;
  organisationName: string;
  status: string;
  disclosureProfile: { id: string; code: string; label: string } | null;
  scopes: string[];
  currentToken: TokenSummary | null;
  allowedIpRanges: string[];
  agreementReference: string | null;
  agreementDate: string | null;
  approvedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  statusReason: string | null;
  tokens: TokenSummary[];
}

interface Profile {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  fields: string[];
  clientCount: number;
}

describe('API clients and scopes (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  /** Every officer-route response body, to prove none carries a token. */
  const seen: string[] = [];
  /** Every token issued here, to prove none is stored or repeated. */
  const issued: string[] = [];

  const profiles: Record<string, Profile> = {};
  let clientId: string;
  let token: string;
  let tokenId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await cleanUp();
    await prisma.rateLimitProfile.create({
      data: { code: LIMITS_CODE, label: 'E2E generous', ...GENEROUS_LIMITS },
    });

    const council = await prisma.organisation.findFirstOrThrow({
      where: { level: 'COUNCIL' },
    });
    const users: Record<string, readonly string[]> = {
      // Everything PRD §16 gives the API administrator.
      admin: [
        'api_client.read',
        'api_client.manage',
        'api_token.manage',
        'disclosure_profile.read',
        'disclosure_profile.manage',
      ],
      // Registers and approves, and cannot issue a token.
      registrar: ['api_client.read', 'api_client.manage'],
      reader: ['api_client.read', 'disclosure_profile.read'],
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
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- Helpers ---------------------------------------------------------------

  /** An officer route, by session. The body is kept for the leak check. */
  async function call(
    method: 'get' | 'post' | 'patch' | 'put',
    path: string,
    body?: object,
    who = 'admin',
  ) {
    const pending = request(server)
      [method](`/api/v1${path}`)
      .set('Cookie', cookies[who]!);
    const response = await (body ? pending.send(body) : pending);
    seen.push(response.text);
    return response;
  }

  /** A route that returns a token. Deliberately kept out of `seen`. */
  async function mint(path: string, body?: object, who = 'admin') {
    const pending = request(server)
      .post(`/api/v1${path}`)
      .set('Cookie', cookies[who]!);
    const response = await (body ? pending.send(body) : pending);
    if (typeof response.body?.token === 'string') {
      issued.push(response.body.token as string);
    } else {
      seen.push(response.text);
    }
    return response;
  }

  /** An external route, by API token and nothing else. */
  function probe(bearer: string | null, route = 'plate') {
    const pending = request(server)
      .get(`/api/v1/e2e-probe/${route}`)
      .set('X-Request-ID', `${TAG}-${randomUUID()}`);
    return bearer === null
      ? pending
      : pending.set('Authorization', `Bearer ${bearer}`);
  }

  async function detail(id = clientId): Promise<ClientDetail> {
    const response = await call('get', `/api-clients/${id}`);
    expect(response.status).toBe(200);
    return response.body.client as ClientDetail;
  }

  async function register(name: string, who = 'admin') {
    const response = await call(
      'post',
      '/api-clients',
      {
        organisationName: `${name} ${TAG}`,
        businessPurpose:
          'Confirming that an insured vehicle carries a sticker.',
        technicalContact: { name: 'Ada Obi', email: 'ada@example.test' },
      },
      who,
    );
    const id = (response.body as { client?: { id?: string } }).client?.id;
    if (id) {
      await prisma.apiClient.update({
        where: { id },
        data: { rateLimitProfile: LIMITS_CODE },
      });
    }
    return response;
  }

  const approval = (overrides: object = {}) => ({
    disclosureProfileId: profiles.OPERATIONAL_VERIFICATION!.id,
    scopes: ['vehicle:verify:plate'],
    agreementReference: 'DSA/2026/014',
    agreementDate: '2026-09-01',
    ...overrides,
  });

  async function denials(resultClass: string) {
    return prisma.apiRequestLog.findMany({
      where: { endpoint: { contains: 'e2e-probe' }, resultClass },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Disclosure profiles -----------------------------------------------------

  describe('disclosure profiles', () => {
    it('holds the four profiles of PRD §15, exactly as the catalogue defines them', async () => {
      const response = await call('get', '/disclosure-profiles');
      expect(response.status).toBe(200);

      for (const profile of response.body.profiles as Profile[]) {
        profiles[profile.code] = profile;
      }
      // The migration inserted these rows. This is what keeps it, the seed,
      // and `SYSTEM_DISCLOSURE_PROFILES` in step.
      for (const expected of SYSTEM_DISCLOSURE_PROFILES) {
        expect(profiles[expected.code]).toMatchObject({
          code: expected.code,
          label: expected.label,
          description: expected.description,
          isSystem: true,
          isActive: true,
          fields: expected.fields,
        });
      }
      expect(profiles.MINIMAL_VERIFICATION!.fields).toEqual([]);
      expect(Object.keys(profiles).join()).not.toMatch(/INTERNAL/);
    });

    it('never lets a system profile be amended', async () => {
      const minimal = profiles.MINIMAL_VERIFICATION!;
      const response = await call(
        'patch',
        `/disclosure-profiles/${minimal.id}`,
        {
          fields: ['plate_number', 'vehicle_category'],
          reason: 'Trying to widen the minimal profile',
        },
      );
      expect(response.status).toBe(409);

      const rows = await prisma.disclosureField.count({
        where: { profileId: minimal.id },
      });
      expect(rows).toBe(0);
    });

    it('composes a profile from external-admissible fields, and audits it', async () => {
      const response = await call('post', '/disclosure-profiles', {
        code: PROFILE_CODE,
        label: 'Insurer standard',
        description: 'For insurers.',
        fields: ['attached_at', 'vehicle_category'],
        isSystem: true,
      });
      expect(response.status).toBe(201);
      const profile = response.body.profile as Profile;
      profiles[PROFILE_CODE] = profile;

      // Catalogue order, whatever order was sent; never a system profile.
      expect(profile.fields).toEqual(['vehicle_category', 'attached_at']);
      expect(profile.isSystem).toBe(false);
      expect(profile.clientCount).toBe(0);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'disclosure_profile.create', subjectId: profile.id },
      });
      expect(event.afterValue).toMatchObject({
        code: PROFILE_CODE,
        fields: ['vehicle_category', 'attached_at'],
      });
    });

    it.each([
      'declaration_status',
      'member_name',
      'membership_number',
      'vehicle_id',
      'registered_plate',
      'owner_phone',
    ])(
      'refuses to name %s, which no outside organisation may be told',
      async (field) => {
        const response = await call('post', '/disclosure-profiles', {
          code: 'E2E_APICLIENT_TOO_MUCH',
          label: 'Too much',
          fields: ['vehicle_category', field],
        });
        expect(response.status).toBe(400);

        const response2 = await call(
          'patch',
          `/disclosure-profiles/${profiles[PROFILE_CODE]!.id}`,
          { fields: [field], reason: 'Trying to add an internal field' },
        );
        expect(response2.status).toBe(400);

        expect(
          await prisma.disclosureProfile.count({
            where: { code: 'E2E_APICLIENT_TOO_MUCH' },
          }),
        ).toBe(0);
        expect(
          await prisma.disclosureField.count({ where: { fieldPath: field } }),
        ).toBe(0);
      },
    );

    it('refuses a second profile under the same code', async () => {
      const response = await call('post', '/disclosure-profiles', {
        code: PROFILE_CODE,
        label: 'Duplicate',
        fields: [],
      });
      expect(response.status).toBe(409);
    });

    it('amends a composed profile only with a reason, and records before and after', async () => {
      const id = profiles[PROFILE_CODE]!.id;
      expect(
        (await call('patch', `/disclosure-profiles/${id}`, { fields: [] }))
          .status,
      ).toBe(400);

      const response = await call('patch', `/disclosure-profiles/${id}`, {
        fields: ['vehicle_category', 'sticker_status'],
        reason: 'Agreed with the Union on 3 October',
      });
      expect(response.status).toBe(200);
      expect(response.body.profile.fields).toEqual([
        'vehicle_category',
        'sticker_status',
      ]);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'disclosure_profile.update', subjectId: id },
      });
      expect(event.reason).toBe('Agreed with the Union on 3 October');
      expect(event.beforeValue).toMatchObject({
        fields: ['vehicle_category', 'attached_at'],
      });
      expect(event.afterValue).toMatchObject({
        fields: ['vehicle_category', 'sticker_status'],
        organisationsAffected: 0,
      });
    });

    it('needs the manage permission to compose or amend', async () => {
      const created = await call(
        'post',
        '/disclosure-profiles',
        { code: 'E2E_APICLIENT_READER', label: 'By a reader', fields: [] },
        'reader',
      );
      expect(created.status).toBe(403);
      expect(
        (await call('get', '/disclosure-profiles', undefined, 'reader')).status,
      ).toBe(200);
      // An officer who registers organisations sees the profiles on offer
      // without the permission to read every profile.
      expect(
        (await call('get', '/disclosure-profiles', undefined, 'registrar'))
          .status,
      ).toBe(403);
      const offered = await call(
        'get',
        '/api-clients/profiles',
        undefined,
        'registrar',
      );
      expect(offered.status).toBe(200);
      expect(
        (offered.body.profiles as Profile[]).map((profile) => profile.code),
      ).toEqual(expect.arrayContaining(['MINIMAL_VERIFICATION', PROFILE_CODE]));
    });
  });

  // --- Registration and approval -----------------------------------------------

  describe('registering and approving an organisation', () => {
    it('registers an organisation as pending, whatever the body claims', async () => {
      const response = await call('post', '/api-clients', {
        organisationName: `Insurer ${TAG}`,
        businessPurpose:
          'Confirming that an insured vehicle carries a sticker.',
        technicalContact: {
          name: 'Ada Obi',
          email: 'ada@example.test',
          phone: '0800 000 0000',
        },
        status: 'ACTIVE',
        scopes: ['vehicle:verify:plate'],
        disclosureProfileId: profiles.OPERATIONAL_VERIFICATION!.id,
        agreementReference: 'SMUGGLED',
      });
      expect(response.status).toBe(201);

      const client = response.body.client as ClientDetail;
      clientId = client.id;
      await prisma.apiClient.update({
        where: { id: clientId },
        data: { rateLimitProfile: LIMITS_CODE },
      });
      expect(client).toMatchObject({
        status: 'PENDING',
        scopes: [],
        disclosureProfile: null,
        currentToken: null,
        agreementReference: null,
        approvedBy: null,
        tokens: [],
        allowedIpRanges: [],
      });

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.register', subjectId: clientId },
      });
      expect(event.afterValue).toMatchObject({ status: 'PENDING' });
    });

    it('needs the manage permission to register, and a session to do anything', async () => {
      expect((await register('By a reader', 'reader')).status).toBe(403);
      await request(server).get('/api/v1/api-clients').expect(401);
      await request(server).post('/api/v1/api-clients').send({}).expect(401);
    });

    it('refuses a token to an organisation nobody has approved', async () => {
      const response = await mint(`/api-clients/${clientId}/tokens`);
      expect(response.status).toBe(409);
      expect(await prisma.apiToken.count({ where: { clientId } })).toBe(0);
    });

    it('cannot make a pending organisation active except by approval', async () => {
      const response = await call('post', `/api-clients/${clientId}/status`, {
        status: 'ACTIVE',
        reason: 'Skipping the approval',
      });
      expect(response.status).toBe(409);
      expect((await detail()).status).toBe('PENDING');
    });

    it('refuses an approval with no data-sharing agreement (EXT-07)', async () => {
      for (const missing of ['agreementReference', 'agreementDate'] as const) {
        const body: Record<string, unknown> = approval();
        delete body[missing];
        const response = await call(
          'post',
          `/api-clients/${clientId}/approve`,
          body,
        );
        expect(response.status).toBe(400);
      }
      const future = await call(
        'post',
        `/api-clients/${clientId}/approve`,
        approval({ agreementDate: '2999-01-01' }),
      );
      expect(future.status).toBe(400);
      expect(future.body.error.details).toEqual([
        expect.objectContaining({ field: 'agreementDate' }),
      ]);
      expect((await detail()).status).toBe('PENDING');
    });

    it.each([
      [['database:read']],
      [['member:read:all']],
      [['vehicle:verify:plate', '*']],
      [[]],
    ])('refuses to grant %j (Requirement 12.4)', async (scopes) => {
      const response = await call(
        'post',
        `/api-clients/${clientId}/approve`,
        approval({ scopes }),
      );
      expect(response.status).toBe(400);
      expect(await prisma.apiClientScope.count({ where: { clientId } })).toBe(
        0,
      );
    });

    it('refuses a profile that does not exist', async () => {
      const response = await call(
        'post',
        `/api-clients/${clientId}/approve`,
        approval({
          disclosureProfileId: '8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e',
        }),
      );
      expect(response.status).toBe(404);
      expect((await detail()).status).toBe('PENDING');
    });

    it('approves with a profile, scopes, and the agreement, and records who approved', async () => {
      const response = await call(
        'post',
        `/api-clients/${clientId}/approve`,
        approval({
          scopes: ['vehicle:verify:combined', 'vehicle:verify:plate'],
        }),
        'registrar',
      );
      expect(response.status).toBe(201);

      const client = response.body.client as ClientDetail;
      expect(client).toMatchObject({
        status: 'ACTIVE',
        // Catalogue order, whatever order was sent.
        scopes: ['vehicle:verify:plate', 'vehicle:verify:combined'],
        agreementReference: 'DSA/2026/014',
        agreementDate: '2026-09-01',
        // Approval issues no token.
        currentToken: null,
        tokens: [],
      });
      expect(client.disclosureProfile?.code).toBe('OPERATIONAL_VERIFICATION');
      expect(client.approvedBy?.fullName).toBe(`registrar ${TAG}`);
      expect(client.approvedAt).not.toBeNull();

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.approve', subjectId: clientId },
      });
      expect(event.beforeValue).toMatchObject({ status: 'PENDING' });
      expect(event.afterValue).toMatchObject({
        status: 'ACTIVE',
        disclosureProfile: 'OPERATIONAL_VERIFICATION',
        agreementReference: 'DSA/2026/014',
      });
    });

    it('approves once', async () => {
      const response = await call(
        'post',
        `/api-clients/${clientId}/approve`,
        approval(),
      );
      expect(response.status).toBe(409);
    });

    it('answers 404 for an organisation that does not exist, and 400 for a malformed id', async () => {
      expect(
        (await call('get', '/api-clients/8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e'))
          .status,
      ).toBe(404);
      expect((await call('get', '/api-clients/not-an-id')).status).toBe(400);
    });
  });

  // --- Tokens ------------------------------------------------------------------

  describe('tokens', () => {
    it('needs its own permission to issue one', async () => {
      const response = await mint(
        `/api-clients/${clientId}/tokens`,
        undefined,
        'registrar',
      );
      expect(response.status).toBe(403);
      expect(await prisma.apiToken.count({ where: { clientId } })).toBe(0);
    });

    it('issues a token once, and stores only its hash (Requirement 12.1)', async () => {
      const response = await mint(`/api-clients/${clientId}/tokens`);
      expect(response.status).toBe(201);

      token = response.body.token as string;
      const summary = response.body.summary as TokenSummary;
      tokenId = summary.id;
      expect(token).toMatch(TOKEN_FORM);
      expect(summary).toMatchObject({
        state: 'CURRENT',
        prefix: token.slice(0, 14),
        lastUsedAt: null,
        expiringSoon: false,
      });
      // 90 days (PRD §23.12), from the `api_token.expiry_days` setting.
      const days =
        (new Date(summary.expiresAt).getTime() - Date.now()) / DAY_MS;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThan(90.1);

      const row = await prisma.apiToken.findUniqueOrThrow({
        where: { id: tokenId },
      });
      expect(row.tokenHash).toBe(hashApiToken(token));
      expect(JSON.stringify(row)).not.toContain(token);
      expect(JSON.stringify(row)).not.toContain(token.slice(15));
    });

    it('never returns the token again', async () => {
      const client = await detail();
      expect(client.currentToken?.id).toBe(tokenId);
      expect(client.tokens).toHaveLength(1);

      const list = await call('get', '/api-clients');
      expect(list.status).toBe(200);
      expect(JSON.stringify(client)).not.toContain(token.slice(15));
      expect(list.text).not.toContain(token.slice(15));
      expect(list.text).not.toContain(hashApiToken(token));
    });

    it('holds one token in use: a second is refused, and replacing it is rotation', async () => {
      const response = await mint(`/api-clients/${clientId}/tokens`);
      expect(response.status).toBe(409);
      expect(await prisma.apiToken.count({ where: { clientId } })).toBe(1);
    });

    it('authenticates a scope route, and hands it the profile’s fields', async () => {
      const response = await probe(token).expect(200);
      expect(response.body.client).toEqual({
        clientId,
        tokenId,
        organisationName: `Insurer ${TAG}`,
        scopes: expect.arrayContaining([
          'vehicle:verify:plate',
          'vehicle:verify:combined',
        ]),
        disclosureProfileId: profiles.OPERATIONAL_VERIFICATION!.id,
        permittedFields: expect.arrayContaining([
          'plate_number',
          'vehicle_category',
          'sticker_status',
          'organizational_unit',
        ]),
        rateLimitProfile: LIMITS_CODE,
        dailyQuota: null,
      });
      expect(response.body.client.permittedFields).toHaveLength(4);

      expect((await detail()).currentToken?.lastUsedAt).not.toBeNull();
    });

    it('answers 403 for a scope the organisation does not hold, and records it', async () => {
      await probe(token, 'total').expect(403);

      const [row] = await denials('SCOPE_DENIED');
      expect(row).toMatchObject({
        clientId,
        tokenId,
        scope: 'aggregate:vehicles:total',
        statusCode: 403,
        endpoint: 'GET /api/v1/e2e-probe/total',
      });
    });
  });

  // --- The two credentials never cross -------------------------------------------

  describe('sessions and tokens (Decisions 9.1 and 9.8)', () => {
    it('does not let a session reach a scope route', async () => {
      await request(server)
        .get('/api/v1/e2e-probe/plate')
        .set('Cookie', cookies.admin!)
        .expect(401);
    });

    it('does not let a token reach a permission route', async () => {
      for (const path of [
        '/api-clients',
        `/api-clients/${clientId}`,
        '/auth/me',
      ]) {
        await request(server)
          .get(`/api/v1${path}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
      // Nor approve, re-scope, or issue for itself.
      await request(server)
        .post(`/api/v1/api-clients/${clientId}/tokens`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      await request(server)
        .put(`/api/v1/api-clients/${clientId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(401);
    });

    it('reads a token from the Authorization header and nowhere else (Requirement 12.2)', async () => {
      await request(server)
        .get(`/api/v1/e2e-probe/plate?token=${token}`)
        .expect(401);
      await request(server)
        .get(`/api/v1/e2e-probe/plate?access_token=${token}`)
        .expect(401);
      await request(server)
        .get('/api/v1/e2e-probe/plate')
        .set('Cookie', `nurtw_session=${token}`)
        .expect(401);
      await request(server)
        .get('/api/v1/e2e-probe/plate')
        .set('Authorization', token)
        .expect(401);
      await request(server)
        .get('/api/v1/e2e-probe/plate')
        .set('Authorization', `Basic ${token}`)
        .expect(401);
    });

    it('gives every bad credential the same answer, and keeps the reason to itself', async () => {
      const unknown = `nurtw_abcdefgh_${'A'.repeat(43)}`;
      const answers = [
        await probe(null),
        await probe('not-a-token'),
        await probe(unknown),
      ];

      for (const answer of answers) {
        expect(answer.status).toBe(401);
        expect(answer.body.error.code).toBe('UNAUTHORIZED');
        expect(answer.body.error.message).toBe(answers[0]!.body.error.message);
        expect(Object.keys(answer.body.error).sort()).toEqual([
          'code',
          'message',
          'requestId',
        ]);
      }

      // The reason is in the access log, against no client.
      for (const reason of ['NO_TOKEN', 'MALFORMED_TOKEN', 'UNKNOWN_TOKEN']) {
        const [row] = await denials(reason);
        expect(row).toMatchObject({
          clientId: null,
          tokenId: null,
          statusCode: 401,
          scope: 'vehicle:verify:plate',
        });
      }
    });
  });

  // --- Changes that must hold on the next request --------------------------------

  describe('changing what an organisation may do', () => {
    it('narrows the scopes at once, with a reason, before and after', async () => {
      const without = await call('put', `/api-clients/${clientId}/access`, {
        disclosureProfileId: profiles.OPERATIONAL_VERIFICATION!.id,
        scopes: ['vehicle:verify:combined'],
      });
      expect(without.status).toBe(400);

      const response = await call('put', `/api-clients/${clientId}/access`, {
        disclosureProfileId: profiles.OPERATIONAL_VERIFICATION!.id,
        scopes: ['vehicle:verify:combined'],
        reason: 'Plate checks withdrawn pending review',
      });
      expect(response.status).toBe(200);
      expect(response.body.client.scopes).toEqual(['vehicle:verify:combined']);

      // The same token, the very next request.
      await probe(token).expect(403);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.access_change', subjectId: clientId },
        orderBy: { createdAt: 'desc' },
      });
      expect(event.reason).toBe('Plate checks withdrawn pending review');
      expect(event.beforeValue).toMatchObject({
        scopes: ['vehicle:verify:plate', 'vehicle:verify:combined'],
      });
      expect(event.afterValue).toMatchObject({
        scopes: ['vehicle:verify:combined'],
      });
    });

    it('changes the profile at once, and what the profile holds at once', async () => {
      const response = await call('put', `/api-clients/${clientId}/access`, {
        disclosureProfileId: profiles[PROFILE_CODE]!.id,
        scopes: ['vehicle:verify:plate'],
        reason: 'Moved to the insurer profile',
      });
      expect(response.status).toBe(200);
      expect(response.body.client.disclosureProfile.code).toBe(PROFILE_CODE);

      const first = await probe(token).expect(200);
      expect([...first.body.client.permittedFields].sort()).toEqual([
        'sticker_status',
        'vehicle_category',
      ]);

      const amended = await call(
        'patch',
        `/disclosure-profiles/${profiles[PROFILE_CODE]!.id}`,
        { fields: ['vehicle_category'], reason: 'Sticker status withdrawn' },
      );
      expect(amended.status).toBe(200);
      // The audit event says how many organisations the change reached.
      const event = await prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'disclosure_profile.update',
          subjectId: profiles[PROFILE_CODE]!.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(event.afterValue).toMatchObject({ organisationsAffected: 1 });

      const second = await probe(token).expect(200);
      expect(second.body.client.permittedFields).toEqual(['vehicle_category']);
    });

    it('refuses to withdraw a profile an organisation still holds', async () => {
      const response = await call(
        'patch',
        `/disclosure-profiles/${profiles[PROFILE_CODE]!.id}`,
        { isActive: false, reason: 'No longer offered' },
      );
      expect(response.status).toBe(409);
    });

    it('cannot change access through the route that amends the record', async () => {
      const response = await call('patch', `/api-clients/${clientId}`, {
        organisationName: `Insurer Ltd ${TAG}`,
        scopes: ['aggregate:vehicles:total'],
        status: 'REVOKED',
        disclosureProfileId: profiles.OPERATIONAL_VERIFICATION!.id,
        reason: 'Renamed at the Corporate Affairs Commission',
      });
      expect(response.status).toBe(200);

      const client = response.body.client as ClientDetail;
      expect(client.organisationName).toBe(`Insurer Ltd ${TAG}`);
      expect(client.status).toBe('ACTIVE');
      expect(client.scopes).toEqual(['vehicle:verify:plate']);
      expect(client.disclosureProfile?.code).toBe(PROFILE_CODE);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.update', subjectId: clientId },
      });
      expect(event.reason).toBe('Renamed at the Corporate Affairs Commission');
      expect(event.beforeValue).toMatchObject({
        organisationName: `Insurer ${TAG}`,
      });
    });

    it('refuses a call from outside the allowed ranges, as though the token were unknown', async () => {
      const limited = await call('patch', `/api-clients/${clientId}`, {
        allowedIpRanges: ['203.0.113.0/24'],
        reason: 'Limited to the organisation’s data centre',
      });
      expect(limited.status).toBe(200);

      const refused = await probe(token).expect(401);
      const unknown = await probe(`nurtw_abcdefgh_${'B'.repeat(43)}`).expect(
        401,
      );
      expect(refused.body.error.message).toBe(unknown.body.error.message);
      const [row] = await denials('ADDRESS_NOT_ALLOWED');
      expect(row).toMatchObject({ clientId, tokenId, statusCode: 401 });

      // The address this suite calls from, on either kind of socket.
      const allowed = await call('patch', `/api-clients/${clientId}`, {
        allowedIpRanges: ['127.0.0.0/8', '::1'],
        reason: 'Loopback, for the suite',
      });
      expect(allowed.status).toBe(200);
      await probe(token).expect(200);

      const bad = await call('patch', `/api-clients/${clientId}`, {
        allowedIpRanges: ['0.0.0.0/0'],
        reason: 'Everything',
      });
      expect(bad.status).toBe(400);

      const open = await call('patch', `/api-clients/${clientId}`, {
        allowedIpRanges: [],
        reason: 'Restriction lifted',
      });
      expect(open.status).toBe(200);
      await probe(token).expect(200);
    });
  });

  // --- Suspension --------------------------------------------------------------

  describe('suspending an organisation', () => {
    it('refuses its token on the next request, and keeps the token', async () => {
      const without = await call('post', `/api-clients/${clientId}/status`, {
        status: 'SUSPENDED',
      });
      expect(without.status).toBe(400);

      const response = await call('post', `/api-clients/${clientId}/status`, {
        status: 'SUSPENDED',
        reason: 'Unusual pattern of requests',
      });
      expect(response.status).toBe(201);
      expect(response.body.client).toMatchObject({
        status: 'SUSPENDED',
        statusReason: 'Unusual pattern of requests',
      });

      await probe(token).expect(401);
      const [row] = await denials('CLIENT_NOT_ACTIVE');
      expect(row).toMatchObject({ clientId, tokenId });

      // Nothing was revoked: the token is still the one in use.
      expect((await detail()).currentToken?.id).toBe(tokenId);
    });

    it('issues and rotates nothing while suspended', async () => {
      expect(
        (
          await mint(`/api-clients/${clientId}/tokens/${tokenId}/rotate`, {
            overlap: 'NONE',
          })
        ).status,
      ).toBe(409);
      expect(await prisma.apiToken.count({ where: { clientId } })).toBe(1);
    });

    it('restores the same token when the suspension is lifted', async () => {
      const response = await call('post', `/api-clients/${clientId}/status`, {
        status: 'ACTIVE',
        reason: 'Explained by the organisation',
      });
      expect(response.status).toBe(201);
      expect(response.body.client.status).toBe('ACTIVE');
      await probe(token).expect(200);

      const actions = (
        await prisma.auditEvent.findMany({
          where: {
            subjectId: clientId,
            action: { in: ['api_client.suspend', 'api_client.reinstate'] },
          },
          orderBy: { createdAt: 'asc' },
        })
      ).map((event) => event.action);
      expect(actions).toEqual(['api_client.suspend', 'api_client.reinstate']);
    });
  });

  // --- Rotation ----------------------------------------------------------------

  describe('rotating a token (EXT-11)', () => {
    let previous: string;
    let previousId: string;

    it('issues a new token and keeps the old one working for the overlap', async () => {
      expect(
        (
          await mint(`/api-clients/${clientId}/tokens/${tokenId}/rotate`, {
            overlap: 'FOREVER',
          })
        ).status,
      ).toBe(400);

      const response = await mint(
        `/api-clients/${clientId}/tokens/${tokenId}/rotate`,
        { overlap: 'ONE_HOUR' },
      );
      expect(response.status).toBe(201);

      previous = token;
      previousId = tokenId;
      token = response.body.token as string;
      tokenId = (response.body.summary as TokenSummary).id;
      expect(token).toMatch(TOKEN_FORM);
      expect(token).not.toBe(previous);

      // Both work while the overlap runs.
      await probe(previous).expect(200);
      await probe(token).expect(200);

      const client = await detail();
      expect(client.currentToken?.id).toBe(tokenId);
      const old = client.tokens.find((entry) => entry.id === previousId)!;
      expect(old.state).toBe('RETIRING');
      const minutes =
        (new Date(old.retiresAt!).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(58);
      expect(minutes).toBeLessThan(61);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_token.rotate', subjectId: tokenId },
      });
      expect(event.beforeValue).toMatchObject({ tokenId: previousId });
      expect(event.afterValue).toMatchObject({ overlap: 'ONE_HOUR' });
    });

    it('stops the old token when the overlap is over', async () => {
      // The clock is moved by moving the date, since nothing else decides it.
      await prisma.apiToken.update({
        where: { id: previousId },
        data: { retiresAt: new Date(Date.now() - 1000) },
      });

      await probe(previous).expect(401);
      await probe(token).expect(200);
      const [row] = await denials('TOKEN_REPLACED');
      expect(row).toMatchObject({ clientId, tokenId: previousId });

      const old = (await detail()).tokens.find(
        (entry) => entry.id === previousId,
      )!;
      expect(old.state).toBe('REPLACED');
    });

    it('does not rotate a token that is no longer the one in use', async () => {
      const response = await mint(
        `/api-clients/${clientId}/tokens/${previousId}/rotate`,
        { overlap: 'NONE' },
      );
      expect(response.status).toBe(409);
    });

    it('stops the old token at once when no overlap is chosen', async () => {
      const response = await mint(
        `/api-clients/${clientId}/tokens/${tokenId}/rotate`,
        { overlap: 'NONE' },
      );
      expect(response.status).toBe(201);
      const replaced = token;
      token = response.body.token as string;
      tokenId = (response.body.summary as TokenSummary).id;

      await probe(replaced).expect(401);
      await probe(token).expect(200);
    });

    it('answers 404 for a token of another organisation', async () => {
      const other = await register('Other');
      expect(other.status).toBe(201);
      const otherId = (other.body.client as ClientDetail).id;

      expect(
        (
          await mint(`/api-clients/${otherId}/tokens/${tokenId}/rotate`, {
            overlap: 'NONE',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            'post',
            `/api-clients/${otherId}/tokens/${tokenId}/revoke`,
            {
              reason: 'Wrong organisation',
            },
          )
        ).status,
      ).toBe(404);
      await probe(token).expect(200);
    });
  });

  // --- Revocation and expiry -------------------------------------------------------

  describe('revoking a token (acceptance criterion 11)', () => {
    it('takes effect on the very next request', async () => {
      await probe(token).expect(200);

      const without = await call(
        'post',
        `/api-clients/${clientId}/tokens/${tokenId}/revoke`,
        {},
      );
      expect(without.status).toBe(400);
      await probe(token).expect(200);

      const response = await call(
        'post',
        `/api-clients/${clientId}/tokens/${tokenId}/revoke`,
        { reason: 'Pasted into a support ticket' },
      );
      expect(response.status).toBe(201);
      expect(response.body.token.state).toBe('REVOKED');

      await probe(token).expect(401);
      const [row] = await denials('TOKEN_REVOKED');
      expect(row).toMatchObject({ clientId, tokenId });

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_token.revoke', subjectId: tokenId },
      });
      expect(event.reason).toBe('Pasted into a support ticket');
      expect(event.afterValue).toMatchObject({ state: 'REVOKED' });
    });

    it('revokes once', async () => {
      const response = await call(
        'post',
        `/api-clients/${clientId}/tokens/${tokenId}/revoke`,
        { reason: 'Again' },
      );
      expect(response.status).toBe(409);
    });

    it('leaves the organisation active, with no token, and able to be issued one', async () => {
      const client = await detail();
      expect(client.status).toBe('ACTIVE');
      expect(client.currentToken).toBeNull();

      const response = await mint(`/api-clients/${clientId}/tokens`);
      expect(response.status).toBe(201);
      token = response.body.token as string;
      tokenId = (response.body.summary as TokenSummary).id;
      await probe(token).expect(200);
    });
  });

  describe('expiry and the reminder (Requirement 12.6)', () => {
    it('flags a token inside the reminder window, and not one outside it', async () => {
      const list = await call('get', '/api-clients');
      const reminderDays = list.body.reminderDays as number;
      expect(reminderDays).toBeGreaterThan(0);
      const mine = () =>
        call('get', '/api-clients').then((response) =>
          (response.body.clients as ClientDetail[]).find(
            (client) => client.id === clientId,
          )!,
        );
      expect((await mine()).currentToken?.expiringSoon).toBe(false);

      await prisma.apiToken.update({
        where: { id: tokenId },
        data: { expiresAt: new Date(Date.now() + (reminderDays - 1) * DAY_MS) },
      });
      expect((await mine()).currentToken?.expiringSoon).toBe(true);
      await probe(token).expect(200);
    });

    it('refuses an expired token, and shows its organisation as expired', async () => {
      await prisma.apiToken.update({
        where: { id: tokenId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await probe(token).expect(401);
      const [row] = await denials('TOKEN_EXPIRED');
      expect(row).toMatchObject({ clientId, tokenId });

      const client = await detail();
      expect(client.status).toBe('EXPIRED');
      expect(client.currentToken).toBeNull();
      // Worked out, never stored.
      const stored = await prisma.apiClient.findUniqueOrThrow({
        where: { id: clientId },
      });
      expect(stored.status).toBe('ACTIVE');
    });

    it('is active again once a new token is issued', async () => {
      const response = await mint(`/api-clients/${clientId}/tokens`);
      expect(response.status).toBe(201);
      token = response.body.token as string;
      tokenId = (response.body.summary as TokenSummary).id;

      expect((await detail()).status).toBe('ACTIVE');
      await probe(token).expect(200);
    });
  });

  // --- Withdrawal ----------------------------------------------------------------

  describe('revoking an organisation', () => {
    it('withdraws every token in the same act, and is final', async () => {
      const response = await call('post', `/api-clients/${clientId}/status`, {
        status: 'REVOKED',
        reason: 'Agreement terminated',
      });
      expect(response.status).toBe(201);
      const client = response.body.client as ClientDetail;
      expect(client.status).toBe('REVOKED');
      expect(client.currentToken).toBeNull();
      expect(client.tokens.every((entry) => entry.state === 'REVOKED')).toBe(
        true,
      );

      await probe(token).expect(401);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.revoke', subjectId: clientId },
      });
      expect(event.reason).toBe('Agreement terminated');
      expect(
        (event.afterValue as { tokensRevoked: number }).tokensRevoked,
      ).toBeGreaterThan(0);
    });

    it('cannot be reinstated, amended, re-scoped, or issued a token', async () => {
      const reinstate = await call('post', `/api-clients/${clientId}/status`, {
        status: 'ACTIVE',
        reason: 'Changed our minds',
      });
      const amend = await call('patch', `/api-clients/${clientId}`, {
        organisationName: `Back ${TAG}`,
        reason: 'Changed our minds',
      });
      const access = await call('put', `/api-clients/${clientId}/access`, {
        disclosureProfileId: profiles.MINIMAL_VERIFICATION!.id,
        scopes: ['vehicle:verify:plate'],
        reason: 'Changed our minds',
      });
      const issue = await mint(`/api-clients/${clientId}/tokens`);

      expect([
        reinstate.status,
        amend.status,
        access.status,
        issue.status,
      ]).toEqual([409, 409, 409, 409]);
      expect((await detail()).status).toBe('REVOKED');
    });

    it('frees the profile it held, which can then be withdrawn from use', async () => {
      const response = await call(
        'patch',
        `/disclosure-profiles/${profiles[PROFILE_CODE]!.id}`,
        { isActive: false, reason: 'No longer offered' },
      );
      expect(response.status).toBe(200);
      expect(response.body.profile).toMatchObject({
        isActive: false,
        clientCount: 0,
      });

      // And it is no longer on offer to a new organisation.
      const pending = await register('Late');
      const late = (pending.body.client as ClientDetail).id;
      const approve = await call(
        'post',
        `/api-clients/${late}/approve`,
        approval({ disclosureProfileId: profiles[PROFILE_CODE]!.id }),
      );
      expect(approve.status).toBe(409);
    });

    it('refuses a pending organisation, which is recorded as a refusal', async () => {
      const pending = await register('Refused');
      const refused = (pending.body.client as ClientDetail).id;

      const response = await call('post', `/api-clients/${refused}/status`, {
        status: 'REVOKED',
        reason: 'No lawful purpose stated',
      });
      expect(response.status).toBe(201);
      expect(response.body.client.status).toBe('REVOKED');

      const closed = await prisma.auditEvent.findMany({
        where: {
          subjectId: refused,
          action: { in: ['api_client.refuse', 'api_client.revoke'] },
        },
      });
      expect(closed.map((event) => event.action)).toEqual([
        'api_client.refuse',
      ]);
    });
  });

  // --- Nothing leaks ---------------------------------------------------------------

  describe('the token itself (Requirements 12.1 and 12.2)', () => {
    it('was issued several times, and never twice the same', () => {
      expect(issued.length).toBeGreaterThanOrEqual(5);
      expect(new Set(issued).size).toBe(issued.length);
    });

    it('appears in no other response, no audit event, and no access-log row', async () => {
      const users = await prisma.user.findMany({
        where: { email: { contains: TAG } },
        select: { id: true },
      });
      const audit = JSON.stringify(
        await prisma.auditEvent.findMany({
          where: { actorUserId: { in: users.map((user) => user.id) } },
        }),
      );
      const log = JSON.stringify(
        await prisma.apiRequestLog.findMany({
          where: { endpoint: { contains: 'e2e-probe' } },
        }),
      );
      const responses = seen.join('\n');
      expect(audit.length).toBeGreaterThan(1000);
      expect(log.length).toBeGreaterThan(100);

      for (const value of issued) {
        const secret = value.slice(15);
        for (const [where, text] of [
          ['a response', responses],
          ['the audit trail', audit],
          ['the access log', log],
        ] as const) {
          expect(text.includes(secret), `the secret in ${where}`).toBe(false);
          expect(
            text.includes(hashApiToken(value)),
            `the hash in ${where}`,
          ).toBe(false);
        }
      }
    });

    it('is stored only as a hash', async () => {
      const rows = JSON.stringify(
        await prisma.apiToken.findMany({
          where: { client: { organisationName: { contains: TAG } } },
        }),
      );
      for (const value of issued) {
        expect(rows.includes(value.slice(15))).toBe(false);
        expect(rows.includes(hashApiToken(value))).toBe(true);
      }
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
          { endpoint: { contains: 'e2e-probe' } },
        ],
      },
    });
    await prisma.apiClient.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.disclosureProfile.deleteMany({
      where: { code: { startsWith: 'E2E_APICLIENT_' } },
    });
    await prisma.rateLimitProfile.deleteMany({ where: { code: LIMITS_CODE } });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { PORTAL_COOKIE_NAME } from './../src/portal/portal-account.decorator.js';
import {
  PORTAL_APPLICATION_EXPIRY_DAYS,
  PORTAL_APPLICATIONS_PER_HOUR,
  PORTAL_PENDING_CAP,
  PortalService,
} from './../src/portal/portal.service.js';
import {
  AUTH_LOCKOUT_THRESHOLD,
  SettingsService,
} from './../src/settings/settings.service.js';

/**
 * The organisation portal, end to end (PRD §23.23, revision 1.9;
 * `QUESTIONS.md` EXT-20; `plans/29-organisation-portal.md`).
 *
 * The limits and the lockout threshold are settings for the whole database,
 * so this suite switches them by spying on `SettingsService` for its own app.
 *
 * What carries weight: an application can do nothing until an administrator
 * approves it, and a self-application needs the applicant confirmed first; a
 * portal session and an officer's session never reach each other's routes; an
 * organisation acts on its own tokens and no other's, and the token is shown
 * to it alone; usage never separates a forged code from another non-match, or
 * says why the System paused it; and no response or audit event holds a
 * password.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-portal';
const PASSWORD = 'e2e-fixture-password-1';
const PORTAL_PASSWORD = 'a-long-phrase-for-the-portal-7';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Applicant {
  clientId: string;
  email: string;
  cookie: string;
}

describe('Organisation portal (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let portal: PortalService;
  let profileId: string;
  const limits: Record<string, number> = {};
  const cookies: Record<string, string> = {};
  let applicants = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
    portal = app.get(PortalService);

    await cleanUp();

    // Generous unless a test says otherwise, so the suite's own applications
    // never trip a limit it is not testing.
    const settings = app.get(SettingsService);
    const real = settings.getPositiveInteger.bind(settings);
    vi.spyOn(settings, 'getPositiveInteger').mockImplementation(
      async (key, fallback) => {
        if (key in limits) {
          return limits[key]!;
        }
        if (
          key === PORTAL_APPLICATIONS_PER_HOUR ||
          key === PORTAL_PENDING_CAP
        ) {
          return 10_000;
        }
        return real(key, fallback);
      },
    );

    profileId = (
      await prisma.disclosureProfile.findFirstOrThrow({
        where: { code: 'OPERATIONAL_VERIFICATION' },
      })
    ).id;

    const council = await prisma.organisation.findFirstOrThrow({
      where: { level: 'COUNCIL' },
    });
    const users: Record<string, readonly string[]> = {
      admin: ['api_client.read', 'api_client.manage', 'api_token.manage'],
      reader: ['api_client.read'],
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
    vi.restoreAllMocks();
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(() => {
    for (const key of Object.keys(limits)) {
      delete limits[key];
    }
  });

  // --- Applying -------------------------------------------------------------------

  describe('applying', () => {
    it('makes a pending organisation that applied for itself, and its account', async () => {
      const form = application();
      const response = await request(server)
        .post('/api/v1/portal/applications')
        .send(form)
        .expect(200);
      expect(response.body).toEqual({ received: true });

      const account = await prisma.portalAccount.findUniqueOrThrow({
        where: { email: form.email },
        include: { apiClient: true },
      });
      expect(account.apiClient).toMatchObject({
        organisationName: form.organisationName,
        status: 'PENDING',
        selfRegistered: true,
        registeredByUserId: null,
        approvedByUserId: null,
        disclosureProfileId: null,
      });
      expect(
        await prisma.apiClientScope.count({
          where: { clientId: account.apiClientId },
        }),
      ).toBe(0);
      expect(account.passwordHash).not.toContain(PORTAL_PASSWORD);

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.apply', subjectId: account.apiClientId },
      });
      expect(audit.actorUserId).toBeNull();
      expect(audit.actorApiClientId).toBe(account.apiClientId);
      expect(JSON.stringify(audit)).not.toContain(PORTAL_PASSWORD);
    });

    it('answers the same for an address already in use, and makes nothing', async () => {
      const first = application();
      await request(server)
        .post('/api/v1/portal/applications')
        .send(first)
        .expect(200);
      const before = await prisma.apiClient.count({
        where: { organisationName: { contains: TAG } },
      });

      const again = await request(server)
        .post('/api/v1/portal/applications')
        .send({ ...application(), email: first.email.toUpperCase() })
        .expect(200);
      expect(again.body).toEqual({ received: true });
      expect(
        await prisma.apiClient.count({
          where: { organisationName: { contains: TAG } },
        }),
      ).toBe(before);

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.apply_duplicate' },
        orderBy: { createdAt: 'desc' },
      });
      // The address belongs to somebody who did not send this.
      expect(JSON.stringify(audit)).not.toContain(first.email);
    });

    it('refuses a weak password, and an application with no telephone', async () => {
      const weak = await request(server)
        .post('/api/v1/portal/applications')
        .send({ ...application(), password: 'aaaaaaaaaaaaaa' })
        .expect(400);
      expect(weak.body.error.details[0].field).toBe('password');

      const { phone: _phone, ...withoutPhone } = application();
      const missing = await request(server)
        .post('/api/v1/portal/applications')
        .send(withoutPhone)
        .expect(400);
      expect(missing.body.error.details[0].field).toBe('phone');
    });

    it('cannot be given a status, a scope, or a profile by the applicant', async () => {
      const form = application();
      await request(server)
        .post('/api/v1/portal/applications')
        .send({
          ...form,
          status: 'ACTIVE',
          scopes: ['vehicle:verify:plate'],
          disclosureProfileId: profileId,
          selfRegistered: false,
        })
        .expect(200);
      const client = await prisma.apiClient.findFirstOrThrow({
        where: { organisationName: form.organisationName },
        include: { scopes: true },
      });
      expect(client.status).toBe('PENDING');
      expect(client.selfRegistered).toBe(true);
      expect(client.disclosureProfileId).toBeNull();
      expect(client.scopes).toEqual([]);
    });

    it('is limited per address', async () => {
      await prisma.publicRateCounter.deleteMany({
        where: { key: { startsWith: 'portal:' } },
      });
      limits[PORTAL_APPLICATIONS_PER_HOUR] = 1;
      await request(server)
        .post('/api/v1/portal/applications')
        .send(application())
        .expect(200);
      const refused = await request(server)
        .post('/api/v1/portal/applications')
        .send(application())
        .expect(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('stops taking applications while too many await approval', async () => {
      limits[PORTAL_PENDING_CAP] = await prisma.apiClient.count({
        where: { selfRegistered: true, status: 'PENDING' },
      });
      const form = application();
      const refused = await request(server)
        .post('/api/v1/portal/applications')
        .send(form)
        .expect(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(
        await prisma.portalAccount.findUnique({ where: { email: form.email } }),
      ).toBeNull();
    });
  });

  // --- Signing in, and what an unapproved organisation can do ----------------------

  describe('signing in', () => {
    it('sets the portal’s own cookie, and shows the application awaiting approval', async () => {
      const form = application();
      await request(server)
        .post('/api/v1/portal/applications')
        .send(form)
        .expect(200);
      const response = await request(server)
        .post('/api/v1/portal/login')
        .send({ email: form.email, password: PORTAL_PASSWORD })
        .expect(200);
      const raw = response.headers['set-cookie'];
      const setCookie = Array.isArray(raw) ? raw[0]! : raw!;
      expect(setCookie.startsWith(`${PORTAL_COOKIE_NAME}=`)).toBe(true);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(JSON.stringify(response.body)).not.toContain(
        setCookie.split(';')[0]!.split('=')[1]!,
      );

      const me = await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', setCookie.split(';')[0]!)
        .expect(200);
      expect(me.body.account).toEqual({
        email: form.email,
        fullName: form.contactName,
        mustChangePassword: false,
      });
      expect(me.body.organisation).toMatchObject({
        name: form.organisationName,
        status: 'PENDING',
        approvedAt: null,
        scopes: [],
        disclosureProfile: null,
        limits: null,
        pausedUntil: null,
      });
      expect(
        new Date(me.body.organisation.applicationExpiresAt).getTime(),
      ).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    });

    it('answers one 401 for an unknown address and a wrong password', async () => {
      const applicant = await apply();
      const unknown = await request(server)
        .post('/api/v1/portal/login')
        .send({ email: `nobody.${TAG}@portal.test`, password: PORTAL_PASSWORD })
        .expect(401);
      const wrong = await request(server)
        .post('/api/v1/portal/login')
        .send({ email: applicant.email, password: 'not-the-password-at-all' })
        .expect(401);
      expect({ ...unknown.body.error, requestId: null }).toEqual({
        ...wrong.body.error,
        requestId: null,
      });
    });

    it('locks the account after repeated failures, even for the right password', async () => {
      const applicant = await apply();
      limits[AUTH_LOCKOUT_THRESHOLD] = 3;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(server)
          .post('/api/v1/portal/login')
          .send({ email: applicant.email, password: 'not-the-password-at-all' })
          .expect(401);
      }
      await request(server)
        .post('/api/v1/portal/login')
        .send({ email: applicant.email, password: PORTAL_PASSWORD })
        .expect(401);
      const account = await prisma.portalAccount.findUniqueOrThrow({
        where: { email: applicant.email },
      });
      expect(account.signInLockedUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(
        await prisma.auditEvent.count({
          where: { action: 'portal_account.lockout', subjectId: account.id },
        }),
      ).toBe(1);
    });

    it('lets an unapproved organisation see its status and nothing more', async () => {
      const applicant = await apply();
      const tokens = await request(server)
        .get('/api/v1/portal/tokens')
        .set('Cookie', applicant.cookie)
        .expect(200);
      expect(tokens.body).toEqual({ tokens: [], canManage: false });
      await request(server)
        .post('/api/v1/portal/tokens')
        .set('Cookie', applicant.cookie)
        .expect(409);
    });

    it('signs out', async () => {
      const applicant = await apply();
      await request(server)
        .post('/api/v1/portal/logout')
        .set('Cookie', applicant.cookie)
        .expect(200);
      await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', applicant.cookie)
        .expect(401);
    });
  });

  // --- The two kinds of session never cross ----------------------------------------

  describe('a portal session and an officer session', () => {
    it('reach none of each other’s routes', async () => {
      const applicant = await apply();
      // A portal session on officer routes, including the ones that would let
      // an organisation approve itself or choose its own access.
      for (const [method, path] of [
        ['get', '/api-clients'],
        ['get', `/api-clients/${applicant.clientId}`],
        ['post', `/api-clients/${applicant.clientId}/approve`],
        ['put', `/api-clients/${applicant.clientId}/access`],
        ['put', `/api-clients/${applicant.clientId}/limits`],
        ['post', `/api-clients/${applicant.clientId}/tokens`],
        ['get', '/auth/me'],
      ] as const) {
        const response = await request(server)
          [method](`/api/v1${path}`)
          .set('Cookie', applicant.cookie)
          .send({});
        expect(response.status, `${method} ${path}`).toBe(401);
      }
      // An officer session on portal routes.
      for (const path of ['/portal/me', '/portal/usage', '/portal/tokens']) {
        await request(server)
          .get(`/api/v1${path}`)
          .set('Cookie', cookies.admin!)
          .expect(401);
      }
      await request(server)
        .post('/api/v1/portal/tokens')
        .set('Cookie', cookies.admin!)
        .expect(401);
      // And the officers' cookie value presented under the portal's name.
      await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', `${PORTAL_COOKIE_NAME}=${cookies.admin!.split('=')[1]}`)
        .expect(401);
    });
  });

  // --- Approval stays with the administrator ---------------------------------------

  describe('approval', () => {
    it('needs the applicant confirmed, by telephone or by letter', async () => {
      const applicant = await apply();
      const refused = await request(server)
        .post(`/api/v1/api-clients/${applicant.clientId}/approve`)
        .set('Cookie', cookies.admin!)
        .send(approval())
        .expect(400);
      expect(refused.body.error.details[0].field).toBe('applicantConfirmation');

      await request(server)
        .post(`/api/v1/api-clients/${applicant.clientId}/approve`)
        .set('Cookie', cookies.admin!)
        .send(approval({ applicantConfirmation: { via: 'EMAIL' } }))
        .expect(400);

      const approved = await request(server)
        .post(`/api/v1/api-clients/${applicant.clientId}/approve`)
        .set('Cookie', cookies.admin!)
        .send(
          approval({
            applicantConfirmation: {
              via: 'TELEPHONE',
              note: 'Called the number on their letterhead',
            },
          }),
        )
        .expect(201);
      expect(approved.body.client).toMatchObject({
        status: 'ACTIVE',
        selfRegistered: true,
        applicantConfirmation: {
          via: 'TELEPHONE',
          note: 'Called the number on their letterhead',
        },
        applicationExpiresAt: null,
      });
      expect(approved.body.client.portalAccount).toMatchObject({
        email: applicant.email,
        isActive: true,
      });
      expect(JSON.stringify(approved.body)).not.toMatch(
        /passwordHash|password_hash/,
      );

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_client.approve', subjectId: applicant.clientId },
      });
      expect(audit.afterValue).toMatchObject({
        applicantConfirmedVia: 'TELEPHONE',
      });
    });

    it('asks no confirmation for an organisation an officer registered', async () => {
      const registered = await request(server)
        .post('/api/v1/api-clients')
        .set('Cookie', cookies.admin!)
        .send({
          organisationName: `Registered ${TAG} ${randomUUID().slice(0, 8)}`,
          businessPurpose: 'Roadside verification of vehicles by its officers.',
          technicalContact: {
            name: 'Fixture Contact',
            email: 'contact@example.test',
          },
        })
        .expect(201);
      const approved = await request(server)
        .post(`/api/v1/api-clients/${registered.body.client.id}/approve`)
        .set('Cookie', cookies.admin!)
        .send(approval())
        .expect(201);
      expect(approved.body.client).toMatchObject({
        selfRegistered: false,
        applicantConfirmation: null,
        portalAccount: null,
      });
    });

    it('is not within reach of an officer who may only read', async () => {
      const applicant = await apply();
      await request(server)
        .post(`/api/v1/api-clients/${applicant.clientId}/approve`)
        .set('Cookie', cookies.reader!)
        .send(approval({ applicantConfirmation: { via: 'LETTER' } }))
        .expect(403);
    });
  });

  // --- Its own tokens ----------------------------------------------------------------

  describe('an approved organisation’s tokens', () => {
    let org: Applicant;
    let other: Applicant;
    let issued: { token: string; summary: { id: string; prefix: string } };

    beforeAll(async () => {
      org = await applyAndApprove();
      other = await applyAndApprove();
    });

    it('are issued by the organisation itself, and shown to it once', async () => {
      const response = await request(server)
        .post('/api/v1/portal/tokens')
        .set('Cookie', org.cookie)
        .expect(201);
      issued = response.body;
      expect(issued.token).toMatch(/^nurtw_[a-z0-9]{8}_/);

      const row = await prisma.apiToken.findUniqueOrThrow({
        where: { id: issued.summary.id },
      });
      expect(row.clientId).toBe(org.clientId);
      expect(row.createdByUserId).toBeNull();

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'api_token.issue', subjectId: issued.summary.id },
      });
      expect(audit.actorUserId).toBeNull();
      expect(audit.actorApiClientId).toBe(org.clientId);
      expect(audit.afterValue).toHaveProperty('portalAccountId');
      expect(JSON.stringify(audit)).not.toContain(issued.token);

      // The list, and the administrator's view, hold no token.
      const list = await request(server)
        .get('/api/v1/portal/tokens')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(list.body.canManage).toBe(true);
      expect(list.body.tokens).toHaveLength(1);
      const detail = await request(server)
        .get(`/api/v1/api-clients/${org.clientId}`)
        .set('Cookie', cookies.admin!)
        .expect(200);
      for (const body of [list.body, detail.body]) {
        expect(JSON.stringify(body)).not.toContain(issued.token);
        expect(JSON.stringify(body)).not.toMatch(/tokenHash|token_hash/);
      }
    });

    it('work on the external API, within the scopes the administrator gave', async () => {
      await request(server)
        .get('/api/v1/aggregates/vehicles/total')
        .set('Authorization', `Bearer ${issued.token}`)
        .set('X-Request-ID', `${TAG}-total`)
        .expect(200);
      // A scope it was not given stays closed: the portal changes no access.
      await request(server)
        .post('/api/v1/verification/vehicle/plate')
        .set('Authorization', `Bearer ${issued.token}`)
        .set('X-Request-ID', `${TAG}-plate`)
        .send({ plate_number: 'ABC123XY' })
        .expect(403);
    });

    it('are replaced and revoked by the organisation', async () => {
      const second = await request(server)
        .post('/api/v1/portal/tokens')
        .set('Cookie', org.cookie);
      expect(second.status).toBe(409);

      const rotated = await request(server)
        .post(`/api/v1/portal/tokens/${issued.summary.id}/rotate`)
        .set('Cookie', org.cookie)
        .send({ overlap: 'NONE' })
        .expect(201);
      expect(rotated.body.token).not.toBe(issued.token);
      await request(server)
        .get('/api/v1/aggregates/vehicles/total')
        .set('Authorization', `Bearer ${issued.token}`)
        .set('X-Request-ID', `${TAG}-old`)
        .expect(401);

      await request(server)
        .post(`/api/v1/portal/tokens/${rotated.body.summary.id}/revoke`)
        .set('Cookie', org.cookie)
        .send({ reason: ' ' })
        .expect(400);
      const revoked = await request(server)
        .post(`/api/v1/portal/tokens/${rotated.body.summary.id}/revoke`)
        .set('Cookie', org.cookie)
        .send({ reason: 'It may have leaked' })
        .expect(200);
      expect(revoked.body.state).toBe('REVOKED');
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'api_token.revoke',
          subjectId: rotated.body.summary.id,
        },
      });
      expect(audit.actorApiClientId).toBe(org.clientId);
      expect(audit.reason).toBe('It may have leaked');
    });

    it('are out of reach of another organisation', async () => {
      const theirs = await request(server)
        .post('/api/v1/portal/tokens')
        .set('Cookie', other.cookie)
        .expect(201);
      await request(server)
        .post(`/api/v1/portal/tokens/${theirs.body.summary.id}/rotate`)
        .set('Cookie', org.cookie)
        .send({ overlap: 'NONE' })
        .expect(404);
      await request(server)
        .post(`/api/v1/portal/tokens/${theirs.body.summary.id}/revoke`)
        .set('Cookie', org.cookie)
        .send({ reason: 'Not mine to revoke' })
        .expect(404);
      const mine = await request(server)
        .get('/api/v1/portal/tokens')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(JSON.stringify(mine.body)).not.toContain(theirs.body.summary.id);
    });

    it('cannot be issued while suspended, and can still be revoked', async () => {
      const live = await prisma.apiToken.findFirstOrThrow({
        where: { clientId: other.clientId, revokedAt: null },
      });
      await request(server)
        .post(`/api/v1/api-clients/${other.clientId}/status`)
        .set('Cookie', cookies.admin!)
        .send({ status: 'SUSPENDED', reason: 'Under review' })
        .expect(201);
      const me = await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', other.cookie)
        .expect(200);
      expect(me.body.organisation.status).toBe('SUSPENDED');
      await request(server)
        .post(`/api/v1/portal/tokens/${live.id}/rotate`)
        .set('Cookie', other.cookie)
        .send({ overlap: 'NONE' })
        .expect(409);
      await request(server)
        .post(`/api/v1/portal/tokens/${live.id}/revoke`)
        .set('Cookie', other.cookie)
        .send({ reason: 'Stopping it while suspended' })
        .expect(200);
    });
  });

  // --- Usage ------------------------------------------------------------------------

  describe('usage', () => {
    let org: Applicant;
    let other: Applicant;

    beforeAll(async () => {
      org = await applyAndApprove();
      other = await applyAndApprove();
      const row = (
        resultClass: string,
        statusCode = 200,
        extra: {
          rateLimited?: boolean;
          createdAt?: Date;
          clientId?: string;
        } = {},
      ) => ({
        requestId: `${TAG}-${randomUUID()}`,
        clientId: extra.clientId ?? org.clientId,
        endpoint: '/api/v1/e2e-portal-usage',
        resultClass,
        statusCode,
        rateLimited: extra.rateLimited ?? false,
        ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
      });
      await prisma.apiRequestLog.createMany({
        data: [
          row('MATCH'),
          row('MATCH'),
          row('MATCH'),
          row('NO_MATCH'),
          row('NO_MATCH'),
          row('INVALID_SIGNATURE'),
          row('TOTAL'),
          row('SUPPRESSED'),
          row('RATE_LIMITED', 429, { rateLimited: true }),
          row('CLIENT_NOT_ACTIVE', 401),
          row('NO_REQUEST_ID', 400),
          // Outside the window, and somebody else's.
          row('MATCH', 200, { createdAt: new Date(Date.now() - 40 * DAY_MS) }),
          row('MATCH', 200, { clientId: other.clientId }),
        ],
      });
    });

    it('counts the organisation’s own requests, in the API’s own terms', async () => {
      const response = await request(server)
        .get('/api/v1/portal/usage')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(response.body.totals).toEqual({
        MATCH: 3,
        // The forged code is one of these, and is never told apart.
        NO_MATCH: 3,
        TOTALS: 2,
        LIMITED: 1,
        REFUSED: 1,
        INVALID_REQUEST: 1,
        OTHER: 0,
      });
      expect(response.body.total).toBe(11);
      expect(response.body.days).toHaveLength(30);
      const today = response.body.days.at(-1);
      expect(today.total).toBe(11);
      expect(
        response.body.days
          .slice(0, -1)
          .every((day: { total: number }) => day.total === 0),
      ).toBe(true);
    });

    it('names no reason the API withheld', async () => {
      const response = await request(server)
        .get('/api/v1/portal/usage')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(JSON.stringify(response.body)).not.toMatch(
        /SIGNATURE|SUPPRESSED|CLIENT_NOT_ACTIVE|UNKNOWN_TOKEN|NO_REQUEST_ID|FORGED/,
      );
    });

    it('takes a number of days, up to ninety', async () => {
      const week = await request(server)
        .get('/api/v1/portal/usage?days=7')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(week.body.days).toHaveLength(7);
      const long = await request(server)
        .get('/api/v1/portal/usage?days=400')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(long.body.days).toHaveLength(90);
      expect(long.body.totals.MATCH).toBe(4);
      for (const days of ['0', '-3', 'abc', '1.5']) {
        await request(server)
          .get(`/api/v1/portal/usage?days=${days}`)
          .set('Cookie', org.cookie)
          .expect(400);
      }
    });

    it('shows its limits, and that it is paused, never why', async () => {
      const until = new Date(Date.now() + 30 * 60 * 1000);
      await prisma.apiClientPause.create({
        data: {
          clientId: org.clientId,
          signal: 'FORGED_CODES',
          pausedAt: new Date(),
          pausedUntil: until,
          evidence: { forgeries: 5 },
        },
      });
      const me = await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', org.cookie)
        .expect(200);
      expect(me.body.organisation.pausedUntil).toBe(until.toISOString());
      expect(me.body.organisation.limits).toMatchObject({
        verificationPerMinute: expect.any(Number),
        aggregatePerMinute: expect.any(Number),
        burst: expect.any(Number),
        dailyQuota: expect.any(Number),
        usedToday: expect.any(Number),
      });
      expect(
        me.body.organisation.disclosureProfile.fields.length,
      ).toBeGreaterThan(0);
      expect(JSON.stringify(me.body)).not.toMatch(
        /FORGED|signal|evidence|forgeries|Threshold|threshold/,
      );
    });
  });

  // --- Its own password --------------------------------------------------------------

  describe('the account’s own password', () => {
    it('is changed with the current one, and signs other sessions out', async () => {
      const applicant = await apply();
      const elsewhere = await signIn(applicant.email, PORTAL_PASSWORD);

      const wrong = await request(server)
        .post('/api/v1/portal/password')
        .set('Cookie', applicant.cookie)
        .send({
          currentPassword: 'not-the-current-one',
          newPassword: 'another-long-phrase-42',
        })
        .expect(400);
      expect(wrong.body.error.details[0].field).toBe('currentPassword');

      await request(server)
        .post('/api/v1/portal/password')
        .set('Cookie', applicant.cookie)
        .send({
          currentPassword: PORTAL_PASSWORD,
          newPassword: 'another-long-phrase-42',
        })
        .expect(200);

      await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', applicant.cookie)
        .expect(200);
      await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', elsewhere)
        .expect(401);
      await request(server)
        .post('/api/v1/portal/login')
        .send({ email: applicant.email, password: PORTAL_PASSWORD })
        .expect(401);
      await signIn(applicant.email, 'another-long-phrase-42');

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'portal_account.password_change' },
        orderBy: { createdAt: 'desc' },
      });
      expect(JSON.stringify(audit)).not.toMatch(
        /another-long-phrase|a-long-phrase/,
      );
    });
  });

  // --- The administrator's side of an account -----------------------------------------

  describe('an account the administrator gives', () => {
    let clientId: string;
    const email = `given.${TAG}@portal.test`;

    beforeAll(async () => {
      const registered = await request(server)
        .post('/api/v1/api-clients')
        .set('Cookie', cookies.admin!)
        .send({
          organisationName: `Given ${TAG}`,
          businessPurpose: 'Roadside verification of vehicles by its officers.',
          technicalContact: {
            name: 'Fixture Contact',
            email: 'contact@example.test',
          },
        })
        .expect(201);
      clientId = registered.body.client.id;
    });

    it('starts on a temporary password that opens only the account itself', async () => {
      await request(server)
        .post(`/api/v1/api-clients/${clientId}/portal-account`)
        .set('Cookie', cookies.reader!)
        .send({ email, fullName: 'Given Contact' })
        .expect(403);

      const created = await request(server)
        .post(`/api/v1/api-clients/${clientId}/portal-account`)
        .set('Cookie', cookies.admin!)
        .send({ email: email.toUpperCase(), fullName: 'Given Contact' })
        .expect(201);
      expect(created.body.temporaryPassword).toMatch(
        /^\S{4}-\S{4}-\S{4}-\S{4}$/,
      );
      expect(created.body.account).toMatchObject({
        email,
        mustChangePassword: true,
      });
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'portal_account.create',
          subjectId: created.body.account.id,
        },
      });
      expect(JSON.stringify(audit)).not.toContain(
        created.body.temporaryPassword,
      );

      const cookie = await signIn(email, created.body.temporaryPassword);
      const me = await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body.account.mustChangePassword).toBe(true);
      await request(server)
        .get('/api/v1/portal/tokens')
        .set('Cookie', cookie)
        .expect(403);
      await request(server)
        .get('/api/v1/portal/usage')
        .set('Cookie', cookie)
        .expect(403);

      await request(server)
        .post('/api/v1/portal/password')
        .set('Cookie', cookie)
        .send({
          currentPassword: created.body.temporaryPassword,
          newPassword: 'chosen-by-the-organisation-9',
        })
        .expect(200);
      await request(server)
        .get('/api/v1/portal/tokens')
        .set('Cookie', cookie)
        .expect(200);
    });

    it('is one per organisation, and one per address', async () => {
      await request(server)
        .post(`/api/v1/api-clients/${clientId}/portal-account`)
        .set('Cookie', cookies.admin!)
        .send({
          email: `second.${TAG}@portal.test`,
          fullName: 'Second Contact',
        })
        .expect(409);

      const another = await request(server)
        .post('/api/v1/api-clients')
        .set('Cookie', cookies.admin!)
        .send({
          organisationName: `Given again ${TAG}`,
          businessPurpose: 'Roadside verification of vehicles by its officers.',
          technicalContact: {
            name: 'Fixture Contact',
            email: 'contact@example.test',
          },
        })
        .expect(201);
      await request(server)
        .post(`/api/v1/api-clients/${another.body.client.id}/portal-account`)
        .set('Cookie', cookies.admin!)
        .send({ email, fullName: 'Same Address' })
        .expect(409);
    });

    it('is reset with a reason, which signs it out and lifts a lock', async () => {
      const before = await signIn(email, 'chosen-by-the-organisation-9');
      await prisma.portalAccount.update({
        where: { email },
        data: { signInLockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
      });

      await request(server)
        .post(`/api/v1/api-clients/${clientId}/portal-account/reset-password`)
        .set('Cookie', cookies.admin!)
        .send({ reason: ' ' })
        .expect(400);
      const reset = await request(server)
        .post(`/api/v1/api-clients/${clientId}/portal-account/reset-password`)
        .set('Cookie', cookies.admin!)
        .send({ reason: 'They telephoned: password forgotten' })
        .expect(200);
      expect(reset.body.account).toMatchObject({
        mustChangePassword: true,
        locked: false,
      });

      await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', before)
        .expect(401);
      await request(server)
        .post('/api/v1/portal/login')
        .send({ email, password: 'chosen-by-the-organisation-9' })
        .expect(401);
      await signIn(email, reset.body.temporaryPassword);

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'portal_account.password_reset' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit.reason).toBe('They telephoned: password forgotten');
      expect(JSON.stringify(audit)).not.toContain(reset.body.temporaryPassword);
    });
  });

  // --- Applications nobody approved ----------------------------------------------------

  describe('an application nobody approved', () => {
    it('cannot be approved once lapsed, and is swept away, freeing the address', async () => {
      const applicant = await apply();
      await prisma.apiClient.update({
        where: { id: applicant.clientId },
        data: { createdAt: new Date(Date.now() - 31 * DAY_MS) },
      });

      await request(server)
        .post(`/api/v1/api-clients/${applicant.clientId}/approve`)
        .set('Cookie', cookies.admin!)
        .send(approval({ applicantConfirmation: { via: 'LETTER' } }))
        .expect(409);

      expect(await portal.sweep()).toBeGreaterThanOrEqual(1);
      const lapsed = await prisma.apiClient.findUniqueOrThrow({
        where: { id: applicant.clientId },
      });
      expect(lapsed.status).toBe('REVOKED');
      expect(lapsed.statusReason).toMatch(/30 days/);
      expect(
        await prisma.portalAccount.findUnique({
          where: { email: applicant.email },
        }),
      ).toBeNull();
      await request(server)
        .get('/api/v1/portal/me')
        .set('Cookie', applicant.cookie)
        .expect(401);
      expect(
        await prisma.auditEvent.count({
          where: {
            action: 'api_client.application_expired',
            subjectId: applicant.clientId,
          },
        }),
      ).toBe(1);

      // The applicant may try again with the same address.
      await request(server)
        .post('/api/v1/portal/applications')
        .send({ ...application(), email: applicant.email })
        .expect(200);
      const again = await prisma.portalAccount.findUniqueOrThrow({
        where: { email: applicant.email },
      });
      expect(again.apiClientId).not.toBe(applicant.clientId);
    });

    it('is left alone while it still has time, as is one already approved', async () => {
      const waiting = await apply();
      const approved = await applyAndApprove();
      await prisma.apiClient.update({
        where: { id: approved.clientId },
        data: { createdAt: new Date(Date.now() - 60 * DAY_MS) },
      });
      limits[PORTAL_APPLICATION_EXPIRY_DAYS] = 30;
      await portal.sweep();
      expect(
        (
          await prisma.apiClient.findUniqueOrThrow({
            where: { id: waiting.clientId },
          })
        ).status,
      ).toBe('PENDING');
      expect(
        (
          await prisma.apiClient.findUniqueOrThrow({
            where: { id: approved.clientId },
          })
        ).status,
      ).toBe('ACTIVE');
    });
  });

  // --- Helpers ------------------------------------------------------------------------

  function application() {
    applicants += 1;
    const id = `${applicants}-${randomUUID().slice(0, 8)}`;
    return {
      organisationName: `Applicant ${TAG} ${id}`,
      businessPurpose:
        'Checking that vehicles our officers stop are on the Union’s record.',
      contactName: 'Fixture Contact',
      email: `applicant-${id}.${TAG}@portal.test`,
      phone: '+2348000000000',
      password: PORTAL_PASSWORD,
    };
  }

  const approval = (overrides: object = {}) => ({
    disclosureProfileId: profileId,
    scopes: ['aggregate:vehicles:total'],
    agreementReference: 'DSA/2026/029',
    agreementDate: '2026-09-01',
    ...overrides,
  });

  async function signIn(email: string, password: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/portal/login')
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    return (Array.isArray(raw) ? raw[0]! : raw!).split(';')[0]!;
  }

  async function apply(): Promise<Applicant> {
    const form = application();
    await request(server)
      .post('/api/v1/portal/applications')
      .send(form)
      .expect(200);
    const account = await prisma.portalAccount.findUniqueOrThrow({
      where: { email: form.email },
    });
    return {
      clientId: account.apiClientId,
      email: form.email,
      cookie: await signIn(form.email, PORTAL_PASSWORD),
    };
  }

  async function applyAndApprove(): Promise<Applicant> {
    const applicant = await apply();
    await request(server)
      .post(`/api/v1/api-clients/${applicant.clientId}/approve`)
      .set('Cookie', cookies.admin!)
      .send(approval({ applicantConfirmation: { via: 'TELEPHONE' } }))
      .expect(201);
    return applicant;
  }

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const clients = await prisma.apiClient.findMany({
      where: { organisationName: { contains: TAG } },
      select: { id: true, portalAccount: { select: { id: true } } },
    });
    const clientIds = clients.map((client) => client.id);
    const tokens = await prisma.apiToken.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true },
    });
    const subjectIds = [
      ...clientIds,
      ...tokens.map((token) => token.id),
      ...clients.flatMap((client) =>
        client.portalAccount ? [client.portalAccount.id] : [],
      ),
    ];

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { actorApiClientId: { in: clientIds } },
          { subjectId: { in: subjectIds } },
          // No subject and no actor: only this suite makes these.
          { action: 'api_client.apply_duplicate' },
          { action: { startsWith: 'portal_account.' } },
        ],
      },
    });
    await prisma.apiRequestLog.deleteMany({
      where: {
        OR: [{ clientId: { in: clientIds } }, { requestId: { contains: TAG } }],
      },
    });
    await prisma.apiClient.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.publicRateCounter.deleteMany({
      where: { key: { startsWith: 'portal:' } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

import { randomBytes, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { PORTAL_INVITATION_VIEWS_PER_MINUTE } from './../src/portal/invitation.service.js';
import {
  PORTAL_APPLICATIONS_PER_HOUR,
  PORTAL_PENDING_CAP,
} from './../src/portal/portal.service.js';
import { SettingsService } from './../src/settings/settings.service.js';

/**
 * Inviting an organisation to apply, end to end (PRD Requirement 12.11,
 * revision 1.10; `QUESTIONS.md` EXT-21; `plans/33-organisations-and-invitations.md`).
 *
 * What carries weight: a link opens the form addressed to one organisation
 * and is used once, by one conditional update; an invitation confirms nobody,
 * so approving an invited application still needs the telephone or letter
 * confirmation; unknown, used, expired, and withdrawn links answer alike; the
 * page is limited per address; and the code never reaches an audit event.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-invitation';
const PASSWORD = 'e2e-fixture-password-1';
const PORTAL_PASSWORD = 'a-long-phrase-for-the-portal-7';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Organisation invitations (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let profileId: string;
  const limits: Record<string, number> = {};
  const cookies: Record<string, string> = {};
  const names: Record<string, string> = {};
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

    await cleanUp();

    // Generous unless a test says otherwise.
    const settings = app.get(SettingsService);
    const real = settings.getPositiveInteger.bind(settings);
    vi.spyOn(settings, 'getPositiveInteger').mockImplementation(
      async (key, fallback) => {
        if (key in limits) {
          return limits[key]!;
        }
        if (
          key === PORTAL_APPLICATIONS_PER_HOUR ||
          key === PORTAL_PENDING_CAP ||
          key === PORTAL_INVITATION_VIEWS_PER_MINUTE
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
      admin: ['api_client.read', 'api_client.manage'],
      reader: ['api_client.read'],
      outsider: ['vehicle.read'],
    };
    for (const [who, permissions] of Object.entries(users)) {
      names[who] = `${who} ${TAG}`;
      const user = await prisma.user.create({
        data: {
          email: `${who}.${TAG}@nurtw.test`,
          fullName: names[who]!,
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

  // --- Inviting, and the link used once --------------------------------------------

  it('invites an organisation by a link that addresses the form to it, and is used once', async () => {
    const invitation = await invite({
      contactEmail: `Desk.${TAG}@Agency.Example`,
      note: 'Met at the stakeholders’ meeting.',
    });
    expect(invitation.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(invitation.standing).toBe('OPEN');
    expect(invitation.contactEmail).toBe(`desk.${TAG}@agency.example`);
    expect(invitation.createdBy).toBe(names.admin);
    const lasts =
      new Date(invitation.expiresAt).getTime() -
      new Date(invitation.createdAt).getTime();
    expect(lasts).toBe(14 * DAY_MS);

    // The public page names the organisation and the expiry, and nothing more.
    const page = await request(server)
      .get(`/api/v1/portal/invitations/${invitation.code}`)
      .expect(200);
    expect(page.body).toEqual({
      organisationName: invitation.organisationName,
      expiresAt: invitation.expiresAt,
    });

    const form = application();
    await request(server)
      .post('/api/v1/portal/applications')
      .send({ ...form, invitationCode: invitation.code })
      .expect(200);
    const client = await clientFor(form.email);

    const stored = await prisma.portalInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(stored.apiClientId).toBe(client.id);
    expect(stored.usedAt).not.toBeNull();

    // Used: the page now answers as for any closed link.
    await request(server)
      .get(`/api/v1/portal/invitations/${invitation.code}`)
      .expect(404);

    const listed = await request(server)
      .get('/api/v1/organisation-invitations')
      .set('Cookie', cookies.reader!)
      .expect(200);
    const row = listed.body.invitations.find(
      (entry: { id: string }) => entry.id === invitation.id,
    );
    expect(row.standing).toBe('USED');
    expect(row.used.apiClientId).toBe(client.id);
    expect(listed.body.expiryDays).toBe(14);

    // The administrator sees who invited it.
    const detail = await request(server)
      .get(`/api/v1/api-clients/${client.id}`)
      .set('Cookie', cookies.reader!)
      .expect(200);
    expect(detail.body.client.invited).toBe(true);
    expect(detail.body.client.invitation).toMatchObject({
      id: invitation.id,
      invitedBy: names.admin,
    });

    // A second application on the same link goes in, uninvited.
    const second = application();
    await request(server)
      .post('/api/v1/portal/applications')
      .send({ ...second, invitationCode: invitation.code })
      .expect(200);
    const secondClient = await clientFor(second.email);
    const secondDetail = await request(server)
      .get(`/api/v1/api-clients/${secondClient.id}`)
      .set('Cookie', cookies.reader!)
      .expect(200);
    expect(secondDetail.body.client.invited).toBe(false);
    expect(secondDetail.body.client.invitation).toBeNull();
  });

  it('uses a link once when two applications arrive on it at the same moment', async () => {
    const invitation = await invite();
    const forms = [application(), application()];
    await Promise.all(
      forms.map((form) =>
        request(server)
          .post('/api/v1/portal/applications')
          .send({ ...form, invitationCode: invitation.code })
          .expect(200),
      ),
    );
    const clients = await Promise.all(
      forms.map((form) => clientFor(form.email)),
    );
    const invited = await prisma.portalInvitation.count({
      where: {
        id: invitation.id,
        apiClientId: { in: clients.map((c) => c.id) },
      },
    });
    expect(invited).toBe(1);
  });

  it('confirms nobody: an invited application is approved only with the applicant confirmed', async () => {
    const invitation = await invite();
    const form = application();
    await request(server)
      .post('/api/v1/portal/applications')
      .send({ ...form, invitationCode: invitation.code })
      .expect(200);
    const client = await clientFor(form.email);

    await request(server)
      .post(`/api/v1/api-clients/${client.id}/approve`)
      .set('Cookie', cookies.admin!)
      .send(approval())
      .expect(400);
    await request(server)
      .post(`/api/v1/api-clients/${client.id}/approve`)
      .set('Cookie', cookies.admin!)
      .send(approval({ applicantConfirmation: { via: 'TELEPHONE' } }))
      .expect(201);
  });

  // --- Closed links -----------------------------------------------------------------

  it('answers alike for unknown, malformed, expired, and withdrawn links', async () => {
    const expired = await invite();
    await prisma.portalInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const withdrawn = await invite();
    await request(server)
      .post(`/api/v1/organisation-invitations/${withdrawn.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'Sent to the wrong desk' })
      .expect(200);

    const codes = [
      randomBytes(16).toString('base64url'),
      'not-a-code',
      expired.code,
      withdrawn.code,
    ];
    const answers = [];
    for (const code of codes) {
      const response = await request(server)
        .get(`/api/v1/portal/invitations/${code}`)
        .expect(404);
      answers.push(response.body.error.message);
    }
    expect(new Set(answers).size).toBe(1);
  });

  it('takes an application on a closed link without the invitation, and answers the same', async () => {
    const withdrawn = await invite();
    await request(server)
      .post(`/api/v1/organisation-invitations/${withdrawn.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'No longer wanted' })
      .expect(200);

    const form = application();
    const response = await request(server)
      .post('/api/v1/portal/applications')
      .send({ ...form, invitationCode: withdrawn.code })
      .expect(200);
    expect(response.body).toEqual({ received: true });
    const client = await clientFor(form.email);
    expect(
      await prisma.portalInvitation.count({
        where: { apiClientId: client.id },
      }),
    ).toBe(0);
  });

  // --- Who may do what --------------------------------------------------------------

  it('lets only api_client.manage invite or withdraw, and api_client.read list', async () => {
    await request(server)
      .post('/api/v1/organisation-invitations')
      .set('Cookie', cookies.reader!)
      .send({ organisationName: `Refused ${TAG}` })
      .expect(403);
    await request(server)
      .get('/api/v1/organisation-invitations')
      .set('Cookie', cookies.outsider!)
      .expect(403);
    await request(server).get('/api/v1/organisation-invitations').expect(401);

    const invitation = await invite();
    await request(server)
      .post(`/api/v1/organisation-invitations/${invitation.id}/withdrawal`)
      .set('Cookie', cookies.reader!)
      .send({ reason: 'Not mine to withdraw' })
      .expect(403);
  });

  it('withdraws only an open invitation, and only with a reason', async () => {
    const invitation = await invite();
    await request(server)
      .post(`/api/v1/organisation-invitations/${invitation.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: '' })
      .expect(400);
    const withdrawn = await request(server)
      .post(`/api/v1/organisation-invitations/${invitation.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'Sent twice' })
      .expect(200);
    expect(withdrawn.body.standing).toBe('WITHDRAWN');
    expect(withdrawn.body.withdrawn).toMatchObject({
      by: names.admin,
      reason: 'Sent twice',
    });
    await request(server)
      .post(`/api/v1/organisation-invitations/${invitation.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'Again' })
      .expect(409);

    const used = await invite();
    await request(server)
      .post('/api/v1/portal/applications')
      .send({ ...application(), invitationCode: used.code })
      .expect(200);
    await request(server)
      .post(`/api/v1/organisation-invitations/${used.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'Too late' })
      .expect(409);

    await request(server)
      .post(`/api/v1/organisation-invitations/${randomUUID()}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'No such invitation' })
      .expect(404);
  });

  // --- Limits, and what is kept --------------------------------------------------------

  it('limits how often a link’s page is opened from one address', async () => {
    const invitation = await invite();
    await prisma.publicRateCounter.deleteMany({
      where: { key: { startsWith: 'portal:invitation' } },
    });
    limits[PORTAL_INVITATION_VIEWS_PER_MINUTE] = 2;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(server)
        .get(`/api/v1/portal/invitations/${invitation.code}`)
        .expect(200);
    }
    const refused = await request(server)
      .get(`/api/v1/portal/invitations/${invitation.code}`)
      .expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keeps the code out of every audit event', async () => {
    const invitation = await invite();
    await request(server)
      .post('/api/v1/portal/applications')
      .send({ ...application(), invitationCode: invitation.code })
      .expect(200);
    const withdrawn = await invite();
    await request(server)
      .post(`/api/v1/organisation-invitations/${withdrawn.id}/withdrawal`)
      .set('Cookie', cookies.admin!)
      .send({ reason: 'Checking the trail' })
      .expect(200);

    const events = await prisma.auditEvent.findMany({
      where: { subjectId: { in: [invitation.id, withdrawn.id] } },
    });
    expect(events.map((event) => event.action).sort()).toEqual([
      'portal_invitation.create',
      'portal_invitation.create',
      'portal_invitation.use',
      'portal_invitation.withdraw',
    ]);
    const trail = JSON.stringify(events);
    expect(trail).not.toContain(invitation.code);
    expect(trail).not.toContain(withdrawn.code);
  });

  // --- Usage, as the administrator sees it ------------------------------------------

  it('shows an officer an organisation’s usage, as its own portal does', async () => {
    const form = application();
    await request(server)
      .post('/api/v1/portal/applications')
      .send(form)
      .expect(200);
    const client = await clientFor(form.email);

    const usage = await request(server)
      .get(`/api/v1/api-clients/${client.id}/usage?days=7`)
      .set('Cookie', cookies.reader!)
      .expect(200);
    expect(usage.body.days).toHaveLength(7);
    expect(usage.body.total).toBe(0);
    expect(Object.keys(usage.body.totals).sort()).toEqual(
      Object.keys(usage.body.days[0].byClass).sort(),
    );

    await request(server)
      .get(`/api/v1/api-clients/${randomUUID()}/usage`)
      .set('Cookie', cookies.reader!)
      .expect(404);
    await request(server)
      .get(`/api/v1/api-clients/${client.id}/usage`)
      .set('Cookie', cookies.outsider!)
      .expect(403);
    await request(server)
      .get(`/api/v1/api-clients/${client.id}/usage?days=0`)
      .set('Cookie', cookies.reader!)
      .expect(400);
  });

  // --- Helpers ----------------------------------------------------------------------

  async function invite(extra: object = {}) {
    const response = await request(server)
      .post('/api/v1/organisation-invitations')
      .set('Cookie', cookies.admin!)
      .send({
        organisationName: `Invited ${TAG} ${randomUUID().slice(0, 8)}`,
        ...extra,
      })
      .expect(201);
    return response.body as {
      id: string;
      code: string;
      organisationName: string;
      contactEmail: string | null;
      standing: string;
      createdAt: string;
      expiresAt: string;
      createdBy: string | null;
    };
  }

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
    agreementReference: 'DSA/2026/033',
    agreementDate: '2026-09-01',
    ...overrides,
  });

  async function clientFor(email: string) {
    const account = await prisma.portalAccount.findUniqueOrThrow({
      where: { email },
      select: { apiClientId: true },
    });
    return { id: account.apiClientId };
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
    const invitations = await prisma.portalInvitation.findMany({
      where: { organisationName: { contains: TAG } },
      select: { id: true },
    });
    const subjectIds = [
      ...clientIds,
      ...invitations.map((invitation) => invitation.id),
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
        ],
      },
    });
    await prisma.portalInvitation.deleteMany({
      where: { id: { in: invitations.map((invitation) => invitation.id) } },
    });
    await prisma.apiClientScope.deleteMany({
      where: { clientId: { in: clientIds } },
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

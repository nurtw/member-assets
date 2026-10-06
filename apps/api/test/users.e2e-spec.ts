import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { totpCode, totpStep } from './../src/auth/totp.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import {
  AUTH_MFA_ENFORCED,
  SettingsService,
} from './../src/settings/settings.service.js';

/**
 * Officer accounts, their access, and the second factor, end to end (PRD §16,
 * §17.1 — `plans/28-officer-accounts-and-mfa.md`).
 *
 * The assertions that carry weight:
 *
 * - a new officer signs in with a temporary password and can do nothing but
 *   change it;
 * - nobody gives a role or a permission they do not hold in that scope, and
 *   nobody changes their own access;
 * - a system role cannot be changed, and `vehicle.declare` cannot be put in
 *   any role;
 * - with enforcement on, a privileged permission needs a session that has
 *   proved a second factor (Requirement 17.1);
 * - no response or audit event holds a password, a hash, or a secret.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-users';
const PASSWORD = 'e2e-fixture-password-1';
const CHOSEN = 'a-much-longer-passphrase';
const TEMPORARY = /^[a-zA-Z2-9]{4}(-[a-zA-Z2-9]{4}){3}$/;

describe('Officer accounts (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const savedKey = process.env.MFA_ENCRYPTION_KEY;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /** Every response body, for the leak check. */
  const seen: string[] = [];
  /** Secrets that must appear in no audit event, and in no later response. */
  const secrets: string[] = [];
  let enforced = false;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = `${TAG}-encryption-key`;
    await cleanUp();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    // Enforcement is one row for the whole database, and other suites run
    // beside this one. It is switched for this application instance only.
    const settings = app.get(SettingsService);
    const isEnabled = settings.isEnabled.bind(settings);
    vi.spyOn(settings, 'isEnabled').mockImplementation((key, fallback) =>
      key === AUTH_MFA_ENFORCED
        ? Promise.resolve(enforced)
        : isEnabled(key, fallback),
    );

    const council = await prisma.organisation.findFirstOrThrow({
      where: { level: 'COUNCIL' },
    });
    ids.council = council.id;
    async function node(
      key: string,
      level: 'ZONE' | 'BRANCH',
      parent: { id: string; path: string },
    ) {
      const row = await prisma.organisation.create({
        data: {
          name: `${key} ${TAG}`,
          level,
          parentId: parent.id,
          path: `placeholder-${key}-${TAG}`,
        },
      });
      const path = `${parent.path}${row.id}/`;
      await prisma.organisation.update({
        where: { id: row.id },
        data: { path },
      });
      ids[key] = row.id;
      return { id: row.id, path };
    }
    const zone = await node('zone', 'ZONE', council);
    await node('branchA', 'BRANCH', zone);
    await node('branchB', 'BRANCH', zone);

    const users: Record<string, [string, readonly string[]]> = {
      // Everything the tests give or take away, held Union-wide.
      admin: [
        'council',
        [
          'user.read',
          'user.manage',
          'role.read',
          'role.manage',
          'permission.read',
          'permission.grant',
          'permission.revoke',
          'system_setting.manage',
          'organisation.read',
          'member.read',
          'member.create',
          'application.read',
          'master_data.read',
          'vehicle.read',
          'vehicle.record',
          'vehicle.declare',
        ],
      ],
      // Manages accounts in one branch, and holds little else there.
      branchAdmin: [
        'branchA',
        ['user.read', 'user.manage', 'role.read', 'member.read'],
      ],
    };
    for (const [who, [scope, permissions]] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: {
          // Addresses are stored lower-cased, as sign-in compares them.
          email: `${who.toLowerCase()}.${TAG}@nurtw.test`,
          fullName: `${who} ${TAG}`,
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      ids[who] = user.id;
      for (const code of permissions) {
        const permission = await prisma.permission.findUniqueOrThrow({
          where: { code },
        });
        await prisma.userPermissionGrant.create({
          data: {
            userId: user.id,
            permissionId: permission.id,
            organisationId: ids[scope]!,
            grantedByUserId: user.id,
            reason: 'e2e fixture',
          },
        });
      }
      cookies[who] = await signIn(
        `${who.toLowerCase()}.${TAG}@nurtw.test`,
        PASSWORD,
      );
    }
  });

  afterAll(async () => {
    if (savedKey === undefined) {
      delete process.env.MFA_ENCRYPTION_KEY;
    } else {
      process.env.MFA_ENCRYPTION_KEY = savedKey;
    }
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- Helpers -------------------------------------------------------------------

  async function login(email: string, password: string, code?: string) {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password, ...(code ? { code } : {}) });
    seen.push(response.text);
    return response;
  }

  async function signIn(email: string, password: string, code?: string) {
    const response = await login(email, password, code);
    expect(response.status).toBe(200);
    const raw = response.headers['set-cookie'];
    return (Array.isArray(raw) ? raw[0]! : raw!).split(';')[0]!;
  }

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

  const email = (name: string) => `${name}.${TAG}@nurtw.test`;

  /** Creates an officer and signs them in on their temporary password. */
  async function officer(name: string) {
    const created = await call('post', '/users', {
      email: email(name),
      fullName: `${name} Officer`,
    });
    expect(created.status).toBe(201);
    const temporary = created.body.temporaryPassword as string;
    secrets.push(temporary);
    ids[name] = created.body.user.id as string;
    cookies[name] = await signIn(email(name), temporary);
    return { id: ids[name]!, temporary };
  }

  /** A code the account has not yet used: the step after the last accepted. */
  async function nextCode(userId: string, secret: string) {
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaLastStep: true },
    });
    const current = totpStep(new Date());
    const last =
      row.mfaLastStep === null ? current - 1 : Number(row.mfaLastStep);
    return totpCode(secret, Math.max(current, last + 1));
  }

  // --- A new officer ---------------------------------------------------------------

  describe('a new officer', () => {
    it('is created with a temporary password, shown once', async () => {
      const created = await call('post', '/users', {
        email: `  NEW.${TAG}@NURTW.test `,
        fullName: 'New Officer',
      });
      expect(created.status).toBe(201);
      expect(created.body.temporaryPassword).toMatch(TEMPORARY);
      expect(created.body.user).toMatchObject({
        email: email('new'),
        isActive: true,
        mustChangePassword: true,
        secondFactorEnrolled: false,
        roles: [],
      });
      ids.new = created.body.user.id;
      secrets.push(created.body.temporaryPassword);
      ids.newTemporary = created.body.temporaryPassword;

      // It is in no later response.
      const read = await call('get', `/users/${ids.new}`);
      expect(read.text).not.toContain(ids.newTemporary);
      expect(
        (
          await call('post', '/users', {
            email: email('new'),
            fullName: 'Twin',
          })
        ).status,
      ).toBe(409);
    });

    it('can do nothing on a temporary password but change it', async () => {
      cookies.new = await signIn(email('new'), ids.newTemporary!);
      const me = await call('get', '/auth/me', undefined, 'new');
      expect(me.status).toBe(200);
      expect(me.body.account.mustChangePassword).toBe(true);

      // Even with a role, nothing opens until the password is changed.
      await call('post', `/users/${ids.new}/roles`, {
        roleCode: 'FIELD_ENUMERATOR',
        organisationId: ids.branchA,
        reason: 'Posted to the branch',
      });
      expect(
        (await call('get', '/organisations', undefined, 'new')).status,
      ).toBe(403);
    });

    it('must give the current password, and choose a sound one', async () => {
      const change = (currentPassword: string, newPassword: string) =>
        call('post', '/auth/password', { currentPassword, newPassword }, 'new');

      expect((await change('not-the-password', CHOSEN)).status).toBe(401);
      expect((await change(ids.newTemporary!, 'short')).status).toBe(400);
      expect((await change(ids.newTemporary!, 'new-officer-123')).status).toBe(
        400,
      );
      expect((await change(ids.newTemporary!, ids.newTemporary!)).status).toBe(
        400,
      );

      const other = await signIn(email('new'), ids.newTemporary!);
      expect((await change(ids.newTemporary!, CHOSEN)).status).toBe(200);

      // The role now applies, the temporary password is dead, and the other
      // session was ended.
      const me = await call('get', '/auth/me', undefined, 'new');
      expect(me.body.account.mustChangePassword).toBe(false);
      expect(
        (await call('get', '/organisations', undefined, 'new')).status,
      ).toBe(200);
      expect((await login(email('new'), ids.newTemporary!)).status).toBe(401);
      await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', other)
        .expect(401);
    });
  });

  // --- Giving access -----------------------------------------------------------------

  describe('roles', () => {
    it('are given within a part of the Union, and apply beneath it', async () => {
      const me = await call('get', '/auth/me', undefined, 'new');
      const record = (
        me.body.permissions as { permission: string; scopePath: string }[]
      ).find((entry) => entry.permission === 'vehicle.record');
      expect(record?.scopePath).toContain(ids.branchA);

      const detail = await call('get', `/users/${ids.new}`);
      expect(detail.body.user.roles).toEqual([
        expect.objectContaining({
          role: { code: 'FIELD_ENUMERATOR', label: 'Field enumerator' },
          organisation: expect.objectContaining({ id: ids.branchA }),
        }),
      ]);
      expect(
        (
          await call('post', `/users/${ids.new}/roles`, {
            roleCode: 'FIELD_ENUMERATOR',
            organisationId: ids.branchA,
            reason: 'Twice',
          })
        ).status,
      ).toBe(409);
    });

    it('are not given by somebody who lacks what they hold (no escalation)', async () => {
      // The branch administrator holds `user.manage` there, and not
      // `vehicle.read`, which the verification officer role carries.
      const response = await call(
        'post',
        `/users/${ids.new}/roles`,
        {
          roleCode: 'VERIFICATION_OFFICER',
          organisationId: ids.branchA,
          reason: 'Trying to give more than is held',
        },
        'branchAdmin',
      );
      expect(response.status).toBe(403);
    });

    it('are not given outside the giver’s own scope, which answers 404', async () => {
      for (const organisationId of [ids.branchB, ids.zone, ids.council]) {
        const response = await call(
          'post',
          `/users/${ids.new}/roles`,
          {
            roleCode: 'FIELD_ENUMERATOR',
            organisationId,
            reason: 'Outside my branch',
          },
          'branchAdmin',
        );
        expect(response.status).toBe(404);
      }
    });

    it('are never changed by their own holder', async () => {
      expect(
        (
          await call('post', `/users/${ids.admin}/roles`, {
            roleCode: 'AUDITOR',
            organisationId: ids.council,
            reason: 'To myself',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call('post', `/users/${ids.admin}/status`, {
            isActive: false,
            reason: 'Myself',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call('post', `/users/${ids.admin}/password/reset`, {
            reason: 'Myself',
          })
        ).status,
      ).toBe(403);
    });

    it('are taken away with a reason, on the next request', async () => {
      const detail = await call('get', `/users/${ids.new}`);
      const assignment = detail.body.user.roles[0].id as string;
      expect(
        (await call('post', `/users/${ids.new}/roles/${assignment}/remove`, {}))
          .status,
      ).toBe(400);
      const removed = await call(
        'post',
        `/users/${ids.new}/roles/${assignment}/remove`,
        { reason: 'Moved to another branch' },
      );
      expect(removed.status).toBe(200);
      expect(removed.body.user.roles).toEqual([]);
      expect(
        (await call('get', '/organisations', undefined, 'new')).status,
      ).toBe(403);

      const actions = (
        await prisma.auditEvent.findMany({
          where: { subjectId: ids.new },
          orderBy: { createdAt: 'asc' },
        })
      ).map((event) => event.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'user.create',
          'auth.password_change',
          'user.role_assign',
          'user.role_remove',
        ]),
      );
    });
  });

  describe('single permissions', () => {
    it('grant `vehicle.declare` to a named officer, with a reason', async () => {
      const granted = await call('post', `/users/${ids.new}/grants`, {
        permission: 'vehicle.declare',
        organisationId: ids.branchA,
        reason: 'Authorised to declare for this branch',
      });
      expect(granted.status).toBe(201);
      expect(granted.body.user.grants).toEqual([
        expect.objectContaining({
          permission: 'vehicle.declare',
          reason: 'Authorised to declare for this branch',
          by: expect.objectContaining({ id: ids.admin }),
        }),
      ]);
      const holders = await call(
        'get',
        '/auth/holders?permission=vehicle.declare',
      );
      expect(
        (holders.body.holders as { userId: string }[]).map((row) => row.userId),
      ).toContain(ids.new);
    });

    it('refuse a permission that is not in the catalogue', async () => {
      expect(
        (
          await call('post', `/users/${ids.new}/grants`, {
            permission: 'database.read',
            organisationId: ids.branchA,
            reason: 'No such permission',
          })
        ).status,
      ).toBe(400);
    });

    it('cannot be granted by somebody without `permission.grant`', async () => {
      const response = await call(
        'post',
        `/users/${ids.new}/grants`,
        {
          permission: 'member.read',
          organisationId: ids.branchA,
          reason: 'Not mine to give',
        },
        'branchAdmin',
      );
      expect(response.status).toBe(403);
    });

    it('are revoked, which wins over the grant, and the revocation lifted', async () => {
      const held = async () =>
        (
          (await call('get', '/auth/me', undefined, 'new')).body
            .permissions as { permission: string }[]
        ).some((entry) => entry.permission === 'vehicle.declare');
      expect(await held()).toBe(true);

      const revoked = await call('post', `/users/${ids.new}/revocations`, {
        permission: 'vehicle.declare',
        organisationId: ids.branchA,
        reason: 'Under review',
      });
      expect(revoked.status).toBe(201);
      expect(await held()).toBe(false);

      const lifted = await call(
        'post',
        `/users/${ids.new}/revocations/${revoked.body.user.revocations[0].id}/lift`,
        { reason: 'Review closed' },
      );
      expect(lifted.status).toBe(200);
      expect(await held()).toBe(true);

      const withdrawn = await call(
        'post',
        `/users/${ids.new}/grants/${lifted.body.user.grants[0].id}/withdraw`,
        { reason: 'No longer declaring' },
      );
      expect(withdrawn.status).toBe(200);
      expect(await held()).toBe(false);
    });
  });

  describe('composed roles (Decision 9.5)', () => {
    it('list the roles of PRD §16 as system roles', async () => {
      const response = await call('get', '/roles');
      expect(response.status).toBe(200);
      const roles = response.body.roles as {
        code: string;
        isSystem: boolean;
        permissions: string[];
      }[];
      const superAdministrator = roles.find(
        (role) => role.code === 'SUPER_ADMINISTRATOR',
      );
      expect(superAdministrator?.isSystem).toBe(true);
      // `vehicle.declare` is in the super administrator's bundle and no other.
      expect(
        roles
          .filter((role) => role.permissions.includes('vehicle.declare'))
          .map((role) => role.code),
      ).toEqual(['SUPER_ADMINISTRATOR']);
    });

    it('cannot hold a permission given only by express grant', async () => {
      for (const permission of [
        'vehicle.declare',
        'payment.manage_settlement',
        'sticker.stock_intake',
      ]) {
        const response = await call('post', '/roles', {
          code: 'E2E_USERS_DECLARER',
          label: 'Declarer',
          permissions: ['vehicle.read', permission],
        });
        expect(response.status).toBe(400);
      }
    });

    it('are composed only from what the author holds', async () => {
      // The fixture administrator does not hold `card.issue`.
      expect(
        (
          await call('post', '/roles', {
            code: 'E2E_USERS_CARDS',
            label: 'Cards',
            permissions: ['card.issue'],
          })
        ).status,
      ).toBe(403);

      const created = await call('post', '/roles', {
        code: 'E2E_USERS_READER',
        label: 'Branch reader',
        permissions: ['member.read', 'organisation.read'],
      });
      expect(created.status).toBe(201);
      expect(created.body.role).toMatchObject({
        code: 'E2E_USERS_READER',
        isSystem: false,
        permissions: ['member.read', 'organisation.read'],
        assignmentCount: 0,
      });
      expect(
        (
          await call('post', '/roles', {
            code: 'E2E_USERS_READER',
            label: 'Twin',
            permissions: ['member.read'],
          })
        ).status,
      ).toBe(409);
    });

    it('can be given by an administrator who holds all of it there', async () => {
      // `member.read` is all the branch administrator holds beyond accounts.
      const narrowed = await call('put', '/roles/E2E_USERS_READER', {
        label: 'Branch reader',
        permissions: ['member.read'],
        reason: 'Narrowed to members',
      });
      expect(narrowed.status).toBe(200);

      const assigned = await call(
        'post',
        `/users/${ids.new}/roles`,
        {
          roleCode: 'E2E_USERS_READER',
          organisationId: ids.branchA,
          reason: 'Reads members in my branch',
        },
        'branchAdmin',
      );
      expect(assigned.status).toBe(201);

      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'role.update', actorUserId: ids.admin },
      });
      expect(event?.reason).toBe('Narrowed to members');
      expect(event?.beforeValue).toMatchObject({
        permissions: ['member.read', 'organisation.read'],
      });
      expect(event?.afterValue).toMatchObject({ permissions: ['member.read'] });
    });

    it('leave the roles of PRD §16 unchangeable', async () => {
      const response = await call('put', '/roles/AUDITOR', {
        label: 'Auditor',
        permissions: ['member.read'],
        reason: 'Trying to change a system role',
      });
      expect(response.status).toBe(409);
    });
  });

  // --- The account ---------------------------------------------------------------------

  describe('deactivating and resetting', () => {
    it('ends an officer’s sessions at once, and keeps the account', async () => {
      await officer('leaver');
      const off = await call('post', `/users/${ids.leaver}/status`, {
        isActive: false,
        reason: 'Left the Union',
      });
      expect(off.status).toBe(200);
      expect(off.body.user.isActive).toBe(false);
      expect((await call('get', '/auth/me', undefined, 'leaver')).status).toBe(
        401,
      );
      expect(
        (
          await call('post', `/users/${ids.leaver}/status`, {
            isActive: false,
            reason: 'Again',
          })
        ).status,
      ).toBe(409);

      const on = await call('post', `/users/${ids.leaver}/status`, {
        isActive: true,
        reason: 'Returned',
      });
      expect(on.body.user.isActive).toBe(true);
    });

    it('issues a new temporary password, which must be changed again', async () => {
      const { temporary } = await officer('forgetful');
      await call(
        'post',
        '/auth/password',
        { currentPassword: temporary, newPassword: CHOSEN },
        'forgetful',
      );

      const reset = await call(
        'post',
        `/users/${ids.forgetful}/password/reset`,
        {
          reason: 'Forgot it',
        },
      );
      expect(reset.status).toBe(200);
      expect(reset.body.temporaryPassword).toMatch(TEMPORARY);
      expect(reset.body.temporaryPassword).not.toBe(temporary);
      expect(reset.body.user.mustChangePassword).toBe(true);
      secrets.push(reset.body.temporaryPassword);

      expect(
        (await call('get', '/auth/me', undefined, 'forgetful')).status,
      ).toBe(401);
      expect((await login(email('forgetful'), CHOSEN)).status).toBe(401);
      expect(
        (await login(email('forgetful'), reset.body.temporaryPassword)).status,
      ).toBe(200);
    });

    it('amends a name with a reason, and nothing else', async () => {
      const amended = await call('patch', `/users/${ids.forgetful}`, {
        fullName: 'Forgetful Renamed',
        isActive: false,
        mustChangePassword: false,
        reason: 'Name corrected',
      });
      expect(amended.status).toBe(200);
      expect(amended.body.user).toMatchObject({
        fullName: 'Forgetful Renamed',
        isActive: true,
        mustChangePassword: true,
      });
    });

    it('locks an account after ten failed sign-ins, even to the right password', async () => {
      const { temporary } = await officer('guessed');
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await login(email('guessed'), 'wrong-password')).status).toBe(
          401,
        );
      }
      const locked = await login(email('guessed'), temporary);
      expect(locked.status).toBe(401);
      expect(locked.body.error.details).toBeUndefined();
      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'auth.lockout', subjectId: ids.guessed },
      });
      expect(event).toBeDefined();

      // A reset by an administrator clears the lock.
      const reset = await call('post', `/users/${ids.guessed}/password/reset`, {
        reason: 'Locked out',
      });
      secrets.push(reset.body.temporaryPassword);
      expect(
        (await login(email('guessed'), reset.body.temporaryPassword)).status,
      ).toBe(200);
    }, 60_000);
  });

  // --- The second factor (Requirement 17.1) -----------------------------------------------

  describe('the second factor', () => {
    let secret: string;
    let recoveryCodes: string[];

    it('is set up with a key, and confirmed with a code from it', async () => {
      const { temporary } = await officer('keyed');
      await call(
        'post',
        '/auth/password',
        { currentPassword: temporary, newPassword: CHOSEN },
        'keyed',
      );

      const enrolment = await call(
        'post',
        '/auth/mfa/enrol',
        undefined,
        'keyed',
      );
      expect(enrolment.status).toBe(200);
      secret = enrolment.body.secret as string;
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(enrolment.body.otpauthUri).toContain(`secret=${secret}`);
      secrets.push(secret);

      // Nothing changes until a code confirms it.
      expect((await login(email('keyed'), CHOSEN)).status).toBe(200);
      expect(
        (await call('post', '/auth/mfa/confirm', { code: '000000' }, 'keyed'))
          .status,
      ).toBe(400);

      const confirmed = await call(
        'post',
        '/auth/mfa/confirm',
        { code: totpCode(secret, totpStep(new Date())) },
        'keyed',
      );
      expect(confirmed.status).toBe(200);
      recoveryCodes = confirmed.body.recoveryCodes as string[];
      expect(recoveryCodes).toHaveLength(10);
      secrets.push(...recoveryCodes);

      const me = await call('get', '/auth/me', undefined, 'keyed');
      expect(me.body.account.secondFactor).toMatchObject({
        enrolled: true,
        verified: true,
      });
      // The stored secret is encrypted.
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: ids.keyed },
      });
      expect(row.mfaSecret).not.toContain(secret);
      expect(row.mfaSecret).toMatch(/^v1:/);
    });

    it('is then asked for at every sign-in, after the password', async () => {
      // A wrong password says nothing of the second factor.
      const wrong = await login(email('keyed'), 'wrong-password', '123456');
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.details).toBeUndefined();

      const missing = await login(email('keyed'), CHOSEN);
      expect(missing.status).toBe(401);
      expect(missing.body.error.details).toEqual([
        { field: 'code', message: expect.any(String) },
      ]);
      expect((await login(email('keyed'), CHOSEN, '000000')).status).toBe(401);

      const code = await nextCode(ids.keyed!, secret);
      expect((await login(email('keyed'), CHOSEN, code)).status).toBe(200);
      // The same code is not accepted twice.
      expect((await login(email('keyed'), CHOSEN, code)).status).toBe(401);
    });

    it('accepts a recovery code once, in place of the app', async () => {
      const [first] = recoveryCodes;
      cookies.keyed = await signIn(email('keyed'), CHOSEN, first);
      expect((await login(email('keyed'), CHOSEN, first)).status).toBe(401);
      const [event] = await prisma.auditEvent.findMany({
        where: { action: 'auth.recovery_code_used', subjectId: ids.keyed },
      });
      expect(event?.afterValue).toEqual({ recoveryCodesLeft: 9 });

      const replaced = await call(
        'post',
        '/auth/mfa/recovery-codes',
        undefined,
        'keyed',
      );
      expect(replaced.status).toBe(200);
      expect(replaced.body.recoveryCodes).toHaveLength(10);
      secrets.push(...(replaced.body.recoveryCodes as string[]));
      expect(
        (await login(email('keyed'), CHOSEN, recoveryCodes[1])).status,
      ).toBe(401);
    });

    it('is removed by an administrator for a lost phone', async () => {
      expect(
        (await call('post', `/users/${ids.keyed}/mfa/reset`, {})).status,
      ).toBe(400);
      const reset = await call('post', `/users/${ids.keyed}/mfa/reset`, {
        reason: 'Phone lost, no recovery codes',
      });
      expect(reset.status).toBe(200);
      expect(reset.body.user.secondFactorEnrolled).toBe(false);
      expect((await call('get', '/auth/me', undefined, 'keyed')).status).toBe(
        401,
      );
      expect((await login(email('keyed'), CHOSEN)).status).toBe(200);
      expect(
        (
          await call('post', `/users/${ids.keyed}/mfa/reset`, {
            reason: 'Again',
          })
        ).status,
      ).toBe(409);
    });

    it('is required for a privileged permission once enforcement is on', async () => {
      const security = await call('get', '/settings/security');
      expect(security.status).toBe(200);
      expect(
        (security.body.privilegedWithoutSecondFactor as { id: string }[]).map(
          (row) => row.id,
        ),
      ).toEqual(expect.arrayContaining([ids.admin, ids.branchAdmin]));

      // Requiring it needs a session that has itself proved one.
      expect(
        (
          await call('put', '/settings/security/second-factor', {
            enforced: true,
            reason: 'Go-live',
          })
        ).status,
      ).toBe(409);

      enforced = true;
      try {
        // An everyday permission is unaffected; a privileged one is refused.
        expect((await call('get', '/users')).status).toBe(200);
        expect(
          (
            await call('post', '/users', {
              email: email('blocked'),
              fullName: 'Blocked',
            })
          ).status,
        ).toBe(403);
        const me = await call('get', '/auth/me');
        expect(me.body.account.secondFactor).toEqual({
          enrolled: false,
          verified: false,
          required: true,
        });

        // The administrator enrols, and the same session may then proceed.
        const enrolment = await call('post', '/auth/mfa/enrol');
        secrets.push(enrolment.body.secret);
        const confirmed = await call('post', '/auth/mfa/confirm', {
          code: totpCode(enrolment.body.secret, totpStep(new Date())),
        });
        expect(confirmed.status).toBe(200);
        secrets.push(...(confirmed.body.recoveryCodes as string[]));
        const created = await call('post', '/users', {
          email: email('allowed'),
          fullName: 'Allowed After Enrolling',
        });
        expect(created.status).toBe(201);
        secrets.push(created.body.temporaryPassword);
      } finally {
        enforced = false;
      }
    });
  });

  // --- Nothing leaks ---------------------------------------------------------------------

  describe('passwords and secrets', () => {
    it('appear in no response but the one that issued them', () => {
      for (const secret of secrets) {
        const occurrences = seen.filter((body) => body.includes(secret)).length;
        expect(occurrences, 'a secret was returned more than once').toBe(1);
      }
      const all = seen.join('\n');
      expect(all).not.toContain('passwordHash');
      expect(all).not.toContain('mfaSecret');
      expect(all).not.toMatch(/scrypt\$/);
    });

    it('appear in no audit event', async () => {
      const users = await prisma.user.findMany({
        where: { email: { contains: TAG } },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);
      const events = JSON.stringify(
        await prisma.auditEvent.findMany({
          where: {
            OR: [
              { subjectId: { in: userIds } },
              { actorUserId: { in: userIds } },
            ],
          },
        }),
      );
      expect(events.length).toBeGreaterThan(2000);
      for (const secret of [...secrets, PASSWORD, CHOSEN]) {
        expect(events).not.toContain(secret);
      }
    });
  });

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const roles = await prisma.role.findMany({
      where: { code: { startsWith: 'E2E_USERS_' } },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { subjectId: { in: [...userIds, ...roleIds] } },
        ],
      },
    });
    await prisma.userRoleAssignment.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
    });
    await prisma.userPermissionRevocation.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { revokedByUserId: { in: userIds } }],
      },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { grantedByUserId: { in: userIds } }],
      },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const nodes = await prisma.organisation.findMany({
      where: { name: { endsWith: TAG } },
      select: { id: true, level: true },
    });
    for (const level of ['BRANCH', 'ZONE'] as const) {
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

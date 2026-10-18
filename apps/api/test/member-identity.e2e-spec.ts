import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * A member's NIN and photograph, end to end (item 44; PRD Requirement 7.4).
 *
 * What carries weight: a NIN is sealed, never returned whole by any route or
 * written to the audit trail; one NIN is held by one record at a time; and
 * only an officer who may change a member, within their scope, changes either.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-nin';
const PASSWORD = 'e2e-fixture-password-1';

/** A one-pixel PNG. Real bytes, so the content sniffer accepts it. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Synthetic NINs, different on every run: one NIN is held by one record in the
 * whole database, so a value left by an earlier run must not collide.
 */
const RUN = String(Date.now()).slice(-6);
const ninFor = (n: number) => `40${RUN}${String(n).padStart(3, '0')}`;

interface Fixture {
  unitAId: string;
  lgaId: string;
}

describe('A member’s NIN and photograph (e2e, item 44)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let fixture: Fixture;
  const cookies: Record<string, string> = {};
  const keyBefore = process.env.IDENTITY_ENCRYPTION_KEY;

  beforeAll(async () => {
    // Read when a NIN is sealed, not at start-up, so a test can take it away.
    process.env.IDENTITY_ENCRYPTION_KEY = `e2e-identity-key-${randomUUID()}`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await cleanUp();
    fixture = await buildFixture();

    for (const who of [
      'registrar',
      'updater',
      'sensitive',
      'reader',
      'otherbranch',
      'suspender',
    ]) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
    if (keyBefore === undefined) {
      delete process.env.IDENTITY_ENCRYPTION_KEY;
    } else {
      process.env.IDENTITY_ENCRYPTION_KEY = keyBefore;
    }
  });

  function applicationBody(surname: string, nin?: string) {
    return {
      applicant: {
        surname,
        firstName: 'Chidi',
        residentialAddress: '14 Zik Avenue, Awka',
        townCity: 'Awka',
        residentialLgaId: fixture.lgaId,
        phone: '0803 123 4567',
        ...(nin === undefined ? {} : { nin }),
      },
      assignment: { organisationId: fixture.unitAId },
      nextOfKin: { fullName: 'Ngozi Okeke', phone: '08051112222' },
    };
  }

  async function register(
    surname: string,
    nin?: string,
  ): Promise<{ applicationId: string; memberId: string }> {
    const response = await request(server)
      .post('/api/v1/applications')
      .set('Cookie', cookies.registrar!)
      .send(applicationBody(surname, nin))
      .expect(201);
    const application = response.body.application as {
      id: string;
      member: { id: string };
    };
    return { applicationId: application.id, memberId: application.member.id };
  }

  /** A member as the legacy import leaves one: active, numbered, no application. */
  async function migratedMember(surname: string): Promise<string> {
    const member = await prisma.member.create({
      data: {
        status: 'ACTIVE',
        membershipNumber: `E2E-NIN-${surname.toUpperCase()}`,
        surname,
        firstName: 'Ada',
        organisationId: fixture.unitAId,
        legacyId: `${TAG}-${surname}`,
        contact: {
          create: {
            phone: '+2348030000001',
            residentialAddress: '1 Fixture Close, Awka',
          },
        },
      },
    });
    return member.id;
  }

  async function lastFourOf(memberId: string): Promise<string | null> {
    const row = await prisma.memberIdentity.findUnique({ where: { memberId } });
    return row?.ninLastFour ?? null;
  }

  async function auditOf(subjectIds: string[]): Promise<string> {
    const events = await prisma.auditEvent.findMany({
      where: { subjectId: { in: subjectIds } },
    });
    expect(events.length).toBeGreaterThan(0);
    return JSON.stringify(events);
  }

  // --- At registration -----------------------------------------------------

  describe('at registration', () => {
    it('is recorded sealed, and the application shows only its last four digits', async () => {
      const nin = ninFor(1);
      const spaced = `${nin.slice(0, 3)} ${nin.slice(3, 7)}-${nin.slice(7)}`;
      const created = await register('Ninfirst', spaced);

      const row = await prisma.memberIdentity.findUniqueOrThrow({
        where: { memberId: created.memberId },
      });
      expect(row.ninLastFour).toBe(nin.slice(-4));
      expect(row.ninCiphertext).not.toContain(nin);
      expect(row.ninCiphertext.startsWith('v1:')).toBe(true);
      expect(row.ninLookupHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.releasedAt).toBeNull();

      const detail = await request(server)
        .get(`/api/v1/applications/${created.applicationId}`)
        .set('Cookie', cookies.registrar!)
        .expect(200);
      expect(detail.body.application.ninRecorded).toBe(true);
      expect(detail.body.application.ninLastFour).toBe(nin.slice(-4));
      expect(JSON.stringify(detail.body)).not.toContain(nin);
    });

    it('may be left out', async () => {
      const created = await register('Ninnone');
      expect(await lastFourOf(created.memberId)).toBeNull();

      const detail = await request(server)
        .get(`/api/v1/applications/${created.applicationId}`)
        .set('Cookie', cookies.registrar!)
        .expect(200);
      expect(detail.body.application.ninRecorded).toBe(false);
      expect(detail.body.application.ninLastFour).toBeNull();
    });

    it('a malformed one is refused against its field', async () => {
      const response = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody('Ninmalformed', '1234567'))
        .expect(400);
      expect(
        response.body.error.details.map((d: { field: string }) => d.field),
      ).toContain('applicant.nin');
    });

    it('a NIN another member holds is refused, and nothing is saved', async () => {
      const nin = ninFor(2);
      await register('Ninholder', nin);

      const refused = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody('Nincopy', nin))
        .expect(409);
      expect(JSON.stringify(refused.body)).not.toContain(nin);
      expect(await prisma.member.count({ where: { surname: 'Nincopy' } })).toBe(
        0,
      );
    });

    it('without the key nothing is saved, and the rest of registering still works', async () => {
      const saved = process.env.IDENTITY_ENCRYPTION_KEY;
      delete process.env.IDENTITY_ENCRYPTION_KEY;
      try {
        await request(server)
          .post('/api/v1/applications')
          .set('Cookie', cookies.registrar!)
          .send(applicationBody('Ninnokey', ninFor(3)))
          .expect(503);
        expect(
          await prisma.member.count({ where: { surname: 'Ninnokey' } }),
        ).toBe(0);

        await register('Ninnokeyplain');
      } finally {
        process.env.IDENTITY_ENCRYPTION_KEY = saved;
      }
    });

    it('amending a draft replaces it when one is given, and keeps it when not', async () => {
      const first = ninFor(4);
      const second = ninFor(5);
      const created = await register('Ninamend', first);
      const { applicant } = applicationBody('Ninamend');

      await request(server)
        .patch(`/api/v1/applications/${created.applicationId}`)
        .set('Cookie', cookies.registrar!)
        .send({ applicant })
        .expect(200);
      expect(await lastFourOf(created.memberId)).toBe(first.slice(-4));

      await request(server)
        .patch(`/api/v1/applications/${created.applicationId}`)
        .set('Cookie', cookies.registrar!)
        .send({ applicant: { ...applicant, nin: second } })
        .expect(200);
      expect(await lastFourOf(created.memberId)).toBe(second.slice(-4));
      expect(await auditOf([created.applicationId])).not.toContain(second);
    });
  });

  // --- What each reader is told --------------------------------------------

  describe('what each reader is told', () => {
    it('a reader of the member learns that one is recorded, and nothing more', async () => {
      const nin = ninFor(6);
      const created = await register('Ninreaders', nin);

      const asReader = await request(server)
        .get(`/api/v1/members/${created.memberId}`)
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(asReader.body.member.ninRecorded).toBe(true);
      expect('sensitive' in asReader.body.member).toBe(false);
      expect(JSON.stringify(asReader.body)).not.toContain(nin);

      const asSensitive = await request(server)
        .get(`/api/v1/members/${created.memberId}`)
        .set('Cookie', cookies.sensitive!)
        .expect(200);
      expect(asSensitive.body.member.sensitive.ninLastFour).toBe(nin.slice(-4));
      expect(JSON.stringify(asSensitive.body)).not.toContain(nin);
    });

    it('no list carries it, and the audit trail never records it', async () => {
      const nin = ninFor(7);
      const created = await register('Ninlisted', nin);

      const members = await request(server)
        .get('/api/v1/members?q=Ninlisted')
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(members.body.members).toHaveLength(1);
      expect(JSON.stringify(members.body)).not.toContain(nin);
      expect(JSON.stringify(members.body)).not.toContain('"ninRecorded"');
      expect(JSON.stringify(members.body)).not.toContain('"ninLastFour"');

      const applications = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);
      expect(JSON.stringify(applications.body)).not.toContain(nin);

      expect(
        await auditOf([created.memberId, created.applicationId]),
      ).not.toContain(nin);
    });
  });

  // --- On the member's record ----------------------------------------------

  describe('on the member’s record', () => {
    it('an officer who may change the member records, replaces, and removes it', async () => {
      const id = await migratedMember('Ninrecord');
      const first = ninFor(8);
      const second = ninFor(9);

      const recorded = await request(server)
        .put(`/api/v1/members/${id}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin: first })
        .expect(200);
      expect(recorded.body.identity).toEqual({
        ninRecorded: true,
        ninLastFour: first.slice(-4),
      });

      const replaced = await request(server)
        .put(`/api/v1/members/${id}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin: second })
        .expect(200);
      expect(replaced.body.identity.ninLastFour).toBe(second.slice(-4));

      // The audit trail says that it changed, never what to.
      const events = await prisma.auditEvent.findMany({
        where: { subjectId: id, action: 'member.nin.record' },
        orderBy: { createdAt: 'asc' },
      });
      expect(
        events.map((event) => [event.beforeValue, event.afterValue]),
      ).toEqual([
        [{ ninRecorded: false }, { ninRecorded: true }],
        [{ ninRecorded: true }, { ninRecorded: true }],
      ]);

      await request(server)
        .post(`/api/v1/members/${id}/nin/removal`)
        .set('Cookie', cookies.updater!)
        .send({})
        .expect(400);
      const removed = await request(server)
        .post(`/api/v1/members/${id}/nin/removal`)
        .set('Cookie', cookies.updater!)
        .send({ reason: 'Recorded against the wrong member' })
        .expect(201);
      expect(removed.body.identity).toEqual({
        ninRecorded: false,
        ninLastFour: null,
      });
      await request(server)
        .post(`/api/v1/members/${id}/nin/removal`)
        .set('Cookie', cookies.updater!)
        .send({ reason: 'Once more' })
        .expect(409);

      const audit = await auditOf([id]);
      expect(audit).not.toContain(first);
      expect(audit).not.toContain(second);
    });

    it('a NIN taken off the wrong member can then be recorded on its own', async () => {
      const wrong = await migratedMember('Ninwrong');
      const owner = await migratedMember('Ninowner');
      const nin = ninFor(10);

      await request(server)
        .put(`/api/v1/members/${wrong}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin })
        .expect(200);
      await request(server)
        .put(`/api/v1/members/${owner}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin })
        .expect(409);

      await request(server)
        .post(`/api/v1/members/${wrong}/nin/removal`)
        .set('Cookie', cookies.updater!)
        .send({ reason: 'Belongs to another member' })
        .expect(201);
      await request(server)
        .put(`/api/v1/members/${owner}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin })
        .expect(200);
    });

    it('answers 404 out of scope, as for no member, and 403 without the permission', async () => {
      const id = await migratedMember('Ninscope');
      const body = { nin: ninFor(11) };

      await request(server)
        .put(`/api/v1/members/${id}/nin`)
        .set('Cookie', cookies.otherbranch!)
        .send(body)
        .expect(404);
      await request(server)
        .put(`/api/v1/members/${randomUUID()}/nin`)
        .set('Cookie', cookies.updater!)
        .send(body)
        .expect(404);
      await request(server)
        .put(`/api/v1/members/${id}/nin`)
        .set('Cookie', cookies.reader!)
        .send(body)
        .expect(403);
      expect(await lastFourOf(id)).toBeNull();
    });

    it('a cancelled membership releases its NIN for somebody who rejoins, and is not changed', async () => {
      const id = await migratedMember('Nincancel');
      const nin = ninFor(12);
      await request(server)
        .put(`/api/v1/members/${id}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin })
        .expect(200);

      await request(server)
        .patch(`/api/v1/members/${id}/status`)
        .set('Cookie', cookies.suspender!)
        .send({ status: 'CANCELLED', reason: 'Left the Union' })
        .expect(200);
      const row = await prisma.memberIdentity.findUniqueOrThrow({
        where: { memberId: id },
      });
      expect(row.releasedAt).not.toBeNull();

      // The cancelled record keeps it.
      const record = await request(server)
        .get(`/api/v1/members/${id}`)
        .set('Cookie', cookies.sensitive!)
        .expect(200);
      expect(record.body.member.ninRecorded).toBe(true);
      expect(record.body.member.sensitive.ninLastFour).toBe(nin.slice(-4));

      // Somebody who rejoins is registered again, with the same NIN.
      const rejoined = await register('Nincancelrejoin', nin);
      expect(await lastFourOf(rejoined.memberId)).toBe(nin.slice(-4));

      await request(server)
        .put(`/api/v1/members/${id}/nin`)
        .set('Cookie', cookies.updater!)
        .send({ nin: ninFor(13) })
        .expect(409);
      await request(server)
        .post(`/api/v1/members/${id}/photograph`)
        .set('Cookie', cookies.updater!)
        .attach('file', PNG_BYTES, 'photo.png')
        .expect(409);
    });
  });

  // --- A photograph on the record ------------------------------------------

  describe('a photograph on the record', () => {
    async function upload(memberId: string): Promise<string> {
      const response = await request(server)
        .post(`/api/v1/members/${memberId}/photograph`)
        .set('Cookie', cookies.updater!)
        .attach('file', PNG_BYTES, 'photo.png')
        .expect(201);
      expect(response.body.photograph.passportPhotoUrl).toContain('signature=');
      return response.body.photograph.passportPhotoId as string;
    }

    it('is added to a migrated member, shown on the record, and audited', async () => {
      const id = await migratedMember('Ninphoto');
      const photoId = await upload(id);

      expect(
        (await prisma.member.findUniqueOrThrow({ where: { id } }))
          .passportPhotoId,
      ).toBe(photoId);
      const asReader = await request(server)
        .get(`/api/v1/members/${id}`)
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(asReader.body.member.passportPhotoUrl).toContain('signature=');

      // No list carries a link: one each would add up to a gallery.
      const list = await request(server)
        .get('/api/v1/members?q=Ninphoto')
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain('signature=');

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { subjectId: id, action: 'member.photograph.set' },
      });
      expect(event.beforeValue).toEqual({ passportPhotoId: null });
      expect(event.afterValue).toEqual({ passportPhotoId: photoId });
    });

    it('replacing one discards it, unless a card printed it', async () => {
      const id = await migratedMember('Ninphotoswap');
      const first = await upload(id);
      const second = await upload(id);
      expect(
        await prisma.mediaAsset.findUnique({ where: { id: first } }),
      ).toBeNull();

      await prisma.card.create({
        data: {
          memberId: id,
          templateVersion: 'v1-provisional',
          printedPhotoId: second,
        },
      });
      const third = await upload(id);
      expect(
        await prisma.mediaAsset.findUnique({ where: { id: second } }),
      ).not.toBeNull();
      expect(
        (await prisma.member.findUniqueOrThrow({ where: { id } }))
          .passportPhotoId,
      ).toBe(third);
    });

    it('refuses what is not an image, no file, and a caller who may not change the member', async () => {
      const id = await migratedMember('Ninphotono');

      await request(server)
        .post(`/api/v1/members/${id}/photograph`)
        .set('Cookie', cookies.updater!)
        .attach('file', Buffer.from('#!/bin/sh\necho no\n'), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(400);
      await request(server)
        .post(`/api/v1/members/${id}/photograph`)
        .set('Cookie', cookies.updater!)
        .expect(400);
      await request(server)
        .post(`/api/v1/members/${id}/photograph`)
        .set('Cookie', cookies.reader!)
        .attach('file', PNG_BYTES, 'photo.png')
        .expect(403);
      await request(server)
        .post(`/api/v1/members/${id}/photograph`)
        .set('Cookie', cookies.otherbranch!)
        .attach('file', PNG_BYTES, 'photo.png')
        .expect(404);

      expect(
        (await prisma.member.findUniqueOrThrow({ where: { id } }))
          .passportPhotoId,
      ).toBeNull();
    });
  });

  // --- Fixture -------------------------------------------------------------

  async function buildFixture(): Promise<Fixture> {
    const make = async (
      name: string,
      level: 'COUNCIL' | 'ZONE' | 'BRANCH' | 'UNIT',
      parent: { id: string; path: string } | null,
    ) => {
      const row = await prisma.organisation.create({
        data: {
          name: `${name} ${TAG}`,
          level,
          parentId: parent?.id ?? null,
          path: 'placeholder',
        },
      });
      return prisma.organisation.update({
        where: { id: row.id },
        data: { path: `${parent?.path ?? '/'}${row.id}/` },
      });
    };

    const council = await make('Council', 'COUNCIL', null);
    const zone = await make('Zone', 'ZONE', council);
    const branchA = await make('Branch A', 'BRANCH', zone);
    const branchB = await make('Branch B', 'BRANCH', zone);
    const unitA = await make('Unit A', 'UNIT', branchA);
    await make('Unit B', 'UNIT', branchB);

    const lga = await prisma.lga.findFirstOrThrow({
      where: { isActive: true },
    });

    await buildUser('registrar', branchA.id, [
      'application.read',
      'member.create',
      'member.read',
    ]);
    await buildUser('updater', branchA.id, ['member.read', 'member.update']);
    await buildUser('sensitive', branchA.id, [
      'application.read',
      'member.read',
      'member_sensitive.read',
    ]);
    await buildUser('reader', branchA.id, ['member.read']);
    await buildUser('otherbranch', branchB.id, [
      'member.read',
      'member.update',
    ]);
    await buildUser('suspender', branchA.id, ['member.read', 'member.suspend']);

    return { unitAId: unitA.id, lgaId: lga.id };
  }

  async function buildUser(
    who: string,
    organisationId: string,
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
    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const members = await prisma.member.findMany({
      where: { organisationId: { in: orgIds } },
      select: { id: true, passportPhotoId: true },
    });
    const memberIds = members.map((member) => member.id);
    const applications = await prisma.membershipApplication.findMany({
      where: { memberId: { in: memberIds } },
      select: { id: true },
    });
    const cards = await prisma.card.findMany({
      where: { memberId: { in: memberIds } },
      select: { printedPhotoId: true },
    });
    const photoIds = [
      ...members.map((member) => member.passportPhotoId),
      ...cards.map((card) => card.printedPhotoId),
    ].filter((id): id is string => id !== null);

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organisationId: { in: orgIds } },
          {
            subjectId: { in: [...memberIds, ...applications.map((a) => a.id)] },
          },
        ],
      },
    });
    await prisma.card.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.membershipApplication.deleteMany({
      where: { memberId: { in: memberIds } },
    });
    // Contact, next of kin, guarantor, and the NIN cascade from the member.
    await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: photoIds } } });
    await prisma.userPermissionGrant.deleteMany({
      where: { organisationId: { in: orgIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

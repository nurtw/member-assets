import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { IncomingMessage } from 'node:http';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * Membership registration, end to end.
 *
 * The assertions that carry weight are about who may see and decide what. An
 * application holds the applicant's address, telephone, next of kin, and
 * guarantor — the largest concentration of personal data in the System — so
 * "can an officer in one branch read another branch's applicants" is the
 * question this suite exists to answer.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-mem';
const PASSWORD = 'e2e-fixture-password-1';

/** A one-pixel PNG. Real bytes, so the content sniffer accepts it. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Hands supertest the raw response body.
 *
 * Without it supertest parses by content type and an image or a PDF arrives as
 * a string, which makes a byte-for-byte comparison impossible.
 */
function binaryParser(
  // supertest's typings say `Response` here, but what a parse function actually
  // receives is the raw `http.IncomingMessage` — the stream has not been read
  // yet, which is the whole point of supplying a parser.
  res: request.Response,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

interface Fixture {
  unitAId: string;
  unitBId: string;
  branchAId: string;
  lgaId: string;
}

function applicationBody(unitId: string, lgaId: string, surname = 'Okeke') {
  return {
    applicant: {
      surname,
      firstName: 'Chidi',
      middleName: '',
      residentialAddress: '14 Zik Avenue, Awka',
      area: 'Ifite',
      townCity: 'Awka',
      residentialLgaId: lgaId,
      stateOfOrigin: 'Anambra',
      phone: '0803 123 4567',
    },
    assignment: { organisationId: unitId },
    nextOfKin: {
      surname: 'Okeke',
      firstName: 'Ngozi',
      address: '14 Zik Avenue, Awka',
      townCity: 'Awka',
      lgaId,
      stateOfOrigin: 'Anambra',
      phone: '08051112222',
      occupation: 'Trader',
    },
    guarantor: {
      surname: 'Eze',
      firstName: 'Emeka',
      address: '2 Market Road, Onitsha',
      townCity: 'Onitsha',
      relationshipToApplicant: 'Fellow operator',
      phone: '+2348069998888',
      occupation: 'Transporter',
      hasCollateral: false,
    },
  };
}

describe('Membership registration (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let fixture: Fixture;
  const cookies: Record<string, string> = {};

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
    fixture = await buildFixture();

    for (const who of ['registrar', 'approver', 'otherbranch', 'sensitive']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- Registration --------------------------------------------------------

  describe('registering an applicant', () => {
    it('creates a pending member with no membership number', async () => {
      const response = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitAId, fixture.lgaId))
        .expect(201);

      const { member, status } = response.body.application;
      expect(status).toBe('DRAFT');
      expect(member.status).toBe('PENDING');
      // A number identifies a member of the Union. This person is not one yet.
      expect(member.membershipNumber).toBeNull();
    });

    it('normalises every telephone number to one canonical form', async () => {
      const body = applicationBody(fixture.unitAId, fixture.lgaId, 'Phone');
      body.applicant.phone = '0803 123 4567';

      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(body)
        .expect(201);

      const detail = await request(server)
        .get(`/api/v1/applications/${created.body.application.id}`)
        .set('Cookie', cookies.registrar!)
        .expect(200);

      // The same person entered by three officers must look like one person.
      expect(detail.body.application.contact.phone).toBe('+2348031234567');
    });

    it('refuses an invalid Nigerian telephone number with field detail', async () => {
      const body = applicationBody(fixture.unitAId, fixture.lgaId, 'BadPhone');
      body.applicant.phone = '12345';

      const response = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(body)
        .expect(400);

      expect(
        response.body.error.details.map((d: { field: string }) => d.field),
      ).toContain('applicant.phone');
    });

    it('refuses registration into a branch rather than a unit', async () => {
      const body = applicationBody(fixture.branchAId, fixture.lgaId, 'WrongLevel');
      await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(body)
        .expect(409);
    });

    it('refuses registration into another branch’s unit', async () => {
      // The core scope assertion. Holding member.create in one branch must not
      // authorise creating a member in another.
      await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitBId, fixture.lgaId, 'Smuggled'))
        .expect(403);

      const smuggled = await prisma.member.findFirst({
        where: { surname: 'Smuggled' },
      });
      expect(smuggled).toBeNull();
    });

    it('requires collateral details when collateral is claimed', async () => {
      const body = applicationBody(fixture.unitAId, fixture.lgaId, 'Collateral');
      body.guarantor.hasCollateral = true;

      const response = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(body)
        .expect(400);

      expect(
        response.body.error.details.map((d: { field: string }) => d.field),
      ).toContain('guarantor.collateralDetails');
    });
  });

  // --- Disclosure ----------------------------------------------------------

  describe('what each projection discloses', () => {
    it('keeps next-of-kin, guarantor, and contact data out of the list', async () => {
      // PRD Requirement 7.1. A list is where an over-generous projection would
      // disclose the most at once.
      const response = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('nextOfKin');
      expect(serialised).not.toContain('guarantor');
      expect(serialised).not.toContain('residentialAddress');
      expect(serialised).not.toContain('+234');
      expect(response.body.applications.length).toBeGreaterThan(0);
    });

    it('returns the full record only from the detail endpoint', async () => {
      const list = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);

      const detail = await request(server)
        .get(`/api/v1/applications/${list.body.applications[0].id}`)
        .set('Cookie', cookies.registrar!)
        .expect(200);

      expect(detail.body.application.nextOfKin).not.toBeNull();
      expect(detail.body.application.guarantor).not.toBeNull();
      expect(detail.body.application.contact.residentialAddress).toBeTruthy();
    });

    it('shows an officer only their own branch’s applications', async () => {
      const mine = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);

      const theirs = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.otherbranch!)
        .expect(200);

      expect(mine.body.applications.length).toBeGreaterThan(0);
      expect(theirs.body.applications).toEqual([]);
    });

    it('answers 404 for an application in another branch', async () => {
      const mine = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);

      await request(server)
        .get(`/api/v1/applications/${mine.body.applications[0].id}`)
        .set('Cookie', cookies.otherbranch!)
        .expect(404);
    });
  });

  // --- Workflow ------------------------------------------------------------

  describe('the review workflow', () => {
    let applicationId: string;

    beforeEach(async () => {
      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitAId, fixture.lgaId, 'Workflow'))
        .expect(201);
      applicationId = created.body.application.id;
    });

    it('refuses a decision on a draft', async () => {
      await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'APPROVED' })
        .expect(409);
    });

    it('does not let the registering officer approve their own work', async () => {
      // member.create does not confer application.decide.
      await request(server)
        .post(`/api/v1/applications/${applicationId}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);

      await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.registrar!)
        .send({ decision: 'APPROVED' })
        .expect(403);
    });

    it('refuses amendment once submitted', async () => {
      await request(server)
        .post(`/api/v1/applications/${applicationId}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);

      await request(server)
        .patch(`/api/v1/applications/${applicationId}`)
        .set('Cookie', cookies.registrar!)
        .send({ applicant: applicationBody(fixture.unitAId, fixture.lgaId).applicant })
        .expect(409);
    });

    it('allocates a membership number on approval, and activates the member', async () => {
      await request(server)
        .post(`/api/v1/applications/${applicationId}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);

      const decided = await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'APPROVED' })
        .expect(201);

      const { member, status } = decided.body.application;
      expect(status).toBe('APPROVED');
      expect(member.status).toBe('ACTIVE');
      expect(member.membershipNumber).toMatch(
        /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/,
      );
      // No excluded look-alikes anywhere in an issued number.
      expect(member.membershipNumber).not.toMatch(/[ILOUZ]/);
    });

    it('requires a reason to refuse, and allocates no number when refused', async () => {
      await request(server)
        .post(`/api/v1/applications/${applicationId}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);

      await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'REJECTED' })
        .expect(400);

      const refused = await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'REJECTED', reason: 'Guarantor could not be reached.' })
        .expect(201);

      expect(refused.body.application.member.status).toBe('PENDING');
      expect(refused.body.application.member.membershipNumber).toBeNull();
    });

    it('does not let a decision be revisited', async () => {
      await request(server)
        .post(`/api/v1/applications/${applicationId}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);
      await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'REJECTED', reason: 'Incomplete guarantor section.' })
        .expect(201);

      // A withdrawal after a refusal would let an applicant erase the record.
      await request(server)
        .post(`/api/v1/applications/${applicationId}/withdrawal`)
        .set('Cookie', cookies.registrar!)
        .send({ reason: 'changed mind' })
        .expect(409);

      await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'APPROVED' })
        .expect(409);
    });

    it('records the decision in the audit trail with a reason', async () => {
      await request(server)
        .post(`/api/v1/applications/${applicationId}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);
      await request(server)
        .post(`/api/v1/applications/${applicationId}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'REJECTED', reason: 'Address could not be confirmed.' })
        .expect(201);

      const event = await prisma.auditEvent.findFirst({
        where: { action: 'application.reject', subjectId: applicationId },
      });
      expect(event?.reason).toBe('Address could not be confirmed.');
      expect(event?.actorUserId).toBeTruthy();
    });

    it('keeps the audit trail free of the applicant’s sensitive detail', async () => {
      // The trail is retained seven years (PRD §22) and read by anyone holding
      // audit.read. It records what changed, not a shadow copy of the register.
      const events = await prisma.auditEvent.findMany({
        where: { subjectType: 'membership_application' },
        take: 50,
      });
      const serialised = JSON.stringify(events);
      expect(serialised).not.toContain('+234');
      expect(serialised).not.toContain('Zik Avenue');
      expect(serialised).not.toContain('collateral');
    });
  });

  // --- Member status -------------------------------------------------------

  describe('member status', () => {
    it('refuses to suspend a pending applicant', async () => {
      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitAId, fixture.lgaId, 'Statuses'))
        .expect(201);

      // There is nothing yet to suspend. Refuse the application instead.
      await request(server)
        .patch(`/api/v1/members/${created.body.application.member.id}/status`)
        .set('Cookie', cookies.approver!)
        .send({ status: 'SUSPENDED', reason: 'attempted early suspension' })
        .expect(409);
    });

    it('suspends, restores, and then cancels terminally', async () => {
      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitAId, fixture.lgaId, 'Lifecycle'))
        .expect(201);
      const id = created.body.application.id;
      const memberId = created.body.application.member.id;

      await request(server)
        .post(`/api/v1/applications/${id}/submission`)
        .set('Cookie', cookies.registrar!)
        .expect(201);
      await request(server)
        .post(`/api/v1/applications/${id}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'APPROVED' })
        .expect(201);

      const setStatus = (status: string) =>
        request(server)
          .patch(`/api/v1/members/${memberId}/status`)
          .set('Cookie', cookies.approver!)
          .send({ status, reason: 'e2e lifecycle check' });

      await setStatus('SUSPENDED').expect(200);
      await setStatus('ACTIVE').expect(200);
      await setStatus('CANCELLED').expect(200);
      // Cancellation is terminal: the register must be able to answer "was this
      // person a member on that date".
      await setStatus('ACTIVE').expect(409);

      const member = await prisma.member.findUnique({ where: { id: memberId } });
      expect(member).not.toBeNull();
      expect(member?.status).toBe('CANCELLED');
      // Nothing is deleted, and the number is not recycled.
      expect(member?.membershipNumber).toBeTruthy();
    });
  });

  // --- Who may decide ------------------------------------------------------

  describe('the second-officer requirement', () => {
    /** Turns the requirement on or off for one test. */
    async function setSeparateOfficer(enabled: boolean): Promise<void> {
      await prisma.systemSetting.update({
        where: { key: 'approval.require_separate_officer' },
        data: { value: enabled ? 'true' : 'false' },
      });
    }

    /** Registers and submits an application as `otherbranch`, who may also decide. */
    async function submittedByOtherBranch(surname: string): Promise<string> {
      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.otherbranch!)
        .send(applicationBody(fixture.unitBId, fixture.lgaId, surname))
        .expect(201);

      await request(server)
        .post(`/api/v1/applications/${created.body.application.id}/submission`)
        .set('Cookie', cookies.otherbranch!)
        .send({})
        .expect(201);

      return created.body.application.id as string;
    }

    it('records the officer who recorded the application', async () => {
      const id = await submittedByOtherBranch('Recorded');

      const application = await prisma.membershipApplication.findUniqueOrThrow({
        where: { id },
      });
      const officer = await prisma.user.findUniqueOrThrow({
        where: { email: `otherbranch.${TAG}@nurtw.test` },
      });

      expect(application.createdByUserId).toBe(officer.id);
    });

    it('lets one officer holding both permissions record and decide, while the setting is off', async () => {
      // The shipped default. `member.create` and `application.decide` are
      // separate permissions, but that separates the permissions and not the
      // people — and the super administrator holds both by definition. With one
      // administrator account, enforcing a second officer would make a
      // registration impossible to complete. See QUESTIONS.md MEM-04.
      const id = await submittedByOtherBranch('SelfApproved');

      const decided = await request(server)
        .post(`/api/v1/applications/${id}/decision`)
        .set('Cookie', cookies.otherbranch!)
        .send({ decision: 'APPROVED' })
        .expect(201);

      expect(decided.body.application.member.membershipNumber).not.toBeNull();
    });

    it('refuses the recording officer’s own decision once the Union turns the setting on', async () => {
      const id = await submittedByOtherBranch('NeedsSecondPair');

      await setSeparateOfficer(true);
      try {
        await request(server)
          .post(`/api/v1/applications/${id}/decision`)
          .set('Cookie', cookies.otherbranch!)
          .send({ decision: 'APPROVED' })
          .expect(409);

        // Nothing was allocated by the refused attempt: the member is still
        // pending and holds no membership number.
        const application = await prisma.membershipApplication.findUniqueOrThrow({
          where: { id },
          include: { member: true },
        });
        expect(application.status).toBe('SUBMITTED');
        expect(application.member?.status).toBe('PENDING');
        expect(application.member?.membershipNumber).toBeNull();
      } finally {
        // Restored even if an assertion fails, so one failure cannot leave the
        // control on and break every test that follows.
        await setSeparateOfficer(false);
      }
    });

    it('still lets a different officer decide while the setting is on', async () => {
      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitAId, fixture.lgaId, 'SecondPair'))
        .expect(201);

      await request(server)
        .post(`/api/v1/applications/${created.body.application.id}/submission`)
        .set('Cookie', cookies.registrar!)
        .send({})
        .expect(201);

      await setSeparateOfficer(true);
      try {
        // Recorded by `registrar`, decided by `approver`. The control refuses
        // one person acting twice, not approval itself.
        const decided = await request(server)
          .post(`/api/v1/applications/${created.body.application.id}/decision`)
          .set('Cookie', cookies.approver!)
          .send({ decision: 'APPROVED' })
          .expect(201);

        expect(decided.body.application.status).toBe('APPROVED');
      } finally {
        await setSeparateOfficer(false);
      }
    });
  });

  // --- The print-ready form (PRD §23.16) -----------------------------------

  describe('the registration form for wet signature', () => {
    it('renders a PDF for an officer holding member_sensitive.read', async () => {
      const list = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);

      const response = await request(server)
        .get(`/api/v1/applications/${list.body.applications[0].id}/form`)
        .set('Cookie', cookies.sensitive!)
        .buffer()
        .parse(binaryParser)
        .expect(200);

      const bytes = response.body as Buffer;
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(response.headers['content-type']).toContain('application/pdf');
      // Registration data. Never held by a shared cache.
      expect(response.headers['cache-control']).toBe('no-store');
      // Named by application number, which conveys nothing about the applicant.
      expect(response.headers['content-disposition']).toContain(
        list.body.applications[0].applicationNumber,
      );
    });

    it('refuses an officer who may read applications but not sensitive data', async () => {
      const list = await request(server)
        .get('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .expect(200);

      // The registrar can see that the application exists. That does not
      // entitle them to print everything on it.
      await request(server)
        .get(`/api/v1/applications/${list.body.applications[0].id}/form`)
        .set('Cookie', cookies.registrar!)
        .expect(403);
    });
  });

  // --- Uploads -------------------------------------------------------------

  describe('photographs and signatures', () => {
    it('accepts a real image and returns a signed link', async () => {
      const response = await request(server)
        .post('/api/v1/media?kind=PASSPORT_PHOTOGRAPH')
        .set('Cookie', cookies.registrar!)
        .attach('file', PNG_BYTES, 'photo.png')
        .expect(201);

      expect(response.body.media.contentType).toBe('image/png');
      expect(response.body.url).toContain('signature=');

      const served = await request(server)
        .get(response.body.url)
        .buffer()
        .parse(binaryParser)
        .expect(200);

      expect(served.headers['content-type']).toContain('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');

      // The bytes themselves, not merely the headers. Asserting only the
      // headers would pass while the body was a JSON rendering of the buffer,
      // which is what a bare `Buffer` return can produce — see the
      // `StreamableFile` comment on the controller.
      expect(Buffer.compare(served.body as Buffer, PNG_BYTES)).toBe(0);
    });

    it('refuses a file that is not an image, whatever it claims to be', async () => {
      // The declared type and the extension are caller-supplied. Only the bytes
      // are evidence.
      await request(server)
        .post('/api/v1/media?kind=PASSPORT_PHOTOGRAPH')
        .set('Cookie', cookies.registrar!)
        .attach('file', Buffer.from('#!/bin/sh\nrm -rf /\n'), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(400);
    });

    it('refuses an SVG, which would be stored cross-site scripting', async () => {
      await request(server)
        .post('/api/v1/media?kind=PASSPORT_PHOTOGRAPH')
        .set('Cookie', cookies.registrar!)
        .attach(
          'file',
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
          { filename: 'photo.svg', contentType: 'image/svg+xml' },
        )
        .expect(400);
    });

    it('will not serve the bytes without a valid signature', async () => {
      const uploaded = await request(server)
        .post('/api/v1/media?kind=PASSPORT_PHOTOGRAPH')
        .set('Cookie', cookies.registrar!)
        .attach('file', PNG_BYTES, 'photo.png')
        .expect(201);

      const id = uploaded.body.media.id;

      // No signature, a forged one, and an expiry moved forward — all 404, so a
      // caller learns nothing about whether the asset exists.
      await request(server).get(`/api/v1/media/${id}/content`).expect(404);
      await request(server)
        .get(`/api/v1/media/${id}/content?expires=99999999999&signature=forged`)
        .expect(404);

      const tampered = uploaded.body.url.replace(/expires=\d+/, 'expires=99999999999');
      await request(server).get(tampered).expect(404);
    });

    it('refuses to attach a signature asset as a passport photograph', async () => {
      const created = await request(server)
        .post('/api/v1/applications')
        .set('Cookie', cookies.registrar!)
        .send(applicationBody(fixture.unitAId, fixture.lgaId, 'Media'))
        .expect(201);

      const signature = await request(server)
        .post('/api/v1/media?kind=MEMBER_SIGNATURE')
        .set('Cookie', cookies.registrar!)
        .attach('file', PNG_BYTES, 'sig.png')
        .expect(201);

      await request(server)
        .patch(`/api/v1/applications/${created.body.application.id}/media`)
        .set('Cookie', cookies.registrar!)
        .send({ passportPhotoId: signature.body.media.id })
        .expect(400);
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
    const unitB = await make('Unit B', 'UNIT', branchB);

    const lga = await prisma.lga.findFirstOrThrow({ where: { isActive: true } });

    await buildUser('registrar', branchA.id, [
      'application.read',
      'member.create',
      'member.read',
    ]);
    await buildUser('approver', branchA.id, [
      'application.read',
      'application.decide',
      'member.read',
      'member.suspend',
    ]);
    await buildUser('sensitive', branchA.id, [
      'application.read',
      'member.read',
      'member_sensitive.read',
    ]);
    await buildUser('otherbranch', branchB.id, [
      'application.read',
      'member.create',
      'application.decide',
      'member.read',
    ]);

    return {
      unitAId: unitA.id,
      unitBId: unitB.id,
      branchAId: branchA.id,
      lgaId: lga.id,
    };
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
      select: { id: true },
    });
    const memberIds = members.map((member) => member.id);

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organisationId: { in: orgIds } },
          { subjectId: { in: memberIds } },
        ],
      },
    });
    await prisma.membershipApplication.deleteMany({
      where: { memberId: { in: memberIds } },
    });
    // Contact, next of kin, and guarantor cascade from the member.
    await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
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

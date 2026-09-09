import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * Membership cards, end to end.
 *
 * A card is the first thing the System produces that leaves the building and
 * cannot be recalled. The assertions that carry weight are therefore about the
 * boundary between "prepared" and "issued": that a number appears only on
 * issuance, that an unissued card is unmistakably a proof, that one member holds
 * one live card, and that the printed values are a snapshot rather than a live
 * view of the member record.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-card';
const PASSWORD = 'e2e-fixture-password-1';

interface Fixture {
  councilId: string;
  branchAId: string;
  unitAId: string;
  unitBId: string;
  memberAId: string;
  memberBId: string;
  pendingMemberId: string;
}

describe('Membership cards (e2e)', () => {
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

    for (const who of ['preparer', 'approver', 'otherbranch', 'templates']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  /**
   * Retires every card between tests.
   *
   * A member may hold only one live card, so a test that leaves one behind
   * would make every later `draft` answer 409 — turning one failed assertion
   * into a page of unrelated failures. Done directly rather than through the
   * API because it is housekeeping, not a behaviour under test; the one-live-card
   * rule has its own assertion.
   */
  afterEach(async () => {
    await clearCards();
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- Preparation ---------------------------------------------------------

  describe('preparing a card', () => {
    it('creates a draft with no card number', async () => {
      const response = await draft(fixture.memberAId).expect(201);

      expect(response.body.card.status).toBe('DRAFT');
      // The whole point of decision 3: a cancelled draft was never printed, and
      // a number against it would name an artifact that does not exist.
      expect(response.body.card.cardNumber).toBeNull();
      expect(response.body.card.issueDate).toBeNull();

    });

    it('defaults the printed name and unit from the member record', async () => {
      const created = await draft(fixture.memberAId).expect(201);

      const detail = await request(server)
        .get(`/api/v1/cards/${created.body.card.id}`)
        .set('Cookie', cookies.preparer!)
        .expect(200);

      expect(detail.body.card.printed.name).toBe('CHIDI OKEKE');
      expect(detail.body.card.printed.unit).toContain('Unit A');
      // Supplied by the officer, because it lives in the sensitive table the
      // card module must not read.
      expect(detail.body.card.printed.address).toBe('14 Zik Avenue, Awka');

    });

    it('refuses a card for a member who is not in good standing', async () => {
      // Union credentials for somebody the Union has not admitted.
      await draft(fixture.pendingMemberId).expect(409);

      // The message is generic by design (PRD Requirement 14.3), so the
      // assertion that matters is that nothing was created.
      const cards = await prisma.card.findMany({
        where: { memberId: fixture.pendingMemberId },
      });
      expect(cards).toHaveLength(0);
    });

    it('refuses a second card while one is already in preparation', async () => {
      await draft(fixture.memberAId).expect(201);
      await draft(fixture.memberAId).expect(409);
    });

    it('refuses an unknown template version rather than falling back', async () => {
      await request(server)
        .post('/api/v1/cards')
        .set('Cookie', cookies.preparer!)
        .send({
          memberId: fixture.memberAId,
          printedAddress: '14 Zik Avenue, Awka',
          templateVersion: 'v99-does-not-exist',
        })
        .expect(404);
    });

    it('refuses to prepare a card for another branch’s member', async () => {
      await request(server)
        .post('/api/v1/cards')
        .set('Cookie', cookies.preparer!)
        .send({
          memberId: fixture.memberBId,
          printedAddress: '2 Market Road, Onitsha',
        })
        .expect(403);
    });
  });

  // --- Separation of authority ---------------------------------------------

  describe('who may do what', () => {
    it('does not let the preparing officer approve their own card', async () => {
      const created = await draft(fixture.memberAId).expect(201);
      await submit(created.body.card.id).expect(201);

      // `card.issue` prepares; `card.approve` approves. The preparer holds only
      // the first.
      await request(server)
        .post(`/api/v1/cards/${created.body.card.id}/decision`)
        .set('Cookie', cookies.preparer!)
        .send({ decision: 'ISSUED' })
        .expect(403);

    });

    it('answers 404, not 403, for a card outside the caller’s scope', async () => {
      const created = await draft(fixture.memberAId).expect(201);

      // Identical to a card that does not exist, so identifiers cannot be
      // enumerated.
      await request(server)
        .get(`/api/v1/cards/${created.body.card.id}`)
        .set('Cookie', cookies.otherbranch!)
        .expect(404);

    });

    it('shows an officer only their own branch’s cards', async () => {
      const created = await draft(fixture.memberAId).expect(201);

      const theirs = await request(server)
        .get('/api/v1/cards')
        .set('Cookie', cookies.otherbranch!)
        .expect(200);

      expect(
        theirs.body.cards.some(
          (card: { id: string }) => card.id === created.body.card.id,
        ),
      ).toBe(false);

    });
  });

  // --- Issuance ------------------------------------------------------------

  describe('issuing a card', () => {
    it('allocates the number and the issue date at approval, and not before', async () => {
      const created = await draft(fixture.memberAId).expect(201);
      await submit(created.body.card.id).expect(201);

      const before = await prisma.card.findUniqueOrThrow({
        where: { id: created.body.card.id },
      });
      expect(before.cardNumber).toBeNull();

      const issued = await request(server)
        .post(`/api/v1/cards/${created.body.card.id}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'ISSUED' })
        .expect(201);

      expect(issued.body.card.status).toBe('ISSUED');
      // Twelve payload symbols and a check symbol, grouped in fours — so the
      // last group is a single character. Same shape as a membership number.
      expect(issued.body.card.cardNumber).toMatch(
        /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/,
      );
      expect(issued.body.card.issueDate).not.toBeNull();
      // CARD-04 is open, so the template carries no validity and no card expires.
      expect(issued.body.card.expiryDate).toBeNull();

    });

    it('returns a card for amendment without allocating a number', async () => {
      const created = await draft(fixture.memberAId).expect(201);
      await submit(created.body.card.id).expect(201);

      const returned = await request(server)
        .post(`/api/v1/cards/${created.body.card.id}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'DRAFT', reason: 'The address is wrong.' })
        .expect(201);

      expect(returned.body.card.status).toBe('DRAFT');
      expect(returned.body.card.cardNumber).toBeNull();

    });

    it('refuses to issue to a member suspended between preparation and approval', async () => {
      const created = await draft(fixture.memberAId).expect(201);
      await submit(created.body.card.id).expect(201);

      await prisma.member.update({
        where: { id: fixture.memberAId },
        data: { status: 'SUSPENDED' },
      });

      await request(server)
        .post(`/api/v1/cards/${created.body.card.id}/decision`)
        .set('Cookie', cookies.approver!)
        .send({ decision: 'ISSUED' })
        .expect(409);

      await prisma.member.update({
        where: { id: fixture.memberAId },
        data: { status: 'ACTIVE' },
      });
    });

    it('refuses a second live card at the database level', async () => {
      await issueCard(fixture.memberAId);

      // The service check is bypassed deliberately: this asserts the partial
      // unique index, not the guard clause above it. Two live cards mean two
      // credentials answering for one person.
      await expect(
        prisma.card.create({
          data: {
            memberId: fixture.memberAId,
            status: 'ISSUED',
            templateVersion: 'v1-provisional',
            cardNumber: 'TEST-DUPE-0001',
          },
        }),
      ).rejects.toThrow();

    });
  });

  // --- The snapshot --------------------------------------------------------

  describe('what the card records', () => {
    it('does not change when the member record changes afterwards', async () => {
      const cardId = await issueCard(fixture.memberAId);

      // The member is renamed and their unit is renamed. Deliberately *not* a
      // move to another branch — that would take the card out of the approver's
      // scope, which is correct behaviour but a different assertion.
      await prisma.member.update({
        where: { id: fixture.memberAId },
        data: { surname: 'Renamed' },
      });
      await prisma.organisation.update({
        where: { id: fixture.unitAId },
        data: { name: `Renamed Unit ${TAG}` },
      });

      const detail = await request(server)
        .get(`/api/v1/cards/${cardId}`)
        .set('Cookie', cookies.approver!)
        .expect(200);

      // The card in the member's pocket still says what it said when printed.
      expect(detail.body.card.printed.name).toBe('CHIDI OKEKE');
      expect(detail.body.card.printed.unit).toContain('Unit A');

      // ...while the member record itself has moved on.
      expect(detail.body.card.member.surname).toBe('Renamed');

      await prisma.member.update({
        where: { id: fixture.memberAId },
        data: { surname: 'Okeke' },
      });
      await prisma.organisation.update({
        where: { id: fixture.unitAId },
        data: { name: `Unit A ${TAG}` },
      });
    });

    it('refuses to amend a card once it is issued', async () => {
      const cardId = await issueCard(fixture.memberAId);

      await request(server)
        .patch(`/api/v1/cards/${cardId}`)
        .set('Cookie', cookies.preparer!)
        .send({ printedAddress: 'Somewhere else entirely' })
        .expect(409);

      const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
      expect(card.printedAddress).toBe('14 Zik Avenue, Awka');
    });

    it('carries no contact, next-of-kin, or guarantor data in any projection', async () => {
      const cardId = await issueCard(fixture.memberAId);

      const list = await request(server)
        .get('/api/v1/cards')
        .set('Cookie', cookies.approver!)
        .expect(200);
      const detail = await request(server)
        .get(`/api/v1/cards/${cardId}`)
        .set('Cookie', cookies.approver!)
        .expect(200);

      // Decision 10.1 is structural here: the card module joins none of those
      // tables, so there is nothing to filter out.
      for (const body of [list.body, detail.body]) {
        const serialised = JSON.stringify(body);
        expect(serialised).not.toContain('nextOfKin');
        expect(serialised).not.toContain('guarantor');
        expect(serialised).not.toContain('residentialAddress');
        expect(serialised).not.toContain('+234');
      }

    });
  });

  // --- Rendering -----------------------------------------------------------

  describe('rendering', () => {
    it('marks an unissued card as a proof and omits the number', async () => {
      const created = await draft(fixture.memberAId).expect(201);

      const response = await request(server)
        .get(`/api/v1/cards/${created.body.card.id}/document`)
        .set('Cookie', cookies.preparer!)
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      // A proof's filename must not carry the member's name into whatever
      // folder it lands in.
      expect(response.headers['content-disposition']).toContain('proof');

      const bytes = response.body as Buffer;
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(1000);

    });

    it('names the issued document by card number', async () => {
      const cardId = await issueCard(fixture.memberAId);
      const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });

      const response = await request(server)
        .get(`/api/v1/cards/${cardId}/document`)
        .set('Cookie', cookies.approver!)
        .expect(200);

      expect(response.headers['content-disposition']).toContain(
        card.cardNumber!,
      );
      // A member's photograph and name. Never held by a shared cache.
      expect(response.headers['cache-control']).toBe('no-store');

    });

    it('lists the template as provisional, so nobody prints it for a member', async () => {
      const response = await request(server)
        .get('/api/v1/cards/templates')
        .set('Cookie', cookies.templates!)
        .expect(200);

      const template = response.body.templates.find(
        (entry: { version: string }) => entry.version === 'v1-provisional',
      );
      expect(template.provisional).toBe(true);
      // CARD-04 unanswered: no validity is guessed.
      expect(template.validityMonths).toBeNull();
    });
  });

  // --- Replacement ---------------------------------------------------------

  describe('replacement', () => {
    it('supersedes the original and preserves the relationship in both directions', async () => {
      const originalId = await issueCard(fixture.memberAId);

      const replacement = await request(server)
        .post(`/api/v1/cards/${originalId}/replacement`)
        .set('Cookie', cookies.approver!)
        .send({ reason: 'Reported lost by the holder.' })
        .expect(201);

      const original = await prisma.card.findUniqueOrThrow({
        where: { id: originalId },
      });
      expect(original.status).toBe('REPLACED');
      // History is preserved: the number stays, pointing at a card that is dead.
      expect(original.cardNumber).not.toBeNull();

      // The replacement is a DRAFT, not an issued card: issuance is a separate
      // authority, and `card.replace` must not mint credentials on its own.
      expect(replacement.body.card.status).toBe('DRAFT');
      expect(replacement.body.card.cardNumber).toBeNull();

      const detail = await request(server)
        .get(`/api/v1/cards/${replacement.body.card.id}`)
        .set('Cookie', cookies.approver!)
        .expect(200);
      expect(detail.body.card.replacementOfCardId).toBe(originalId);

      const originalDetail = await request(server)
        .get(`/api/v1/cards/${originalId}`)
        .set('Cookie', cookies.approver!)
        .expect(200);
      expect(originalDetail.body.card.replacedByCardId).toBe(
        replacement.body.card.id,
      );

    });

    it('carries the printed values over to the replacement', async () => {
      const originalId = await issueCard(fixture.memberAId);

      const replacement = await request(server)
        .post(`/api/v1/cards/${originalId}/replacement`)
        .set('Cookie', cookies.approver!)
        .send({ reason: 'Damaged in the wash.' })
        .expect(201);

      const detail = await request(server)
        .get(`/api/v1/cards/${replacement.body.card.id}`)
        .set('Cookie', cookies.approver!)
        .expect(200);

      expect(detail.body.card.printed.name).toBe('CHIDI OKEKE');
      expect(detail.body.card.printed.address).toBe('14 Zik Avenue, Awka');

    });

    it('refuses to replace a card that was never printed', async () => {
      const created = await draft(fixture.memberAId).expect(201);

      await request(server)
        .post(`/api/v1/cards/${created.body.card.id}/replacement`)
        .set('Cookie', cookies.approver!)
        .send({ reason: 'Mistaken request.' })
        .expect(409);

    });
  });

  // --- Lifecycle -----------------------------------------------------------

  describe('the lifecycle', () => {
    it('hands an issued card over, then suspends and restores it', async () => {
      const cardId = await issueCard(fixture.memberAId);

      // Completing an issuance is not reachable through the general status
      // route, which would let whoever may suspend a card also hand one over.
      // The approver holds `card.suspend`, so the guard admits the request and
      // the service is the thing that refuses.
      await request(server)
        .patch(`/api/v1/cards/${cardId}/status`)
        .set('Cookie', cookies.approver!)
        .send({ status: 'ACTIVE', reason: 'Collected by the holder.' })
        .expect(409);

      // Nor through the activation route without `card.issue`.
      await request(server)
        .post(`/api/v1/cards/${cardId}/activation`)
        .set('Cookie', cookies.approver!)
        .send({})
        .expect(403);

      await request(server)
        .post(`/api/v1/cards/${cardId}/activation`)
        .set('Cookie', cookies.preparer!)
        .send({})
        .expect(201);

      await request(server)
        .patch(`/api/v1/cards/${cardId}/status`)
        .set('Cookie', cookies.approver!)
        .send({ status: 'SUSPENDED', reason: 'Under investigation.' })
        .expect(200);

      // Restoring a *suspended* card is ordinary `card.suspend` work.
      const restored = await request(server)
        .patch(`/api/v1/cards/${cardId}/status`)
        .set('Cookie', cookies.approver!)
        .send({ status: 'ACTIVE', reason: 'Investigation closed.' })
        .expect(200);
      expect(restored.body.card.status).toBe('ACTIVE');
    });

    it('never returns a lost card to active', async () => {
      const cardId = await issueCard(fixture.memberAId);

      await request(server)
        .patch(`/api/v1/cards/${cardId}/status`)
        .set('Cookie', cookies.approver!)
        .send({ status: 'LOST', reason: 'Reported lost by the holder.' })
        .expect(200);

      // It may be in somebody else's pocket. A card found again is replaced,
      // not resurrected.
      await request(server)
        .patch(`/api/v1/cards/${cardId}/status`)
        .set('Cookie', cookies.approver!)
        .send({ status: 'ACTIVE', reason: 'Found again.' })
        .expect(409);

    });

    it('records the preparing officer and the approving officer separately', async () => {
      // PRD Requirement 8.1 wants both, and they are different people —
      // `card.issue` prepares and `card.approve` approves. Recording the
      // approver as both would lose who prepared a card that turned out wrong.
      const cardId = await issueCard(fixture.memberAId);

      const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
      expect(card.issuedByUserId).not.toBeNull();
      expect(card.approvedByUserId).not.toBeNull();
      expect(card.issuedByUserId).not.toBe(card.approvedByUserId);
    });

    it('records every mutation in the audit trail', async () => {
      const cardId = await issueCard(fixture.memberAId);

      const events = await prisma.auditEvent.findMany({
        where: { subjectType: 'card', subjectId: cardId },
        orderBy: { createdAt: 'asc' },
      });

      expect(events.map((event) => event.action)).toEqual([
        'card.draft',
        'card.submit_for_approval',
        'card.issue',
      ]);

      const issue = events.at(-1)!;
      const after = issue.afterValue as Record<string, unknown>;
      expect(after.cardNumber).toBeTruthy();
      // CARD-07 is open, so cards issue with blank officer signature lines.
      // The trail records which cards those were.
      expect(after.officerSignaturesPresent).toBe(false);

    });
  });

  // --- Helpers -------------------------------------------------------------

  function draft(memberId: string) {
    return request(server)
      .post('/api/v1/cards')
      .set('Cookie', cookies.preparer!)
      .send({ memberId, printedAddress: '14 Zik Avenue, Awka' });
  }

  function submit(cardId: string) {
    return request(server)
      .post(`/api/v1/cards/${cardId}/submission`)
      .set('Cookie', cookies.preparer!)
      .send({});
  }

  /** Prepares, submits, and issues one card, returning its identifier. */
  async function issueCard(memberId: string): Promise<string> {
    const created = await draft(memberId).expect(201);
    await submit(created.body.card.id).expect(201);
    await request(server)
      .post(`/api/v1/cards/${created.body.card.id}/decision`)
      .set('Cookie', cookies.approver!)
      .send({ decision: 'ISSUED' })
      .expect(201);
    return created.body.card.id as string;
  }

  /** Removes every card belonging to a fixture member. */
  async function clearCards(): Promise<void> {
    const memberIds = [
      fixture.memberAId,
      fixture.memberBId,
      fixture.pendingMemberId,
    ];
    const cards = await prisma.card.findMany({
      where: { memberId: { in: memberIds } },
      select: { id: true },
    });
    const cardIds = cards.map((card) => card.id);
    if (cardIds.length === 0) {
      return;
    }
    // Break the self-referencing replacement links first, rather than relying
    // on a delete order that happens to work.
    await prisma.card.updateMany({
      where: { id: { in: cardIds } },
      data: { replacementOfCardId: null },
    });
    await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
  }

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

    const member = async (
      surname: string,
      organisationId: string,
      status: 'ACTIVE' | 'PENDING',
      membershipNumber: string | null,
    ) =>
      prisma.member.create({
        data: {
          surname,
          firstName: 'Chidi',
          status,
          membershipNumber,
          organisationId,
        },
      });

    const memberA = await member('Okeke', unitA.id, 'ACTIVE', `${TAG}-A`);
    const memberB = await member('Eze', unitB.id, 'ACTIVE', `${TAG}-B`);
    const pending = await member('Waiting', unitA.id, 'PENDING', null);

    await buildUser('preparer', branchA.id, [
      'card.read',
      'card.issue',
      'member.read',
    ]);
    await buildUser('approver', branchA.id, [
      'card.read',
      'card.approve',
      'card.replace',
      'card.suspend',
      'member.read',
    ]);
    await buildUser('otherbranch', branchB.id, [
      'card.read',
      'card.issue',
      'card.approve',
      'member.read',
    ]);
    await buildUser('templates', council.id, ['card.read']);

    return {
      councilId: council.id,
      branchAId: branchA.id,
      unitAId: unitA.id,
      unitBId: unitB.id,
      memberAId: memberA.id,
      memberBId: memberB.id,
      pendingMemberId: pending.id,
    };
  }

  async function buildUser(
    who: string,
    organisationId: string,
    permissions: readonly string[],
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        // Lowercased: `AuthService.login` lowercases, so a mixed-case fixture
        // email fails to authenticate for reasons that look like a bad password.
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

    const cards = await prisma.card.findMany({
      where: { memberId: { in: memberIds } },
      select: { id: true },
    });
    const cardIds = cards.map((card) => card.id);

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organisationId: { in: orgIds } },
          { subjectId: { in: [...memberIds, ...cardIds] } },
        ],
      },
    });

    // Replacement chains are self-referencing, so break the links before
    // deleting rather than relying on an ordering that happens to work.
    await prisma.card.updateMany({
      where: { id: { in: cardIds } },
      data: { replacementOfCardId: null },
    });
    await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
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

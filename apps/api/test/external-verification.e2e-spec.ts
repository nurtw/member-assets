import { randomInt, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateIdentifier } from '@nurtw/domain';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import {
  generateApiToken,
  hashApiToken,
} from './../src/api-client/api-token.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { StickerService } from './../src/sticker/sticker.service.js';

/**
 * The external verification API, end to end (PRD §12, proposal §12.3 —
 * `plans/12-external-verification-api.md`).
 *
 * The assertions that carry weight:
 *
 * - each route answers only with a token holding its scope (Decision 13.1);
 * - a client holding only `vehicle:verify:plate` with the Minimal profile is
 *   told nothing beyond the match (acceptance criterion 6);
 * - every non-match is the same answer, whatever the reason (Decision 5.4,
 *   Requirements 11.2, 14.3), while the audit trail keeps the reason;
 * - no answer carries a restricted value, a declaration, or dues (criteria 12
 *   and 15), and a sticker check never carries the plate (proposal §10.2);
 * - each request is logged once with its outcome and scheme, and nothing but
 *   the audit event and that log row is written.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-extverify';
const SIGNING_SECRET = 'e2e-fixture-extverify-signing-secret';
const WIDE_PROFILE = 'E2E_EXTVERIFY_WIDE';
/**
 * Limits this suite's organisations are held to: high enough that no test
 * here meets one, nor trips abuse detection with its deliberate non-matches.
 */
const LIMITS_CODE = 'E2E_EXTVERIFY_LIMITS';
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

/** Values that must never appear in any external answer. */
const RESTRICTED = {
  ownerPhone: '+2348000000911',
  ownerAddress: 'E2E EXT RESTRICTED OWNER ADDRESS',
  chassis: 'E2EEXTRESTRICTEDVIN',
  notes: 'E2E EXT RESTRICTED NOTE',
  memberPhone: '+2348000000912',
  memberAddress: 'E2E EXT RESTRICTED MEMBER ADDRESS',
  memberSurname: 'Extverifiedsurname',
};

/** What every answer carries, match or not. */
const ENVELOPE = [
  'data_as_of',
  'limitation',
  'request_id',
  'result',
  'statement',
  'verified_at',
];

/** An answer with the parts that differ per request removed. */
function shape(body: Record<string, unknown>) {
  const {
    request_id: _id,
    verified_at: _at,
    data_as_of: _asOf,
    ...rest
  } = body;
  return rest;
}

describe('External verification API (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const savedSecret = process.env.STICKER_SIGNING_SECRET;
  const savedKeyId = process.env.STICKER_SIGNING_KEY_ID;

  const ids: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const numbers: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const clients: Record<string, { id: string; tokenId: string }> = {};
  /** Every external answer, for the checks of criteria 12 and 15. */
  const answers: string[] = [];
  let snapshotBefore: string;
  const identifier = () => generateIdentifier(() => randomInt(256));

  beforeAll(async () => {
    process.env.STICKER_SIGNING_SECRET = SIGNING_SECRET;
    process.env.STICKER_SIGNING_KEY_ID = 'k1';
    await cleanUp();

    const council = await prisma.organisation.create({
      data: { name: `Council ${TAG}`, level: 'COUNCIL', path: 'placeholder' },
    });
    await prisma.organisation.update({
      where: { id: council.id },
      data: { path: `/${council.id}/` },
    });
    const branch = await prisma.organisation.create({
      data: {
        name: `Branch ${TAG}`,
        level: 'BRANCH',
        parentId: council.id,
        path: `/${council.id}/placeholder-branch`,
      },
    });
    await prisma.organisation.update({
      where: { id: branch.id },
      data: { path: `/${council.id}/${branch.id}/` },
    });

    const routeType = await prisma.routeType.findUniqueOrThrow({
      where: { code: 'INTERCITY' },
    });
    const category = await prisma.vehicleCategory.findFirstOrThrow({
      orderBy: { code: 'asc' },
    });

    // --- Members and cards ----------------------------------------------------

    const member = await prisma.member.create({
      data: {
        surname: RESTRICTED.memberSurname,
        firstName: TAG,
        organisationId: branch.id,
        status: 'ACTIVE',
        membershipNumber: (numbers.member = identifier()),
        contact: {
          create: {
            phone: RESTRICTED.memberPhone,
            residentialAddress: RESTRICTED.memberAddress,
          },
        },
      },
    });
    async function card(
      key: string,
      memberId: string,
      status: 'ACTIVE' | 'REPLACED',
      expiryDate: Date | null,
    ) {
      await prisma.card.create({
        data: {
          memberId,
          status,
          cardNumber: (numbers[key] = identifier()),
          issueDate: new Date('2026-09-01T09:00:00Z'),
          expiryDate,
          templateVersion: 'v1-provisional',
        },
      });
    }
    await card(
      'activeCard',
      member.id,
      'ACTIVE',
      new Date('2099-01-01T00:00:00Z'),
    );
    await card('replacedCard', member.id, 'REPLACED', null);
    const lapsed = await prisma.member.create({
      data: {
        surname: 'Lapsed',
        firstName: TAG,
        organisationId: branch.id,
        status: 'ACTIVE',
        membershipNumber: identifier(),
      },
    });
    await card(
      'expiredCard',
      lapsed.id,
      'ACTIVE',
      new Date('2026-01-01T00:00:00Z'),
    );
    await prisma.member.create({
      data: {
        surname: 'Suspended',
        firstName: TAG,
        organisationId: branch.id,
        status: 'SUSPENDED',
        membershipNumber: (numbers.suspendedMember = identifier()),
      },
    });

    // --- Vehicles ---------------------------------------------------------------

    async function vehicle(key: string, status: 'ACTIVE' | 'ON_RECORD') {
      const row = await prisma.vehicle.create({
        data: {
          plateNumberDisplay: `E2EEXT-${key}`,
          plateNumberNormalized: `E2EEXT${key}`,
          branchId: branch.id,
          status,
          declaredAt: status === 'ACTIVE' ? new Date() : null,
          isLegacyImport: status === 'ON_RECORD',
          routeTypeId: routeType.id,
          vehicleCategoryId: category.id,
          make: 'Toyota',
          model: 'Hiace',
          color: 'White',
          chassisVinRestricted: RESTRICTED.chassis,
          notes: RESTRICTED.notes,
          declaredByMemberId: member.id,
          owner: {
            create: {
              ownerName: 'Owner fixture',
              ownerPhone: RESTRICTED.ownerPhone,
              ownerAddress: RESTRICTED.ownerAddress,
            },
          },
        },
      });
      ids[key] = row.id;
      return row;
    }
    const matched = await vehicle('MATCH', 'ACTIVE');
    await vehicle('REC', 'ON_RECORD');
    await vehicle('BARE', 'ACTIVE');
    const lost = await vehicle('LOST', 'ACTIVE');
    const other = await vehicle('OTHER', 'ACTIVE');
    const legacyVehicle = await vehicle('LEGACYV', 'ACTIVE');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    // --- Stickers ---------------------------------------------------------------

    async function signedSticker(
      key: string,
      status: 'ACTIVE' | 'ISSUED' | 'LOST',
      attachedTo: { id: string; plateNumberNormalized: string } | null,
    ) {
      const row = await prisma.sticker.create({
        data: {
          stickerQrId: `${TAG}-${key}`,
          status,
          signingKeyId: 'k1',
          templateVersion: 'v1',
          vehicleId: attachedTo?.id ?? null,
          plateNumberAtIssue: attachedTo?.plateNumberNormalized ?? null,
          attachedAt: attachedTo ? new Date('2026-09-01T09:00:00Z') : null,
        },
      });
      codes[key] = app.get(StickerService).mintQrPayload(row.stickerQrId);
    }
    await signedSticker('MATCH', 'ACTIVE', matched);
    await signedSticker('ISSUED', 'ISSUED', null);
    await signedSticker('LOST', 'LOST', lost);
    await signedSticker('OTHER', 'ACTIVE', other);
    const last = codes.MATCH!.at(-1);
    codes.FORGED = `${codes.MATCH!.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;

    // Legacy register rows, as the legacy import writes them: one never
    // attached, one reattached to its own plate.
    await prisma.sticker.create({
      data: {
        stickerQrId: `${TAG}-REG`,
        legacyBarcode: (codes.REG = `${TAG}-1600000000001`),
        registeredPlateNormalized: 'E2EEXTREC',
        templateVersion: 'legacy-barcode',
        status: 'ISSUED',
      },
    });
    await prisma.sticker.create({
      data: {
        stickerQrId: `${TAG}-ATT`,
        legacyBarcode: (codes.ATT = `${TAG}-1600000000002`),
        registeredPlateNormalized: legacyVehicle.plateNumberNormalized,
        templateVersion: 'legacy-barcode',
        status: 'ACTIVE',
        vehicleId: legacyVehicle.id,
        attachedAt: new Date('2026-09-02T09:00:00Z'),
      },
    });

    // --- Organisations and their tokens -----------------------------------------

    const profile = async (code: string) =>
      (await prisma.disclosureProfile.findUniqueOrThrow({ where: { code } }))
        .id;
    await prisma.rateLimitProfile.create({
      data: { code: LIMITS_CODE, label: 'E2E generous', ...GENEROUS_LIMITS },
    });
    const wide = await prisma.disclosureProfile.create({
      data: {
        code: WIDE_PROFILE,
        label: 'Every external field',
        fields: {
          create: [
            'plate_number',
            'vehicle_category',
            'sticker_status',
            'organizational_unit',
            'attached_at',
            'plate_matches_sticker',
            'membership_status',
            'card_status',
            'designation',
          ].map((fieldPath) => ({ fieldPath })),
        },
      },
    });

    async function organisation(
      key: string,
      profileId: string,
      scopes: readonly string[],
    ) {
      const client = await prisma.apiClient.create({
        data: {
          organisationName: `${key} ${TAG}`,
          status: 'ACTIVE',
          businessPurpose: 'End-to-end fixture for the external API.',
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
      const token = await prisma.apiToken.create({
        data: {
          clientId: client.id,
          tokenHash: generated.hash,
          tokenPrefix: generated.prefix,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      tokens[key] = generated.token;
      clients[key] = { id: client.id, tokenId: token.id };
    }
    await organisation(
      'operational',
      await profile('OPERATIONAL_VERIFICATION'),
      ['vehicle:verify:plate', 'sticker:verify:qr', 'vehicle:verify:combined'],
    );
    await organisation('minimal', await profile('MINIMAL_VERIFICATION'), [
      'vehicle:verify:plate',
    ]);
    await organisation('wide', wide.id, [
      'vehicle:verify:plate',
      'sticker:verify:qr',
      'vehicle:verify:combined',
      'member:verify:membership',
    ]);
    await organisation('member', await profile('MEMBERSHIP_VERIFICATION'), [
      'member:verify:membership',
    ]);

    snapshotBefore = await snapshot();
  });

  afterAll(async () => {
    process.env.STICKER_SIGNING_SECRET = savedSecret;
    process.env.STICKER_SIGNING_KEY_ID = savedKeyId;
    if (savedSecret === undefined) delete process.env.STICKER_SIGNING_SECRET;
    if (savedKeyId === undefined) delete process.env.STICKER_SIGNING_KEY_ID;
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  /** One external check, by token. */
  async function check(
    path: string,
    body: object,
    who: string,
    requestId?: string,
  ) {
    // Proposal §14.3 (item 13) — an external caller always sends its own id.
    const pending = request(server)
      .post(`/api/v1/verification/${path}`)
      .set('Authorization', `Bearer ${tokens[who]}`)
      .set('X-Request-ID', requestId ?? `${TAG}-${randomUUID()}`);
    const response = await pending.send(body);
    answers.push(response.text);
    return response;
  }

  const plate = (value: string, who = 'wide', requestId?: string) =>
    check('vehicle/plate', { plate_number: value }, who, requestId);
  const sticker = (code: string, who = 'wide', requestId?: string) =>
    check('sticker/qr', { sticker_qr_id: code }, who, requestId);
  const combined = (value: string, code: string, who = 'wide') =>
    check(
      'vehicle/combined',
      { plate_number: value, sticker_qr_id: code },
      who,
    );
  const membership = (number: string, who = 'member', requestId?: string) =>
    check('membership', { number }, who, requestId);

  async function logFor(requestId: string) {
    return prisma.apiRequestLog.findMany({ where: { requestId } });
  }

  async function auditFor(requestId: string) {
    return prisma.auditEvent.findMany({
      where: { requestId, action: { startsWith: 'verification.external.' } },
    });
  }

  // --- Access -------------------------------------------------------------------

  describe('access', () => {
    it('answers only to a token', async () => {
      for (const [path, body] of [
        ['vehicle/plate', { plate_number: 'E2EEXT-MATCH' }],
        ['sticker/qr', { sticker_qr_id: 'x' }],
        [
          'vehicle/combined',
          { plate_number: 'E2EEXT-MATCH', sticker_qr_id: 'x' },
        ],
        ['membership', { number: 'x' }],
      ] as const) {
        await request(server)
          .post(`/api/v1/verification/${path}`)
          .send(body)
          .expect(401);
      }
    });

    it('answers each route only with its own scope (Decision 13.1)', async () => {
      expect((await sticker(codes.MATCH!, 'minimal')).status).toBe(403);
      expect(
        (await combined('E2EEXT-MATCH', codes.MATCH!, 'minimal')).status,
      ).toBe(403);
      expect((await membership(numbers.activeCard!, 'minimal')).status).toBe(
        403,
      );
      expect((await plate('E2EEXT-MATCH', 'member')).status).toBe(403);
      expect(
        (await membership(numbers.activeCard!, 'operational')).status,
      ).toBe(403);
    });
  });

  // --- Matches ------------------------------------------------------------------

  describe('a match', () => {
    it('carries the operational profile’s fields, however the plate is typed', async () => {
      const response = await plate(' e2eext match ', 'operational');
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(
        [
          ...ENVELOPE,
          'record_type',
          'plate_number',
          'vehicle_category',
          'sticker_status',
          'organizational_unit',
        ].sort(),
      );
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        record_type: 'NURTW_VEHICLE',
        plate_number: 'E2EEXT-MATCH',
        sticker_status: 'ACTIVE',
        organizational_unit: `Branch ${TAG}`,
        statement:
          'A matching NURTW vehicle record was found under the requested verification criteria.',
      });
      expect(response.body.limitation).toMatch(/not evidence of ownership/);
      expect(response.body.verified_at).toBe(response.body.data_as_of);
    });

    it('tells a Minimal-profile client nothing beyond the match (criterion 6)', async () => {
      const response = await plate('E2EEXT-MATCH', 'minimal');
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(
        [...ENVELOPE, 'record_type'].sort(),
      );
      expect(response.body.result).toBe('MATCH_FOUND');
    });

    it('adds the issue date where the profile permits it', async () => {
      const response = await plate('E2EEXT-MATCH');
      expect(response.body.attached_at).toBe('2026-09-01T09:00:00.000Z');
      expect(response.body).not.toHaveProperty('plate_matches_sticker');
    });

    it('matches a plate whose sticker was since lost: onboarded is what the rule needs', async () => {
      const response = await plate('E2EEXT-LOST');
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        sticker_status: 'LOST',
      });
    });

    it('never tells a sticker check the plate, even where the profile permits it', async () => {
      const response = await sticker(codes.MATCH!);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        record_type: 'NURTW_STICKER',
        sticker_status: 'ACTIVE',
        attached_at: '2026-09-01T09:00:00.000Z',
      });
      expect(response.body).not.toHaveProperty('plate_number');
      expect(response.text).not.toMatch(/E2EEXT/);
    });

    it('matches a reattached legacy sticker', async () => {
      const response = await sticker(codes.ATT!);
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        sticker_status: 'ACTIVE',
      });
    });

    it('matches a plate and its own sticker together', async () => {
      const response = await combined('E2EEXT-MATCH', codes.MATCH!);
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        record_type: 'NURTW_VEHICLE',
        plate_matches_sticker: true,
        plate_number: 'E2EEXT-MATCH',
      });
    });
  });

  // --- Non-matches --------------------------------------------------------------

  describe('every non-match is the same answer (Decision 5.4)', () => {
    it('whatever the reason, on every vehicle route', async () => {
      const negatives = [
        await plate('E2EEXT-NONE'), // no record
        await plate('E2EEXT-REC'), // on record only (VEH-22)
        await plate('E2EEXT-BARE'), // declared, never onboarded
        await sticker(`${TAG}-1700000000000`), // not on the register
        await sticker(codes.REG!), // on the register, never attached (11.2)
        await sticker(codes.ISSUED!), // printed, never attached
        await sticker(codes.LOST!), // reported lost
        await sticker(codes.FORGED!), // a forged code (26.1)
        await combined('E2EEXT-OTHER', codes.MATCH!), // another vehicle's sticker
        await combined('E2EEXT-REC', codes.REG!), // its own plate, never attached
        await combined('E2EEXT-MATCH', codes.FORGED!),
      ];

      const first = negatives[0]!;
      expect(shape(first.body)).toEqual({
        result: 'NO_MATCH_FOUND',
        statement:
          'No matching NURTW record was found under the requested verification criteria.',
        limitation: first.body.limitation,
      });
      for (const response of negatives) {
        expect(response.status).toBe(200);
        expect(shape(response.body)).toEqual(shape(first.body));
      }
    });

    it('on the membership route too', async () => {
      const negatives = [
        await membership(identifier()), // no record
        await membership(numbers.suspendedMember!), // not in good standing
        await membership(numbers.replacedCard!), // a replaced card
        await membership(numbers.expiredCard!), // past its expiry
      ];
      const first = negatives[0]!;
      expect(shape(first.body)).toEqual({
        result: 'NO_MATCH_FOUND',
        statement:
          'No matching NURTW record was found under the requested verification criteria.',
        limitation: first.body.limitation,
      });
      for (const response of negatives) {
        expect(response.status).toBe(200);
        expect(shape(response.body)).toEqual(shape(first.body));
      }
    });

    it('keeps the true reasons, and who asked, in the audit trail', async () => {
      await plate('E2EEXT-REC', 'wide', `${TAG}-rec`);
      const [event] = await auditFor(`${TAG}-rec`);
      expect(event).toMatchObject({
        action: 'verification.external.plate',
        subjectType: 'vehicle',
        subjectId: ids.REC,
        actorUserId: null,
      });
      expect(event!.afterValue).toMatchObject({
        channel: 'EXTERNAL',
        clientId: clients.wide!.id,
        tokenId: clients.wide!.tokenId,
        outcome: 'NOT_VERIFIED',
        reasons: ['NOT_DECLARED', 'NOT_ONBOARDED'],
        disclosed: [],
        presentedPlate: 'E2EEXTREC',
      });
    });

    it('records the fields a match disclosed, by name', async () => {
      await plate('E2EEXT-MATCH', 'operational', `${TAG}-disclosed`);
      const [event] = await auditFor(`${TAG}-disclosed`);
      expect(event!.afterValue).toMatchObject({
        outcome: 'MATCH',
        disclosed: [
          'plate_number',
          'vehicle_category',
          'sticker_status',
          'organizational_unit',
        ],
      });
    });

    it('records a forged code as a forgery attempt', async () => {
      await sticker(codes.FORGED!, 'wide', `${TAG}-forged`);
      const [event] = await auditFor(`${TAG}-forged`);
      expect(event).toMatchObject({
        action: 'verification.external.invalid_signature',
        subjectId: null,
      });
      expect(event!.afterValue).toMatchObject({
        clientId: clients.wide!.id,
        presentedCode: codes.FORGED,
      });
    });
  });

  // --- Membership ---------------------------------------------------------------

  describe('a membership check', () => {
    it('confirms a card with the membership profile’s statuses, and no name', async () => {
      const response = await membership(numbers.activeCard!);
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(
        [...ENVELOPE, 'record_type', 'membership_status', 'card_status'].sort(),
      );
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        record_type: 'NURTW_MEMBERSHIP',
        membership_status: 'ACTIVE',
        card_status: 'ACTIVE',
        statement:
          'A matching NURTW membership record was found under the requested verification criteria.',
      });
      expect(response.text).not.toContain(RESTRICTED.memberSurname);
      expect(response.text).not.toContain(numbers.activeCard);
    });

    it('confirms a membership number, however it is typed', async () => {
      const response = await membership(
        numbers.member!.toLowerCase().replace(/-/g, ' '),
      );
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        membership_status: 'ACTIVE',
        card_status: 'ACTIVE',
      });
      expect(response.text).not.toContain(numbers.member);
    });

    it('adds the designation and unit where the profile permits them', async () => {
      const response = await membership(numbers.activeCard!, 'wide');
      expect(response.body).toMatchObject({
        result: 'MATCH_FOUND',
        designation: null,
        organizational_unit: `Branch ${TAG}`,
      });
      expect(response.body).not.toHaveProperty('plate_number');
    });

    it('refuses a mistyped number before any lookup, and logs it', async () => {
      const mistyped = numbers.member!.replace(/.$/, (last) =>
        last === 'A' ? 'B' : 'A',
      );
      const response = await membership(mistyped, 'member', `${TAG}-typo`);
      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        expect.objectContaining({ field: 'number' }),
      ]);
      const [row] = await logFor(`${TAG}-typo`);
      expect(row).toMatchObject({
        resultClass: 'INVALID_REQUEST',
        statusCode: 400,
        clientId: clients.member!.id,
      });
      expect(await auditFor(`${TAG}-typo`)).toEqual([]);
    });
  });

  // --- The request log ------------------------------------------------------------

  describe('the request log', () => {
    it('records one row per check, with its outcome and scheme', async () => {
      await sticker(codes.MATCH!, 'operational', `${TAG}-signed`);
      await sticker(codes.ATT!, 'operational', `${TAG}-legacy`);
      await plate('E2EEXT-NONE', 'operational', `${TAG}-none`);

      const [signed] = await logFor(`${TAG}-signed`);
      expect(signed).toMatchObject({
        endpoint: 'POST /api/v1/verification/sticker/qr',
        scope: 'sticker:verify:qr',
        resultClass: 'MATCH',
        statusCode: 200,
        clientId: clients.operational!.id,
        tokenId: clients.operational!.tokenId,
        identifierScheme: 'SIGNED',
      });
      expect((await logFor(`${TAG}-legacy`))[0]).toMatchObject({
        resultClass: 'MATCH',
        identifierScheme: 'LEGACY',
      });
      const none = await logFor(`${TAG}-none`);
      expect(none).toHaveLength(1);
      expect(none[0]).toMatchObject({
        endpoint: 'POST /api/v1/verification/vehicle/plate',
        resultClass: 'NO_MATCH',
        identifierScheme: null,
      });
    });

    it('records a forged code as such, though the answer is an ordinary non-match', async () => {
      const [row] = await logFor(`${TAG}-forged`);
      expect(row).toMatchObject({
        resultClass: 'INVALID_SIGNATURE',
        identifierScheme: 'SIGNED',
        statusCode: 200,
      });
    });

    it('answers 503 for a signed code it cannot check, and calls it no forgery', async () => {
      delete process.env.STICKER_SIGNING_SECRET;
      try {
        const response = await sticker(codes.MATCH!, 'wide', `${TAG}-nosecret`);
        expect(response.status).toBe(503);
      } finally {
        process.env.STICKER_SIGNING_SECRET = SIGNING_SECRET;
      }
      expect((await logFor(`${TAG}-nosecret`))[0]).toMatchObject({
        resultClass: 'UNAVAILABLE',
        statusCode: 503,
      });
      expect(await auditFor(`${TAG}-nosecret`)).toEqual([]);
    });

    it('never holds the token, its hash, or what was looked up', async () => {
      const rows = JSON.stringify(
        await prisma.apiRequestLog.findMany({
          where: { clientId: { in: Object.values(clients).map((c) => c.id) } },
        }),
      );
      expect(rows.length).toBeGreaterThan(500);
      for (const token of Object.values(tokens)) {
        expect(rows).not.toContain(token.slice(15));
        expect(rows).not.toContain(hashApiToken(token));
      }
      expect(rows).not.toMatch(/E2EEXT/);
      expect(rows).not.toContain(codes.MATCH);
    });
  });

  // --- What never leaves ------------------------------------------------------------

  describe('what never leaves (criteria 12 and 15)', () => {
    it('no answer carries a restricted value, a declaration, a reason, or dues', () => {
      expect(answers.length).toBeGreaterThan(30);
      const all = answers.join('\n');
      for (const value of Object.values(RESTRICTED)) {
        expect(all).not.toContain(value);
      }
      expect(all).not.toMatch(
        /declar|ON_RECORD|NOT_ONBOARDED|NO_RECORD|PLATE_MISMATCH|STICKER_NOT|INVALID_CODE|MEMBER_NOT_ACTIVE|CARD_NOT_ACTIVE|CARD_EXPIRED/i,
      );

      const forbiddenKey =
        /declar|dues|levy|payment|member_name|membership_number|card_number|card_expiry|owner|phone|address|chassis|vin|note|reason|vehicle_id|make|model|color|route_type|registered_plate|sticker_plate|identifier_scheme|onboarded/;
      for (const text of answers) {
        const body = JSON.parse(text) as Record<string, unknown>;
        for (const key of Object.keys(body)) {
          expect(key, text).not.toMatch(forbiddenKey);
        }
      }
    });

    it('writes nothing but the audit event and the log row', async () => {
      expect(await snapshot()).toBe(snapshotBefore);
    });
  });

  /** The rows a check might touch, with the columns a write would change. */
  async function snapshot(): Promise<string> {
    const [vehicles, stickers, members, cards] = await Promise.all([
      prisma.vehicle.findMany({
        where: { plateNumberNormalized: { startsWith: 'E2EEXT' } },
        select: { id: true, status: true, declaredAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.sticker.findMany({
        where: { stickerQrId: { startsWith: TAG } },
        select: {
          id: true,
          status: true,
          vehicleId: true,
          attachedAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      prisma.member.findMany({
        where: { firstName: TAG },
        select: { id: true, status: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.card.findMany({
        where: { member: { firstName: TAG } },
        select: { id: true, status: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return JSON.stringify({ vehicles, stickers, members, cards });
  }

  async function cleanUp(): Promise<void> {
    const clientRows = await prisma.apiClient.findMany({
      where: { organisationName: { contains: TAG } },
      select: { id: true },
    });
    const clientIds = clientRows.map((row) => row.id);
    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);

    await prisma.apiRequestLog.deleteMany({
      where: {
        OR: [
          { clientId: { in: clientIds } },
          { requestId: { startsWith: TAG } },
        ],
      },
    });
    // Only this suite's events: those it named, and those of its own
    // organisations. Never another organisation's.
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { requestId: { startsWith: TAG } },
          ...clientIds.map((clientId) => ({
            action: { startsWith: 'verification.external.' },
            afterValue: { path: ['clientId'], equals: clientId },
          })),
        ],
      },
    });
    await prisma.apiClient.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.disclosureProfile.deleteMany({
      where: { code: WIDE_PROFILE },
    });
    await prisma.rateLimitProfile.deleteMany({ where: { code: LIMITS_CODE } });
    await prisma.sticker.deleteMany({
      where: { stickerQrId: { startsWith: TAG } },
    });
    await prisma.vehicle.deleteMany({ where: { branchId: { in: orgIds } } });
    await prisma.card.deleteMany({
      where: { member: { organisationId: { in: orgIds } } },
    });
    await prisma.member.deleteMany({
      where: { organisationId: { in: orgIds } },
    });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { StickerService } from './../src/sticker/sticker.service.js';
import { VerificationService } from './../src/verification/verification.service.js';

/**
 * Internal verification, end to end (PRD §11, `plans/10-internal-verification.md`).
 *
 * The assertions that carry weight: a plate, a sticker, and both together
 * each give the verdict VEH-22 requires, with every reason behind a negative
 * one (acceptance criterion 5); a forged code is refused before any lookup and
 * audited as such (Requirement 26.1); member details, the vehicle link, and
 * dues stay within the officer's read scope; nothing outside the audit trail
 * is written; and no response carries a restricted value (criterion 12).
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-verify';
const PASSWORD = 'e2e-fixture-password-1';
const SIGNING_SECRET = 'e2e-fixture-verify-signing-secret';

/** Values that must never appear in any verification response. */
const RESTRICTED = {
  ownerPhone: '+2348000000901',
  ownerAddress: 'E2E RESTRICTED OWNER ADDRESS',
  chassis: 'E2ERESTRICTEDVIN01',
  notes: 'E2E RESTRICTED NOTE',
  memberPhone: '+2348000000902',
  memberAddress: 'E2E RESTRICTED MEMBER ADDRESS',
};

interface Verification {
  reference: string;
  criteria: string;
  matched: boolean;
  reasons: string[];
  statement: string;
  limitation: string;
  fields: Record<string, unknown>;
  dues: {
    vehicle: { vehicleId: string } | null;
    member: { memberId: string } | null;
  };
}

describe('Internal verification (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const cookies: Record<string, string> = {};
  const responses: string[] = [];
  const savedSecret = process.env.STICKER_SIGNING_SECRET;
  const savedKeyId = process.env.STICKER_SIGNING_KEY_ID;

  let branchId: string;
  let otherBranchId: string;
  const ids: Record<string, string> = {};
  const codes: Record<string, string> = {};

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
    branchId = await branch(council.id, `Branch ${TAG}`);
    otherBranchId = await branch(council.id, `Other branch ${TAG}`);

    const routeType = await prisma.routeType.findUniqueOrThrow({
      where: { code: 'INTERCITY' },
    });
    const category = await prisma.vehicleCategory.findFirstOrThrow({
      orderBy: { code: 'asc' },
    });

    const member = await prisma.member.create({
      data: {
        surname: 'Verified',
        firstName: TAG,
        organisationId: branchId,
        status: 'ACTIVE',
        membershipNumber: `${TAG}-M1`,
        contact: {
          create: {
            phone: RESTRICTED.memberPhone,
            residentialAddress: RESTRICTED.memberAddress,
          },
        },
      },
    });
    const otherMember = await prisma.member.create({
      data: {
        surname: 'Elsewhere',
        firstName: TAG,
        organisationId: otherBranchId,
        status: 'ACTIVE',
        membershipNumber: `${TAG}-M2`,
      },
    });
    ids.member = member.id;

    async function vehicle(
      key: string,
      status: 'ACTIVE' | 'ON_RECORD',
      extra: { branchId?: string; memberId?: string } = {},
    ) {
      const row = await prisma.vehicle.create({
        data: {
          plateNumberDisplay: `E2EVFY-${key}`,
          plateNumberNormalized: `E2EVFY${key}`,
          branchId: extra.branchId ?? branchId,
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
          declaredByMemberId: extra.memberId ?? null,
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

    const matched = await vehicle('MATCH', 'ACTIVE', { memberId: member.id });
    await vehicle('REC', 'ON_RECORD');
    await vehicle('BARE', 'ACTIVE');
    const lost = await vehicle('LOST', 'ACTIVE');
    const other = await vehicle('OTHER', 'ACTIVE', {
      branchId: otherBranchId,
      memberId: otherMember.id,
    });

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
      ids[`sticker-${key}`] = row.id;
      codes[key] = app.get(StickerService).mintQrPayload(row.stickerQrId);
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await signedSticker('MATCH', 'ACTIVE', matched);
    await signedSticker('ISSUED', 'ISSUED', null);
    await signedSticker('LOST', 'LOST', lost);
    await signedSticker('OTHER', 'ACTIVE', other);

    // A Transpay register row, shaped as the legacy import writes it.
    const legacy = await prisma.sticker.create({
      data: {
        stickerQrId: `${TAG}-LEGACY`,
        legacyBarcode: `${TAG}-1600000000000`,
        registeredPlateNormalized: 'E2EVFYREC',
        legacySecurityCode: 'ZZ9ZZ',
        templateVersion: 'transpay-legacy',
        status: 'ISSUED',
      },
    });
    ids['sticker-LEGACY'] = legacy.id;
    codes.LEGACY = legacy.legacyBarcode!;

    await buildUser('officer', [
      'verification.perform',
      'vehicle.read',
      'member.read',
    ]);
    await buildUser('verifier', ['verification.perform']);
    await buildUser('bystander', ['vehicle.read']);
    for (const who of ['officer', 'verifier', 'bystander']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
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

  async function verify(
    body: Record<string, string>,
    who = 'officer',
  ): Promise<Verification> {
    const response = await request(server)
      .post('/api/v1/verifications')
      .set('Cookie', cookies[who]!)
      .send(body)
      .expect(200);
    responses.push(JSON.stringify(response.body));
    return response.body.verification as Verification;
  }

  async function auditFor(reference: string) {
    return prisma.auditEvent.findFirstOrThrow({
      where: { requestId: reference, action: { startsWith: 'verification.' } },
    });
  }

  describe('access', () => {
    it('refuses a caller without verification.perform', async () => {
      await request(server)
        .post('/api/v1/verifications')
        .set('Cookie', cookies.bystander!)
        .send({ plateNumber: 'E2EVFY-MATCH' })
        .expect(403);
    });

    it('refuses a request naming neither a plate nor a sticker', async () => {
      await request(server)
        .post('/api/v1/verifications')
        .set('Cookie', cookies.officer!)
        .send({})
        .expect(400);
    });
  });

  describe('by plate', () => {
    it('matches a declared, onboarded vehicle, however the plate is typed', async () => {
      const result = await verify({ plateNumber: ' e2evfy match ' });

      expect(result).toMatchObject({
        criteria: 'PLATE',
        matched: true,
        reasons: [],
        statement:
          'A matching NURTW vehicle record was found under the requested verification criteria.',
      });
      expect(result.limitation).toMatch(/not evidence of ownership/);
      expect(result.fields).toMatchObject({
        plate_number: 'E2EVFY-MATCH',
        declaration_status: 'ACTIVE',
        sticker_status: 'ACTIVE',
        identifier_scheme: 'SIGNED',
        organizational_unit: `Branch ${TAG}`,
        make: 'Toyota',
        vehicle_id: ids.MATCH,
        member_name: `${TAG} Verified`,
        membership_number: `${TAG}-M1`,
      });
      expect(result.fields.onboarded_at).not.toBeNull();
      // Requirement 27.8 — beside the verdict, within the officer's scope.
      expect(result.dues.vehicle?.vehicleId).toBe(ids.MATCH);
      expect(result.dues.member?.memberId).toBe(ids.member);

      const audit = await auditFor(result.reference);
      expect(audit).toMatchObject({
        action: 'verification.plate',
        subjectType: 'vehicle',
        subjectId: ids.MATCH,
      });
      expect(audit.afterValue).toMatchObject({
        outcome: 'MATCH',
        reasons: [],
        scheme: null,
        presentedPlate: 'E2EVFYMATCH',
      });
    });

    it('gives both reasons for a legacy vehicle on record only (VEH-22)', async () => {
      const result = await verify({ plateNumber: 'E2EVFY-REC' });
      expect(result.matched).toBe(false);
      expect(result.reasons).toEqual(['NOT_DECLARED', 'NOT_ONBOARDED']);
      expect(result.statement).toBe(
        'No matching NURTW record was found under the requested verification criteria.',
      );
      expect(result.fields).toMatchObject({
        declaration_status: 'ON_RECORD',
        onboarded_at: null,
        sticker_status: null,
      });
    });

    it('refuses a declared vehicle that has never been onboarded', async () => {
      const result = await verify({ plateNumber: 'E2EVFY-BARE' });
      expect(result.reasons).toEqual(['NOT_ONBOARDED']);
    });

    it('answers no record for an unknown plate, and records what was presented', async () => {
      const result = await verify({ plateNumber: 'E2EVFY-NONE' });
      expect(result).toMatchObject({
        matched: false,
        reasons: ['NO_RECORD'],
        fields: {},
        dues: { vehicle: null, member: null },
      });
      const audit = await auditFor(result.reference);
      expect(audit.subjectType).toBe('verification');
      expect(audit.afterValue).toMatchObject({ presentedPlate: 'E2EVFYNONE' });
    });
  });

  describe('by sticker', () => {
    it('matches an attached, ACTIVE signed sticker and names its plate', async () => {
      const result = await verify({ stickerCode: codes.MATCH! });
      expect(result).toMatchObject({ criteria: 'STICKER', matched: true });
      expect(result.fields).toMatchObject({
        sticker_plate: 'E2EVFY-MATCH',
        sticker_status: 'ACTIVE',
        identifier_scheme: 'SIGNED',
      });
      const audit = await auditFor(result.reference);
      expect(audit.action).toBe('verification.sticker');
      expect(audit.afterValue).toMatchObject({
        scheme: 'SIGNED',
        stickerId: ids['sticker-MATCH'],
      });
    });

    it('refuses a forged code before any lookup, and audits it as one (Requirement 26.1)', async () => {
      // The service's private lookups: none may run for a forged code.
      const service = app.get(VerificationService) as unknown as Record<
        'findSignedSticker' | 'findRegisteredBarcode' | 'findVehicleByPlate',
        (...args: unknown[]) => unknown
      >;
      const lookups = [
        vi.spyOn(service, 'findSignedSticker'),
        vi.spyOn(service, 'findRegisteredBarcode'),
        vi.spyOn(service, 'findVehicleByPlate'),
      ];
      // The genuine payload with its last signature character changed.
      const genuine = codes.MATCH!;
      const forged = `${genuine.slice(0, -1)}${genuine.endsWith('0') ? '1' : '0'}`;

      try {
        const result = await verify({
          stickerCode: forged,
          plateNumber: 'E2EVFY-MATCH',
        });
        expect(result).toMatchObject({
          criteria: 'COMBINED',
          matched: false,
          reasons: ['INVALID_CODE'],
          fields: {},
          dues: { vehicle: null, member: null },
        });
        for (const lookup of lookups) {
          expect(lookup).not.toHaveBeenCalled();
        }
        const audit = await auditFor(result.reference);
        expect(audit.action).toBe('verification.invalid_signature');
        expect(audit.afterValue).toMatchObject({ presentedCode: forged });

        // The control: the same spies do see the genuine code's lookup, so
        // the silence above is the service's, not the spies'.
        await verify({ stickerCode: genuine, plateNumber: 'E2EVFY-MATCH' });
        expect(lookups[0]).toHaveBeenCalledTimes(1);
      } finally {
        for (const lookup of lookups) {
          lookup.mockRestore();
        }
      }
    });

    it('refuses a signed sticker that has not been attached (Requirement 10.3)', async () => {
      const result = await verify({ stickerCode: codes.ISSUED! });
      expect(result.reasons).toEqual(['STICKER_NOT_ATTACHED']);
      expect(result.fields).toMatchObject({
        sticker_status: 'ISSUED',
        sticker_plate: null,
      });
    });

    it('refuses a sticker reported lost, though its signature is valid (Requirement 26.3)', async () => {
      const result = await verify({ stickerCode: codes.LOST! });
      expect(result.reasons).toEqual(['STICKER_NOT_ACTIVE']);
      expect(result.fields).toMatchObject({ sticker_status: 'LOST' });
    });

    it('reads an unattached Transpay barcode as recognised, with its registered plate (Requirement 11.2)', async () => {
      const result = await verify({ stickerCode: codes.LEGACY! });
      expect(result.reasons).toEqual(['STICKER_NOT_ATTACHED']);
      expect(result.fields).toMatchObject({
        identifier_scheme: 'LEGACY',
        registered_plate: 'E2EVFYREC',
      });
      const audit = await auditFor(result.reference);
      expect(audit.afterValue).toMatchObject({ scheme: 'LEGACY' });
    });

    it('answers no record for a barcode not on the register, keeping what was presented', async () => {
      const result = await verify({ stickerCode: `${TAG}-9999999999999` });
      expect(result.reasons).toEqual(['NO_RECORD']);
      const audit = await auditFor(result.reference);
      expect(audit.afterValue).toMatchObject({
        scheme: 'LEGACY',
        presentedCode: `${TAG}-9999999999999`,
      });
    });

    it('answers 503 for a signed code when no signing secret is configured', async () => {
      delete process.env.STICKER_SIGNING_SECRET;
      try {
        await request(server)
          .post('/api/v1/verifications')
          .set('Cookie', cookies.officer!)
          .send({ stickerCode: codes.MATCH! })
          .expect(503);
        // A Transpay barcode needs no secret.
        expect((await verify({ stickerCode: codes.LEGACY! })).reasons).toEqual([
          'STICKER_NOT_ATTACHED',
        ]);
      } finally {
        process.env.STICKER_SIGNING_SECRET = SIGNING_SECRET;
      }
    });
  });

  describe('plate and sticker together', () => {
    it('matches the sticker on its own vehicle', async () => {
      const result = await verify({
        plateNumber: 'E2EVFY-MATCH',
        stickerCode: codes.MATCH!,
      });
      expect(result).toMatchObject({ criteria: 'COMBINED', matched: true });
      expect(result.fields.plate_matches_sticker).toBe(true);
      expect((await auditFor(result.reference)).action).toBe(
        'verification.combined',
      );
    });

    it('reports a genuine sticker presented on another vehicle (acceptance criterion 5)', async () => {
      const result = await verify({
        plateNumber: 'E2EVFY-BARE',
        stickerCode: codes.MATCH!,
      });
      expect(result.matched).toBe(false);
      expect(result.reasons[0]).toBe('PLATE_MISMATCH');
      expect(result.fields).toMatchObject({
        plate_matches_sticker: false,
        sticker_plate: 'E2EVFY-MATCH',
      });
    });

    it('catches a Transpay barcode presented for a plate other than its registered one', async () => {
      const wrong = await verify({
        plateNumber: 'E2EVFY-BARE',
        stickerCode: codes.LEGACY!,
      });
      expect(wrong.reasons).toEqual(['PLATE_MISMATCH', 'STICKER_NOT_ATTACHED']);

      const own = await verify({
        plateNumber: 'E2EVFY-REC',
        stickerCode: codes.LEGACY!,
      });
      expect(own.reasons).toEqual(['STICKER_NOT_ATTACHED']);
      expect(own.fields.plate_matches_sticker).toBe(true);
    });
  });

  describe('scope', () => {
    it('gives the verdict outside the officer’s scope, without the member, the link, or dues', async () => {
      const result = await verify({ stickerCode: codes.OTHER! });
      expect(result.matched).toBe(true);
      expect(result.fields.plate_number).toBe('E2EVFY-OTHER');
      expect(result.fields).not.toHaveProperty('vehicle_id');
      expect(result.fields).not.toHaveProperty('member_name');
      expect(result.fields).not.toHaveProperty('membership_number');
      expect(result.dues).toEqual({ vehicle: null, member: null });
    });

    it('shows a verifier without read permissions the verdict alone', async () => {
      const result = await verify({ plateNumber: 'E2EVFY-MATCH' }, 'verifier');
      expect(result.matched).toBe(true);
      expect(result.fields).not.toHaveProperty('vehicle_id');
      expect(result.fields).not.toHaveProperty('member_name');
      expect(result.dues).toEqual({ vehicle: null, member: null });
    });
  });

  describe('what a verification never does', () => {
    it('writes nothing but its audit event (CLAUDE.md rule 1)', async () => {
      const snapshot = async () => ({
        vehicles: await prisma.vehicle.findMany({
          where: { plateNumberNormalized: { startsWith: 'E2EVFY' } },
          select: { id: true, status: true, declaredAt: true, updatedAt: true },
          orderBy: { id: 'asc' },
        }),
        stickers: await prisma.sticker.findMany({
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
        members: await prisma.member.findMany({
          where: { firstName: TAG },
          select: { id: true, status: true, updatedAt: true },
          orderBy: { id: 'asc' },
        }),
        payments: await prisma.payment.count({
          where: {
            subjectId: { in: Object.values(ids) },
          },
        }),
        cards: await prisma.card.count({ where: { memberId: ids.member } }),
      });

      const before = await snapshot();
      await verify({ plateNumber: 'E2EVFY-REC' });
      await verify({ plateNumber: 'E2EVFY-MATCH', stickerCode: codes.MATCH! });
      await verify({ plateNumber: 'E2EVFY-REC', stickerCode: codes.LEGACY! });
      await verify({ stickerCode: codes.ISSUED! });
      await verify({ stickerCode: codes.LOST! });
      expect(await snapshot()).toEqual(before);
    });

    it('carries no restricted value in any response (acceptance criterion 12)', () => {
      expect(responses.length).toBeGreaterThan(10);
      const everything = responses.join('\n');
      for (const value of Object.values(RESTRICTED)) {
        expect(everything).not.toContain(value);
      }
      expect(everything).not.toContain('ZZ9ZZ'); // the Transpay security code
      expect(everything).not.toContain(SIGNING_SECRET);
    });
  });

  async function branch(councilId: string, name: string): Promise<string> {
    const row = await prisma.organisation.create({
      data: {
        name,
        level: 'BRANCH',
        parentId: councilId,
        path: `/${councilId}/placeholder-${name}`,
      },
    });
    await prisma.organisation.update({
      where: { id: row.id },
      data: { path: `/${councilId}/${row.id}/` },
    });
    return row.id;
  }

  async function buildUser(
    who: string,
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
          organisationId: branchId,
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
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);

    await prisma.sticker.deleteMany({
      where: { stickerQrId: { startsWith: TAG } },
    });
    await prisma.vehicle.deleteMany({ where: { branchId: { in: orgIds } } });
    await prisma.member.deleteMany({
      where: { organisationId: { in: orgIds } },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

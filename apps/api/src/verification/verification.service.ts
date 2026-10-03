import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  InternalVerification,
  MemberDues,
  VehicleDues,
  VerifyInput,
} from '@nurtw/contracts';
import {
  MATCH_STATEMENTS,
  NO_MATCH_STATEMENT,
  VERIFICATION_FIELD_NAMES,
  VERIFICATION_LIMITATION,
  decideVerification,
  normalizePlateNumber,
  projectVerification,
  stickerCodeScheme,
  type DeclarationStatus,
  type VerificationCriteria,
  type VerificationField,
  type VerificationValues,
  type VerificationVerdict,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { DuesService } from '../payments/dues.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StickerService } from '../sticker/sticker.service.js';

const PERFORM = 'verification.perform';
const READ_VEHICLE = 'vehicle.read';
const READ_MEMBER = 'member.read';

/**
 * What a verification reads of a vehicle. Never the owner, the chassis or VIN,
 * or the notes: acceptance criterion 12 holds because they are never selected,
 * not because they are dropped later.
 */
const VEHICLE_SELECT = {
  id: true,
  plateNumberDisplay: true,
  plateNumberNormalized: true,
  status: true,
  make: true,
  model: true,
  color: true,
  createdAt: true,
  declaredByMemberId: true,
  vehicleCategory: { select: { label: true } },
  routeType: { select: { label: true } },
  branch: { select: { name: true, path: true } },
  unit: { select: { name: true, path: true } },
} satisfies Prisma.VehicleSelect;

/** What a verification reads of a sticker. Never `legacySecurityCode` (Requirement 9A.5). */
const STICKER_SELECT = {
  id: true,
  status: true,
  attachedAt: true,
  vehicleId: true,
  legacyBarcode: true,
  registeredPlateNormalized: true,
} satisfies Prisma.StickerSelect;

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>;
type StickerRow = Prisma.StickerGetPayload<{ select: typeof STICKER_SELECT }>;

/**
 * Which row answers for a plate when several share it. A live declaration
 * first; history only when nothing else stands (Decision 6.6). Recording
 * refuses a plate with any live row, so more than one live row means a
 * declaration and a competing claim.
 */
const PLATE_PRIORITY: readonly DeclarationStatus[] = [
  'ACTIVE',
  'SUSPENDED',
  'DISPUTED',
  'PENDING',
  'ON_RECORD',
  'RETIRED',
  'ARCHIVED',
];

const MEMBER_FIELDS: readonly VerificationField[] = [
  'member_name',
  'membership_number',
  'member_status',
];

/**
 * What every internal check may show. The vehicle link and the member are
 * added only within the officer's own read scope; everything here identifies
 * a vehicle and a sticker, never a person.
 */
const BASE_FIELDS: readonly VerificationField[] =
  VERIFICATION_FIELD_NAMES.filter(
    (field) => field !== 'vehicle_id' && !MEMBER_FIELDS.includes(field),
  );

export interface VerificationRequestMeta {
  requestId: string;
  ipAddress?: string;
}

/**
 * Internal verification (PRD §11 — item 10): the dashboard and the officer
 * portal.
 *
 * **Read-only, without exception** (PRD §9.5–9.6, CLAUDE.md rule 1). Apart
 * from its audit event, nothing here writes: no declaration, sticker, card,
 * member, or payment row is created, completed, or reactivated by a check,
 * matched or not. `verification-read-only.spec.ts` fails if a write call
 * appears in this module.
 *
 * Not organisation-scoped. An officer checks whatever vehicle is in front of
 * them, so `verification.perform` anywhere is enough for the verdict and the
 * facts about the vehicle and sticker. The member, the link to the vehicle,
 * and dues follow the officer's ordinary read scope.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly stickers: StickerService,
    private readonly dues: DuesService,
  ) {}

  async verify(
    userId: string,
    input: VerifyInput,
    meta: VerificationRequestMeta,
    now = new Date(),
  ): Promise<InternalVerification> {
    if (!(await this.permissions.canAnywhere(userId, PERFORM))) {
      throw new ForbiddenException();
    }

    const criteria: VerificationCriteria =
      input.plateNumber && input.stickerCode
        ? 'COMBINED'
        : input.plateNumber
          ? 'PLATE'
          : 'STICKER';
    const presentedPlate = input.plateNumber
      ? normalizePlateNumber(input.plateNumber)
      : null;
    const scheme = input.stickerCode
      ? stickerCodeScheme(input.stickerCode)
      : null;

    // Requirement 26.1 — a signed code is checked before anything is looked
    // up. A failure is a forgery attempt, recorded as one, and the officer is
    // told the code is not valid; no record is consulted at all.
    let signedStickerQrId: string | null = null;
    if (input.stickerCode && scheme === 'SIGNED') {
      if (!this.stickers.canVerifySignatures()) {
        this.logger.warn(
          'A signed sticker was presented, but STICKER_SIGNING_SECRET is not set.',
        );
        throw new ServiceUnavailableException(
          'Signed stickers cannot be verified: the signing secret is not configured.',
        );
      }
      const signature = this.stickers.verifyQrSignature(input.stickerCode);
      if (signature.valid) {
        signedStickerQrId = signature.stickerQrId;
      } else {
        await this.audit.record({
          action: 'verification.invalid_signature',
          subjectType: 'sticker',
          actorUserId: userId,
          requestId: meta.requestId,
          ipAddress: meta.ipAddress,
          after: {
            criteria,
            presentedCode: input.stickerCode,
            ...(presentedPlate ? { presentedPlate } : {}),
          },
        });
        return this.respond(
          criteria,
          criteria === 'COMBINED'
            ? decideVerification({
                criteria,
                codeValid: false,
                presentedPlate: presentedPlate!,
                sticker: null,
                vehicle: null,
              })
            : decideVerification({
                criteria: 'STICKER',
                codeValid: false,
                sticker: null,
                vehicle: null,
              }),
          {},
          { vehicle: null, member: null },
          meta,
          now,
        );
      }
    }

    const sticker = signedStickerQrId
      ? await this.findSignedSticker(signedStickerQrId)
      : input.stickerCode
        ? await this.findRegisteredBarcode(input.stickerCode)
        : null;

    // The vehicle: the plate's own record for a plate check, otherwise the one
    // the sticker is attached to. A presented plate is compared with that
    // vehicle, never looked up beside it.
    const vehicle =
      criteria === 'PLATE'
        ? await this.findVehicleByPlate(presentedPlate!)
        : sticker?.attachedAt && sticker.vehicleId
          ? await this.prisma.vehicle.findUnique({
              where: { id: sticker.vehicleId },
              select: VEHICLE_SELECT,
            })
          : null;

    const [firstAttachedAt, currentSticker] = vehicle
      ? await Promise.all([
          // Decision 6.5 — onboarded once a sticker has been attached, as the
          // dues schedule reads it.
          this.prisma.sticker
            .findFirst({
              where: { vehicleId: vehicle.id, attachedAt: { not: null } },
              orderBy: { attachedAt: 'asc' },
              select: { attachedAt: true },
            })
            .then((row) => row?.attachedAt ?? null),
          criteria === 'PLATE'
            ? this.prisma.sticker.findFirst({
                where: { vehicleId: vehicle.id, attachedAt: { not: null } },
                orderBy: { attachedAt: 'desc' },
                select: STICKER_SELECT,
              })
            : Promise.resolve(sticker),
        ])
      : [null, sticker];

    const vehicleFacts = vehicle
      ? {
          declarationStatus: vehicle.status,
          plateNumberNormalized: vehicle.plateNumberNormalized,
          onboarded: firstAttachedAt !== null,
        }
      : null;
    const stickerFacts = sticker
      ? {
          status: sticker.status,
          attached: sticker.attachedAt !== null,
          registeredPlateNormalized: sticker.registeredPlateNormalized,
        }
      : null;
    const verdict =
      criteria === 'PLATE'
        ? decideVerification({ criteria, vehicle: vehicleFacts })
        : criteria === 'STICKER'
          ? decideVerification({
              criteria,
              codeValid: true,
              sticker: stickerFacts,
              vehicle: vehicleFacts,
            })
          : decideVerification({
              criteria,
              codeValid: true,
              presentedPlate: presentedPlate!,
              sticker: stickerFacts,
              vehicle: vehicleFacts,
            });

    // Beyond the base fields, scope decides: the vehicle link and its levy
    // need `vehicle.read` over the vehicle, the member and their fee need
    // `member.read` over the member — the same checks the dues routes make.
    const vehiclePath = vehicle?.unit?.path ?? vehicle?.branch?.path ?? null;
    const vehicleReadable =
      vehiclePath !== null &&
      (await this.permissions.can(userId, READ_VEHICLE, vehiclePath));
    const member = vehicle?.declaredByMemberId
      ? await this.prisma.member.findUnique({
          where: { id: vehicle.declaredByMemberId },
          select: {
            id: true,
            firstName: true,
            surname: true,
            membershipNumber: true,
            status: true,
            organisation: { select: { path: true } },
          },
        })
      : null;
    const memberReadable =
      member !== null &&
      (await this.permissions.can(
        userId,
        READ_MEMBER,
        member.organisation.path,
      ));

    const [vehicleDues, memberDues] = await Promise.all([
      vehicle && vehicleReadable
        ? this.dues.vehicleDues(vehicle.id, now)
        : Promise.resolve(null),
      member && memberReadable
        ? this.dues.memberDues(member.id, now)
        : Promise.resolve(null),
    ]);

    // The plate the sticker answers for: its vehicle's, once attached, or the
    // register's for a Transpay barcode not yet attached.
    const stickerPlate =
      sticker?.attachedAt && vehicle
        ? vehicle.plateNumberNormalized
        : (sticker?.registeredPlateNormalized ?? null);

    const values: VerificationValues = {
      plate_number: vehicle?.plateNumberDisplay ?? null,
      vehicle_category: vehicle?.vehicleCategory?.label ?? null,
      sticker_status: currentSticker?.status ?? null,
      organizational_unit: vehicle
        ? (vehicle.unit?.name ?? vehicle.branch?.name ?? null)
        : null,
      attached_at: currentSticker?.attachedAt?.toISOString() ?? null,
      plate_matches_sticker:
        criteria === 'COMBINED' && sticker
          ? stickerPlate === presentedPlate
          : null,
      declaration_status: vehicle?.status ?? null,
      onboarded_at: firstAttachedAt?.toISOString() ?? null,
      identifier_scheme: currentSticker
        ? currentSticker.legacyBarcode !== null
          ? 'LEGACY'
          : 'SIGNED'
        : null,
      registered_plate: sticker?.registeredPlateNormalized ?? null,
      sticker_plate:
        criteria !== 'PLATE' && sticker?.attachedAt
          ? (vehicle?.plateNumberDisplay ?? null)
          : null,
      make: vehicle?.make ?? null,
      model: vehicle?.model ?? null,
      color: vehicle?.color ?? null,
      route_type: vehicle?.routeType?.label ?? null,
      vehicle_id: vehicle?.id ?? null,
      member_name: member ? `${member.firstName} ${member.surname}` : null,
      membership_number: member?.membershipNumber ?? null,
      member_status: member?.status ?? null,
    };

    // The fields describe what was found; with nothing found there is
    // nothing to describe.
    const permitted: VerificationField[] =
      vehicle || sticker
        ? [
            ...BASE_FIELDS,
            ...(vehicleReadable ? (['vehicle_id'] as const) : []),
            ...(memberReadable ? MEMBER_FIELDS : []),
          ]
        : [];

    await this.audit.record({
      action: `verification.${criteria.toLowerCase()}`,
      subjectType: vehicle ? 'vehicle' : sticker ? 'sticker' : 'verification',
      subjectId: vehicle?.id ?? sticker?.id ?? null,
      actorUserId: userId,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      after: {
        outcome: verdict.matched ? 'MATCH' : 'NOT_VERIFIED',
        reasons: [...verdict.reasons],
        // PRD §26.4 — which scheme the presented code used, so legacy
        // exposure is measured, not assumed. `null` for a plate check.
        scheme,
        ...(sticker ? { stickerId: sticker.id } : {}),
        ...(presentedPlate ? { presentedPlate } : {}),
        // A code that answers to nothing is kept, as the Transpay lookup keeps
        // an unknown barcode, so the Union can see how often one turns up.
        ...(input.stickerCode && !sticker
          ? { presentedCode: input.stickerCode }
          : {}),
      },
    });

    return this.respond(
      criteria,
      verdict,
      projectVerification(values, permitted, 'INTERNAL'),
      { vehicle: vehicleDues, member: memberDues },
      meta,
      now,
    );
  }

  private respond(
    criteria: VerificationCriteria,
    verdict: VerificationVerdict,
    fields: InternalVerification['fields'],
    dues: { vehicle: VehicleDues | null; member: MemberDues | null },
    meta: VerificationRequestMeta,
    now: Date,
  ): InternalVerification {
    return {
      reference: meta.requestId,
      verifiedAt: now.toISOString(),
      criteria,
      matched: verdict.matched,
      reasons: verdict.reasons,
      statement: verdict.matched
        ? MATCH_STATEMENTS[criteria]
        : NO_MATCH_STATEMENT,
      limitation: VERIFICATION_LIMITATION,
      fields,
      dues,
    };
  }

  /**
   * A signed code resolves only a signed sticker, and a Transpay barcode only
   * a row on the register. The two never stand in for each other
   * (Requirement 26.5).
   */
  private findSignedSticker(stickerQrId: string): Promise<StickerRow | null> {
    return this.prisma.sticker.findFirst({
      where: { stickerQrId, legacyBarcode: null },
      select: STICKER_SELECT,
    });
  }

  private async findRegisteredBarcode(
    barcode: string,
  ): Promise<StickerRow | null> {
    const entry = await this.prisma.sticker.findUnique({
      where: { legacyBarcode: barcode },
      select: STICKER_SELECT,
    });
    // A row with no registered plate is not on the register, and is treated
    // as unknown rather than guessed at (`describeLegacyBarcode`).
    return entry?.registeredPlateNormalized ? entry : null;
  }

  private async findVehicleByPlate(
    plateNumberNormalized: string,
  ): Promise<VehicleRow | null> {
    const rows = await this.prisma.vehicle.findMany({
      where: { plateNumberNormalized },
      select: VEHICLE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) {
      return null;
    }
    // Stable sort: within one status, the newest row (already first) wins.
    return [...rows].sort(
      (a, b) =>
        PLATE_PRIORITY.indexOf(a.status) - PLATE_PRIORITY.indexOf(b.status),
    )[0]!;
  }
}

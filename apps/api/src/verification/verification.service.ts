import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  InternalVerification,
  MemberDues,
  VehicleDues,
  VerifyInput,
} from '@nurtw/contracts';
import {
  MATCH_STATEMENTS,
  NO_MATCH_STATEMENT,
  VERIFICATION_LIMITATION,
  discloseReasons,
  normalizePlateNumber,
  projectVerification,
  type VerificationCriteria,
  type VerificationField,
  type VerificationValues,
  type VerificationVerdict,
} from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { DuesService } from '../payments/dues.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VerificationRecordsService } from './verification-records.service.js';

const PERFORM = 'verification.perform';
const READ_VEHICLE = 'vehicle.read';
const READ_MEMBER = 'member.read';
const DECLARE = 'vehicle.declare';

const MEMBER_FIELDS: readonly VerificationField[] = [
  'member_name',
  'membership_number',
  'member_status',
];

/**
 * What every internal vehicle check may show, named one by one so a field
 * added to the catalogue later stays out until it is added here. Everything
 * here identifies a vehicle and a sticker, never a person. The vehicle link and
 * the member are added only within the officer's own read scope, and the
 * declaration status only for a holder of `vehicle.declare` over the vehicle
 * (VEH-28).
 */
const BASE_FIELDS: readonly VerificationField[] = [
  'plate_number',
  'vehicle_category',
  'sticker_status',
  'organizational_unit',
  'attached_at',
  'plate_matches_sticker',
  'onboarded_at',
  'identifier_scheme',
  'registered_plate',
  'sticker_plate',
  'make',
  'model',
  'color',
  'route_type',
];

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
 * The records and the verdict come from `VerificationRecordsService`, which
 * the external API (item 12) uses too.
 *
 * Not organisation-scoped. An officer checks whatever vehicle is in front of
 * them, so `verification.perform` anywhere is enough for the verdict and the
 * facts about the vehicle and sticker. The member, the link to the vehicle,
 * and dues follow the officer's ordinary read scope.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly records: VerificationRecordsService,
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

    const check = await this.records.vehicleCheck({
      criteria,
      presentedPlate,
      stickerCode: input.stickerCode ?? null,
    });

    // Requirement 26.1 — a code that failed its signature is a forgery
    // attempt, recorded as one, and the officer is told the code is not
    // valid. No record was consulted at all.
    if (!check.codeValid) {
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
        check.verdict,
        false,
        {},
        { vehicle: null, member: null },
        meta,
        now,
      );
    }

    const { vehicle, sticker, verdict } = check;

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
    const declarationVisible =
      vehiclePath !== null &&
      (await this.permissions.can(userId, DECLARE, vehiclePath));

    const [vehicleDues, memberDues] = await Promise.all([
      vehicle && vehicleReadable
        ? this.dues.vehicleDues(vehicle.id, now)
        : Promise.resolve(null),
      member && memberReadable
        ? this.dues.memberDues(member.id, now)
        : Promise.resolve(null),
    ]);

    const values: VerificationValues = {
      ...this.records.vehicleValues(check),
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
            ...(declarationVisible ? (['declaration_status'] as const) : []),
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
        scheme: check.scheme,
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
      declarationVisible,
      projectVerification(values, permitted, 'INTERNAL'),
      { vehicle: vehicleDues, member: memberDues },
      meta,
      now,
    );
  }

  /**
   * The audit event keeps the true reasons; the officer is told them only as
   * far as VEH-28 allows.
   */
  private respond(
    criteria: VerificationCriteria,
    verdict: VerificationVerdict,
    declarationVisible: boolean,
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
      reasons: discloseReasons(verdict.reasons, declarationVisible),
      statement: verdict.matched
        ? MATCH_STATEMENTS[criteria]
        : NO_MATCH_STATEMENT,
      limitation: VERIFICATION_LIMITATION,
      fields,
      dues,
    };
  }
}

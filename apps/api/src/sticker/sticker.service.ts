import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import type {
  AttachStickerInput,
  IssueStickerInput,
  OnboardingState,
} from '@nurtw/contracts';
import {
  ONBOARDING_FEE_TYPE_CODES,
  assertStickerTransition,
  checkAttachment,
  decodeAndVerifyQrPayload,
  describeLegacyBarcode,
  encodeQrPayload,
  generateIdentifier,
  type AttachmentRefusalReason,
  type LegacyBarcodeReading,
  type QrVerificationResult,
} from '@nurtw/domain';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { loadEnvironment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VehicleLetterService } from '../vehicle-letter/vehicle-letter.service.js';

const ISSUE = 'sticker.issue';
const ATTACH = 'sticker.attach';

const IDENTIFIER_ATTEMPTS = 5;

/** Statuses in which a sticker is on a vehicle (`isStickerAttached`). */
const ATTACHED_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

/**
 * What a sticker response carries. Selected explicitly, never the whole row:
 * `legacySecurityCode` is restricted (Requirement 9A.5) and
 * `registeredPlateNormalized` is the register itself, which only the internal
 * lookup reads out.
 */
const STICKER_RESPONSE = {
  id: true,
  stickerQrId: true,
  legacyBarcode: true,
  status: true,
  vehicleId: true,
  attachedAt: true,
  plateNumberAtIssue: true,
  issueDate: true,
  expiryDate: true,
  templateVersion: true,
  createdAt: true,
} satisfies Prisma.StickerSelect;

function hmacSign(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Sticker issuance and attachment (PRD §10, §26, §9A — items 08 and 17).
 *
 * `issue()` and `attach()` are deliberately separate acts, gated by
 * separate permissions (Requirement 9A.2 / `QUESTIONS.md` VEH-18) — minting
 * stock is not organisation-scoped (nothing is attached yet, so there is no
 * record to scope against, the same reasoning `MasterDataService` gives for
 * master data); attaching is scoped to the target vehicle's own path,
 * because it is a write against that specific record.
 *
 * `attach()` does not touch `Vehicle.status`. Promoting an `ON_RECORD`
 * vehicle to `ACTIVE` is `vehicle.declare`'s job (ARCHITECTURE.md Decision
 * 6.5) — a deliberately separate, separately-audited act that this service
 * has no permission to perform. Attaching is what onboards a vehicle.
 */
@Injectable()
export class StickerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly letters: VehicleLetterService,
  ) {}

  async issue(actorUserId: string, input: IssueStickerInput) {
    if (!(await this.permissions.canAnywhere(actorUserId, ISSUE))) {
      throw new ForbiddenException();
    }

    const stickerQrId = await this.allocateStickerQrId();
    const sticker = await this.prisma.sticker.create({
      data: {
        stickerQrId,
        status: 'ISSUED',
        templateVersion: input.templateVersion,
        signingKeyId: loadEnvironment().stickerSigningKeyId,
        issuedByUserId: actorUserId,
      },
      select: STICKER_RESPONSE,
    });

    await this.audit.record({
      action: 'sticker.issue',
      subjectType: 'sticker',
      subjectId: sticker.id,
      actorUserId,
      after: { stickerQrId: sticker.stickerQrId },
    });

    return sticker;
  }

  /**
   * Onboards a vehicle by attaching a sticker to it (Requirement 9A.2): a
   * Transpay barcode from the register, or a freshly issued signed sticker,
   * funded by a confirmed onboarding payment made for this vehicle.
   * Requirement 9A.4's conditions are checked by `@nurtw/domain`'s
   * `checkAttachment`; every refusal is audited with its specific reason, and
   * there is no override (VEH-16).
   *
   * The caller sees only the generic 409 (Requirement 14.3). The audit trail
   * holds the reason, and the onboarding screen checks the barcode and lists
   * only eligible payments first, so an officer rarely meets a refusal blind.
   */
  async attach(actorUserId: string, input: AttachStickerInput) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      include: {
        branch: { select: { path: true } },
        unit: { select: { path: true } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('No such vehicle.');
    }
    const path = vehicle.unit?.path ?? vehicle.branch?.path;
    if (!path) {
      throw new NotFoundException();
    }
    if (!(await this.permissions.can(actorUserId, ATTACH, path))) {
      throw new ForbiddenException();
    }
    // PRD Requirement 9A.2 (revision 1.3, VEH-26) — no route type, no
    // onboarding: the levy starts the month after onboarding and is priced by
    // route type, so it could not be charged. A legacy vehicle is given one
    // first, from its page.
    if (!vehicle.routeTypeId) {
      throw new ConflictException(
        'Give this vehicle a route type before attaching a sticker.',
      );
    }

    const refuse = async (
      reason: AttachmentRefusalReason,
      stickerId: string | null,
      extra: Record<string, string> = {},
    ): Promise<never> => {
      await this.audit.record({
        action: 'sticker.attach',
        subjectType: stickerId ? 'sticker' : 'vehicle',
        subjectId: stickerId ?? vehicle.id,
        actorUserId,
        reason,
        after: { outcome: 'REFUSED', vehicleId: vehicle.id, ...extra },
      });
      throw new ConflictException(
        `Attachment refused: ${reason.toLowerCase().replaceAll('_', ' ')}.`,
      );
    };

    const sticker = input.legacyBarcode
      ? await this.prisma.sticker.findUnique({
          where: { legacyBarcode: input.legacyBarcode },
        })
      : input.stickerQrId
        ? await this.prisma.sticker.findUnique({
            where: { stickerQrId: input.stickerQrId },
          })
        : await this.prisma.sticker.findUnique({
            where: { id: input.stickerId },
          });
    if (!sticker) {
      if (input.legacyBarcode) {
        // Requirement 9A.4(1) — a barcode off the register is recorded as
        // unknown, never as a forgery: NURTW holds printed Transpay stickers
        // with no digital record (VEH-15). The presented value is kept so the
        // Union can see how often that stock turns up.
        return refuse('UNKNOWN_BARCODE', null, {
          presentedBarcode: input.legacyBarcode,
        });
      }
      throw new NotFoundException('No such sticker.');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { feeType: { select: { code: true } } },
    });
    if (!payment || payment.status !== 'CONFIRMED') {
      return refuse('PAYMENT_NOT_CONFIRMED', sticker.id);
    }

    // One attached sticker per vehicle (the partial unique index backs this
    // against races). Replacing one is `sticker.replace`, not onboarding.
    const current = await this.prisma.sticker.findFirst({
      where: { vehicleId: vehicle.id, status: { in: [...ATTACHED_STATUSES] } },
      select: { id: true },
    });
    if (current && current.id !== sticker.id) {
      return refuse('VEHICLE_ALREADY_HAS_STICKER', sticker.id);
    }

    const paymentAlreadyUsed = await this.prisma.sticker.findUnique({
      where: { attachmentPaymentId: payment.id },
      select: { id: true },
    });

    const check = checkAttachment({
      isLegacyBarcode: sticker.legacyBarcode !== null,
      registeredPlateNormalized: sticker.registeredPlateNormalized,
      targetPlateNormalized: vehicle.plateNumberNormalized,
      previouslyAttachedAt: sticker.attachedAt,
      paymentReferenceAlreadyUsed: paymentAlreadyUsed !== null,
      paymentFeeTypeCode: payment.feeType.code,
      paymentSubject: { type: payment.subjectType, id: payment.subjectId },
      targetVehicleId: vehicle.id,
    });
    if (!check.allowed) {
      return refuse(check.reason, sticker.id);
    }

    assertStickerTransition(sticker.status, 'ACTIVE');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // `attachedAt: null` in the filter makes the one-shot rule hold under
        // a race: of two concurrent attachments of one sticker, one updates
        // nothing and is refused.
        const { count } = await tx.sticker.updateMany({
          where: { id: sticker.id, attachedAt: null },
          data: {
            vehicleId: vehicle.id,
            plateNumberAtIssue: vehicle.plateNumberNormalized,
            attachedAt: new Date(),
            attachedByUserId: actorUserId,
            attachmentPaymentId: payment.id,
            status: 'ACTIVE',
          },
        });
        if (count === 0) {
          throw new ConflictException('Attachment refused: already attached.');
        }
        await this.audit.record(
          {
            action: 'sticker.attach',
            subjectType: 'sticker',
            subjectId: sticker.id,
            actorUserId,
            after: {
              outcome: 'ATTACHED',
              vehicleId: vehicle.id,
              paymentId: payment.id,
              kind: sticker.legacyBarcode ? 'LEGACY' : 'SIGNED',
            },
          },
          tx,
        );
        // Requirement 9A.6 — onboarding produces the vehicle letter, in this
        // same transaction: no attachment without its letter, no letter
        // without its attachment.
        await this.letters.issueInTransaction(tx, {
          vehicleId: vehicle.id,
          stickerId: sticker.id,
          stickerNumber: sticker.legacyBarcode ?? sticker.stickerQrId,
          actorUserId,
        });
        return tx.sticker.findUniqueOrThrow({
          where: { id: sticker.id },
          select: STICKER_RESPONSE,
        });
      });
    } catch (error) {
      // The partial unique index on attached stickers per vehicle, or the
      // unique payment reference, lost a race the checks above could not see.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Attachment refused: conflicting attachment.');
      }
      throw error;
    }
  }

  /**
   * What the onboarding screen needs for one vehicle (item 17). Needs
   * `sticker.attach` over the vehicle; anything else answers 404, identical
   * to a vehicle that does not exist.
   */
  async onboardingState(
    actorUserId: string,
    vehicleId: string,
  ): Promise<OnboardingState> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        plateNumberNormalized: true,
        routeTypeId: true,
        branch: { select: { path: true } },
        unit: { select: { path: true } },
      },
    });
    const path = vehicle?.unit?.path ?? vehicle?.branch?.path;
    if (
      !vehicle ||
      !path ||
      !(await this.permissions.can(actorUserId, ATTACH, path))
    ) {
      throw new NotFoundException();
    }

    const [attached, registerEntries, payments] = await Promise.all([
      this.prisma.sticker.findFirst({
        where: { vehicleId: vehicle.id, attachedAt: { not: null } },
        orderBy: { attachedAt: 'desc' },
        select: {
          legacyBarcode: true,
          stickerQrId: true,
          attachedAt: true,
          status: true,
          attachedByUser: { select: { fullName: true } },
          letters: {
            orderBy: { issuedAt: 'desc' },
            take: 1,
            select: { letterReference: true },
          },
        },
      }),
      this.prisma.sticker.count({
        where: {
          registeredPlateNormalized: vehicle.plateNumberNormalized,
          legacyBarcode: { not: null },
          attachedAt: null,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          subjectType: 'vehicle',
          subjectId: vehicle.id,
          status: 'CONFIRMED',
          feeType: { code: { in: Object.values(ONBOARDING_FEE_TYPE_CODES) } },
          fundsAttachment: { is: null },
        },
        orderBy: { confirmedAt: 'desc' },
        select: {
          id: true,
          paystackReference: true,
          totalChargedKobo: true,
          confirmedAt: true,
          feeType: { select: { code: true, label: true } },
        },
      }),
    ]);

    return {
      vehicleId: vehicle.id,
      hasRouteType: vehicle.routeTypeId !== null,
      attachment:
        attached && attached.attachedAt
          ? {
              kind: attached.legacyBarcode ? 'LEGACY' : 'SIGNED',
              stickerNumber: attached.legacyBarcode ?? attached.stickerQrId,
              attachedAt: attached.attachedAt.toISOString(),
              attachedBy: attached.attachedByUser?.fullName ?? null,
              stickerStatus: attached.status,
              letterReference: attached.letters[0]?.letterReference ?? null,
            }
          : null,
      registerHoldsBarcodeForPlate: registerEntries > 0,
      eligiblePayments: payments.map((payment) => ({
        id: payment.id,
        feeTypeCode: payment.feeType.code,
        feeTypeLabel: payment.feeType.label,
        totalChargedKobo: payment.totalChargedKobo,
        paystackReference: payment.paystackReference,
        confirmedAt: payment.confirmedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * The internal reading of a scanned Transpay barcode (Requirement 11.2).
   * Read-only apart from its audit event: a lookup never attaches, activates,
   * or changes anything (PRD §9.5–9.6). Not organisation-scoped — an officer
   * at a checkpoint checks whatever vehicle is in front of them, and the
   * reading carries a plate, not a member or an owner.
   *
   * An unknown barcode answers the generic 404. Internal callers could be
   * told more, but the answer "not on the register" is exactly what item 12's
   * external endpoint must never give, and one shape for both keeps them from
   * drifting apart.
   */
  async lookupLegacyBarcode(
    actorUserId: string,
    barcode: string,
    meta: { ipAddress?: string; requestId?: string } = {},
  ): Promise<LegacyBarcodeReading> {
    const entry = await this.prisma.sticker.findUnique({
      where: { legacyBarcode: barcode },
      select: {
        id: true,
        registeredPlateNormalized: true,
        attachedAt: true,
        plateNumberAtIssue: true,
        vehicleId: true,
        status: true,
      },
    });
    const reading = describeLegacyBarcode(entry);

    await this.audit.record({
      action: 'verification.legacy_barcode',
      subjectType: 'sticker',
      subjectId: reading ? entry!.id : null,
      actorUserId,
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      after: reading
        ? { outcome: reading.result }
        : { outcome: 'NOT_FOUND', presentedBarcode: barcode },
    });

    if (!reading) {
      throw new NotFoundException();
    }
    return reading;
  }

  /**
   * Whether this deployment holds the signing secret. Without it every signed
   * code fails its signature, so a verifier asks first rather than recording
   * genuine stickers as forgeries (item 10).
   */
  canVerifySignatures(): boolean {
    return loadEnvironment().stickerSigningSecret !== undefined;
  }

  /**
   * Verifies a scanned QR payload. Requirement 26.1/Decision 6.2.1 — an
   * invalid signature is refused before any database access.
   */
  verifyQrSignature(rawPayload: string): QrVerificationResult {
    const env = loadEnvironment();
    return decodeAndVerifyQrPayload(
      rawPayload,
      (keyId) =>
        keyId === env.stickerSigningKeyId ? env.stickerSigningSecret : undefined,
      hmacSign,
      (a, b) => {
        const bufferA = Buffer.from(a, 'hex');
        const bufferB = Buffer.from(b, 'hex');
        return (
          bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
        );
      },
    );
  }

  private async allocateStickerQrId(): Promise<string> {
    for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt++) {
      const candidate = generateIdentifier(() => randomInt(256));
      const clash = await this.prisma.sticker.findUnique({
        where: { stickerQrId: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new ConflictException('Could not allocate a sticker identifier.');
  }

  /** Mints the signed payload for a newly issued sticker's printed QR code. */
  mintQrPayload(stickerQrId: string): string {
    const env = loadEnvironment();
    if (!env.stickerSigningSecret) {
      throw new Error(
        'STICKER_SIGNING_SECRET is not configured. Stickers cannot be minted.',
      );
    }
    return encodeQrPayload(
      { stickerQrId, keyId: env.stickerSigningKeyId },
      env.stickerSigningSecret,
      hmacSign,
    );
  }
}

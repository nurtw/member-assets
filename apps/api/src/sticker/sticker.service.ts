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
  StickerReading,
  StickerStockAddition,
  StickerStockEntry,
  StickerStockList,
} from '@nurtw/contracts';
import {
  ONBOARDING_FEE_TYPE_CODES,
  assertStickerTransition,
  checkAttachment,
  decodeAndVerifyQrPayload,
  describeLegacyBarcode,
  encodeQrPayload,
  generateIdentifier,
  requiredOnboardingFeeType,
  stickerOrigin,
  stickerStockStanding,
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
const STOCK = 'sticker.stock_intake';

const IDENTIFIER_ATTEMPTS = 5;

/** The label a legacy sticker carries, whether imported or taken into stock. */
const LEGACY_TEMPLATE_VERSION = 'legacy-barcode';

/** How many stock entries the stock screen is given at once, newest first. */
const STOCK_LIST_LIMIT = 200;

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

/** What the stock screen shows of a sticker taken into stock. */
const STOCK_ENTRY = {
  id: true,
  legacyBarcode: true,
  status: true,
  attachedAt: true,
  plateNumberAtIssue: true,
  stockAddedAt: true,
  stockAddedByUser: { select: { fullName: true } },
} satisfies Prisma.StickerSelect;

type StockEntryRow = Prisma.StickerGetPayload<{ select: typeof STOCK_ENTRY }>;

function toStockEntry(row: StockEntryRow): StickerStockEntry {
  return {
    id: row.id,
    stickerNumber: row.legacyBarcode ?? '',
    standing: stickerStockStanding(row),
    addedAt: (row.stockAddedAt ?? new Date(0)).toISOString(),
    addedBy: row.stockAddedByUser?.fullName ?? null,
    attachedPlate: row.attachedAt ? row.plateNumberAtIssue : null,
    attachedAt: row.attachedAt?.toISOString() ?? null,
  };
}

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
   * legacy barcode from the register, or a freshly issued signed sticker,
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
        // unknown, never as a forgery: NURTW holds printed legacy stickers
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
      inStock: sticker.stockAddedAt !== null,
      stickerStatus: sticker.status,
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
              origin: stickerOrigin({
                isLegacyBarcode: sticker.legacyBarcode !== null,
                registeredPlateNormalized: sticker.registeredPlateNormalized,
                inStock: sticker.stockAddedAt !== null,
              }),
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

    const [attached, registerEntries, stockEntry, payments] = await Promise.all([
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
          status: 'ISSUED',
        },
      }),
      // Whether stock can give a sticker at all: never how many, or which.
      this.prisma.sticker.findFirst({
        where: {
          stockAddedAt: { not: null },
          attachedAt: null,
          status: 'ISSUED',
        },
        select: { id: true },
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
      stockHasStickers: stockEntry !== null,
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
   * The internal reading of a scanned legacy barcode (Requirement 11.2).
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
        stockAddedAt: true,
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
   * What a scanned sticker can be for one vehicle, asked before attaching it
   * (Requirement 9A.7, revision 1.12). An attachment that is refused answers
   * a generic 409; this tells the officer about to attach which sticker they
   * are holding, so a refusal is rarely met blind.
   *
   * It needs `sticker.attach` over the vehicle, like the attachment itself,
   * and says no more than that officer needs: a barcode recorded for another
   * plate is said to be so, and that plate is not named. Read-only apart from
   * its audit event.
   */
  async readForVehicle(
    actorUserId: string,
    vehicleId: string,
    barcode: string,
    meta: { ipAddress?: string; requestId?: string } = {},
  ): Promise<StickerReading> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        plateNumberNormalized: true,
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

    const sticker = await this.prisma.sticker.findUnique({
      where: { legacyBarcode: barcode },
      select: {
        id: true,
        legacyBarcode: true,
        registeredPlateNormalized: true,
        stockAddedAt: true,
        attachedAt: true,
        status: true,
      },
    });
    const origin = sticker
      ? stickerOrigin({
          isLegacyBarcode: true,
          registeredPlateNormalized: sticker.registeredPlateNormalized,
          inStock: sticker.stockAddedAt !== null,
        })
      : null;

    let reading: StickerReading;
    if (!sticker || origin === null) {
      reading = { result: 'NOT_HELD' };
    } else if (sticker.attachedAt !== null) {
      reading = { result: 'ALREADY_ATTACHED' };
    } else if (sticker.status !== 'ISSUED') {
      reading = { result: 'NOT_AVAILABLE' };
    } else if (
      origin === 'REGISTER' &&
      sticker.registeredPlateNormalized !== vehicle.plateNumberNormalized
    ) {
      reading = { result: 'FOR_ANOTHER_VEHICLE' };
    } else {
      reading = {
        result: 'CAN_ATTACH',
        stickerNumber: sticker.legacyBarcode ?? barcode,
        feeTypeCode: requiredOnboardingFeeType(origin),
      };
    }

    await this.audit.record({
      action: 'sticker.attach_reading',
      subjectType: sticker ? 'sticker' : 'vehicle',
      subjectId: sticker?.id ?? vehicle.id,
      actorUserId,
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      after: {
        outcome: reading.result,
        vehicleId: vehicle.id,
        ...(sticker ? {} : { presentedBarcode: barcode }),
      },
    });
    return reading;
  }

  /**
   * Takes a printed legacy sticker into stock (Requirement 9A.8, VEH-29).
   *
   * A legacy barcode is a number with no proof of authenticity (PRD §26.4),
   * so nothing here can tell a genuine sticker from a made-up number. The
   * control is who may do this: `sticker.stock_intake` is in no role, and
   * every addition is audited with the officer who made it. Not
   * organisation-scoped, for the reason `issue` is not: nothing is attached
   * yet.
   *
   * A barcode already held is not added twice, and is not an error: the
   * answer says where it stands.
   */
  async addToStock(
    actorUserId: string,
    barcode: string,
    meta: { ipAddress?: string; requestId?: string } = {},
  ): Promise<StickerStockAddition> {
    if (!(await this.permissions.canAnywhere(actorUserId, STOCK))) {
      throw new ForbiddenException();
    }

    const held = await this.heldBarcode(barcode);
    if (held) {
      return this.alreadyHeld(actorUserId, held, meta);
    }

    const stickerQrId = await this.allocateStickerQrId();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const sticker = await tx.sticker.create({
          data: {
            stickerQrId,
            legacyBarcode: barcode,
            // Printed long ago and not yet on a vehicle, as an imported one
            // is. `ISSUED -> ACTIVE` is attachment.
            status: 'ISSUED',
            templateVersion: LEGACY_TEMPLATE_VERSION,
            stockAddedAt: new Date(),
            stockAddedByUserId: actorUserId,
          },
          select: STOCK_ENTRY,
        });
        await this.audit.record(
          {
            action: 'sticker.stock_add',
            subjectType: 'sticker',
            subjectId: sticker.id,
            actorUserId,
            ipAddress: meta.ipAddress,
            requestId: meta.requestId,
            after: { outcome: 'ADDED', legacyBarcode: barcode },
          },
          tx,
        );
        return sticker;
      });
      return { outcome: 'ADDED', sticker: toStockEntry(created) };
    } catch (error) {
      // Two officers scanned the same sticker at once: one of them added it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const landed = await this.heldBarcode(barcode);
        if (landed) {
          return this.alreadyHeld(actorUserId, landed, meta);
        }
      }
      throw error;
    }
  }

  /** The stock: how it stands in total, and its latest entries. */
  async listStock(actorUserId: string): Promise<StickerStockList> {
    if (!(await this.permissions.canAnywhere(actorUserId, STOCK))) {
      throw new ForbiddenException();
    }
    const stock = { stockAddedAt: { not: null } } as const;
    const [inStock, attached, withdrawn, rows] = await Promise.all([
      this.prisma.sticker.count({
        where: { ...stock, attachedAt: null, status: 'ISSUED' },
      }),
      this.prisma.sticker.count({
        where: { ...stock, attachedAt: { not: null } },
      }),
      this.prisma.sticker.count({
        where: { ...stock, attachedAt: null, status: { not: 'ISSUED' } },
      }),
      this.prisma.sticker.findMany({
        where: stock,
        orderBy: { stockAddedAt: 'desc' },
        take: STOCK_LIST_LIMIT + 1,
        select: STOCK_ENTRY,
      }),
    ]);
    return {
      counts: { inStock, attached, withdrawn },
      stickers: rows.slice(0, STOCK_LIST_LIMIT).map(toStockEntry),
      truncated: rows.length > STOCK_LIST_LIMIT,
    };
  }

  /**
   * Takes a sticker out of stock before it is attached: lost, damaged, or
   * scanned in by mistake. Final, and never a deletion (CLAUDE.md rule 5):
   * the row stays, cancelled, so the barcode cannot be added again and can
   * never be attached. One conditional statement, so a withdrawal and an
   * attachment racing for the same sticker cannot both win.
   */
  async withdrawFromStock(
    actorUserId: string,
    stickerId: string,
    reason: string,
    meta: { ipAddress?: string; requestId?: string } = {},
  ): Promise<StickerStockEntry> {
    if (!(await this.permissions.canAnywhere(actorUserId, STOCK))) {
      throw new ForbiddenException();
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.sticker.updateMany({
        where: {
          id: stickerId,
          stockAddedAt: { not: null },
          attachedAt: null,
          status: 'ISSUED',
        },
        data: { status: 'CANCELLED' },
      });
      const sticker = await tx.sticker.findFirst({
        where: { id: stickerId, stockAddedAt: { not: null } },
        select: STOCK_ENTRY,
      });
      if (!sticker) {
        throw new NotFoundException();
      }
      if (count === 0) {
        throw new ConflictException(
          'This sticker is attached or already withdrawn.',
        );
      }
      await this.audit.record(
        {
          action: 'sticker.stock_withdraw',
          subjectType: 'sticker',
          subjectId: sticker.id,
          actorUserId,
          reason,
          ipAddress: meta.ipAddress,
          requestId: meta.requestId,
          before: { status: 'ISSUED' },
          after: { status: 'CANCELLED' },
        },
        tx,
      );
      return toStockEntry(sticker);
    });
  }

  private heldBarcode(barcode: string) {
    return this.prisma.sticker.findUnique({
      where: { legacyBarcode: barcode },
      select: { ...STOCK_ENTRY, registeredPlateNormalized: true },
    });
  }

  private async alreadyHeld(
    actorUserId: string,
    held: StockEntryRow & { registeredPlateNormalized: string | null },
    meta: { ipAddress?: string; requestId?: string },
  ): Promise<StickerStockAddition> {
    const inStock = held.stockAddedAt !== null;
    const standing = stickerStockStanding(held);
    // A register barcode not yet attached is on the register, and so held.
    const where =
      !inStock && standing === 'IN_STOCK' ? 'ON_REGISTER' : standing;
    await this.audit.record({
      action: 'sticker.stock_add',
      subjectType: 'sticker',
      subjectId: held.id,
      actorUserId,
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      after: { outcome: 'ALREADY_HELD', held: where },
    });
    return {
      outcome: 'ALREADY_HELD',
      held: where,
      sticker: inStock ? toStockEntry(held) : null,
    };
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

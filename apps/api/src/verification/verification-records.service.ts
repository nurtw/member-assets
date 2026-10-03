import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  LIVE_CARD_STATUSES,
  decideMembershipVerification,
  decideVerification,
  parseIdentifier,
  stickerCodeScheme,
  type DeclarationStatus,
  type MembershipLookup,
  type MembershipVerdict,
  type VerificationCriteria,
  type VerificationValues,
  type VerificationVerdict,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { StickerService } from '../sticker/sticker.service.js';

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

/**
 * What a membership check reads of a card. Never the printed address, photo,
 * or signatures: acceptance criterion 12 holds because they are not selected.
 */
const CARD_SELECT = {
  id: true,
  cardNumber: true,
  status: true,
  expiryDate: true,
  memberId: true,
} satisfies Prisma.CardSelect;

/** What a membership check reads of a member. No contact, kin, or guarantor. */
const MEMBER_SELECT = {
  id: true,
  firstName: true,
  surname: true,
  membershipNumber: true,
  status: true,
  designation: { select: { label: true } },
  organisation: { select: { name: true, path: true } },
} satisfies Prisma.MemberSelect;

export type VehicleRow = Prisma.VehicleGetPayload<{
  select: typeof VEHICLE_SELECT;
}>;
export type StickerRow = Prisma.StickerGetPayload<{
  select: typeof STICKER_SELECT;
}>;
export type CardRow = Prisma.CardGetPayload<{ select: typeof CARD_SELECT }>;
export type MemberRow = Prisma.MemberGetPayload<{
  select: typeof MEMBER_SELECT;
}>;

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

export interface VehicleCheckRequest {
  criteria: VerificationCriteria;
  /** Normalised. Present for a plate or a combined check. */
  presentedPlate: string | null;
  /** As presented. Present for a sticker or a combined check. */
  stickerCode: string | null;
}

/** What a vehicle check found, and the verdict on it. */
export interface VehicleCheck extends VehicleCheckRequest {
  /** The scheme of the presented code; `null` for a plate check. */
  scheme: 'SIGNED' | 'LEGACY' | null;
  /** False when a signed code failed its signature. Then nothing was looked up. */
  codeValid: boolean;
  /** The presented sticker, for a sticker or a combined check. */
  sticker: StickerRow | null;
  /**
   * The plate's own record for a plate check; otherwise the vehicle the
   * sticker is attached to. A presented plate is compared with that vehicle,
   * never looked up beside it.
   */
  vehicle: VehicleRow | null;
  /** When a sticker was first attached: onboarded (Decision 6.5). */
  firstAttachedAt: Date | null;
  /**
   * The sticker a result describes: the vehicle's latest attached sticker for
   * a plate check, otherwise the presented one.
   */
  currentSticker: StickerRow | null;
  verdict: VerificationVerdict;
}

/** What a membership check found, and the verdict on it. */
export interface MembershipCheck {
  /** The number in its stored form. */
  number: string;
  foundAs: MembershipLookup | null;
  /** The presented card, for a card number. */
  card: CardRow | null;
  member: MemberRow | null;
  /**
   * The card a result describes: the presented one, or for a membership
   * number the member's current card.
   */
  shownCard: CardRow | null;
  verdict: MembershipVerdict;
}

/** Every catalogue field `null`, for a check to fill in what it found. */
function emptyValues(): VerificationValues {
  return {
    plate_number: null,
    vehicle_category: null,
    sticker_status: null,
    organizational_unit: null,
    attached_at: null,
    plate_matches_sticker: null,
    membership_status: null,
    card_status: null,
    designation: null,
    declaration_status: null,
    onboarded_at: null,
    identifier_scheme: null,
    registered_plate: null,
    sticker_plate: null,
    make: null,
    model: null,
    color: null,
    route_type: null,
    vehicle_id: null,
    member_name: null,
    membership_number: null,
    member_status: null,
    card_number: null,
    card_expiry_date: null,
  };
}

/**
 * The records behind a verification, for every channel (items 10, 12, 24).
 *
 * The internal checks and the external API look up the same rows, decide with
 * the same rule (`decideVerification`, `decideMembershipVerification`), and
 * fill the projection's values the same way. Only what each channel is then
 * permitted to see differs. So an outside organisation is never told "found"
 * where an officer would be told "not verified", or the reverse.
 *
 * **Read-only.** Nothing here writes; `verification-read-only.spec.ts` fails
 * if anything in this module tries. The callers write their audit events.
 */
@Injectable()
export class VerificationRecordsService {
  private readonly logger = new Logger(VerificationRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stickers: StickerService,
  ) {}

  /**
   * A plate, a sticker code, or both.
   *
   * Requirement 26.1 — a signed code is checked before anything is looked up.
   * A failure comes back with `codeValid: false` and nothing found, for the
   * caller to record as a forgery attempt. Without the signing secret a signed
   * code cannot be checked at all, and that is a 503, never a forgery.
   */
  async vehicleCheck(request: VehicleCheckRequest): Promise<VehicleCheck> {
    const { criteria, presentedPlate, stickerCode } = request;
    const scheme = stickerCode ? stickerCodeScheme(stickerCode) : null;

    let signedStickerQrId: string | null = null;
    if (stickerCode && scheme === 'SIGNED') {
      if (!this.stickers.canVerifySignatures()) {
        this.logger.warn(
          'A signed sticker was presented, but STICKER_SIGNING_SECRET is not set.',
        );
        throw new ServiceUnavailableException(
          'Signed stickers cannot be verified: the signing secret is not configured.',
        );
      }
      const signature = this.stickers.verifyQrSignature(stickerCode);
      if (!signature.valid) {
        return {
          ...request,
          scheme,
          codeValid: false,
          sticker: null,
          vehicle: null,
          firstAttachedAt: null,
          currentSticker: null,
          verdict:
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
        };
      }
      signedStickerQrId = signature.stickerQrId;
    }

    const sticker = signedStickerQrId
      ? await this.findSignedSticker(signedStickerQrId)
      : stickerCode
        ? await this.findRegisteredBarcode(stickerCode)
        : null;

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

    return {
      ...request,
      scheme,
      codeValid: true,
      sticker,
      vehicle,
      firstAttachedAt,
      currentSticker,
      verdict,
    };
  }

  /**
   * The value of every vehicle and sticker field for what a check found. The
   * person and membership fields are left `null`: a channel that may show a
   * member fills them in itself, within its own permissions.
   */
  vehicleValues(check: VehicleCheck): VerificationValues {
    const { criteria, presentedPlate, sticker, vehicle, currentSticker } =
      check;

    // The plate the sticker answers for: its vehicle's, once attached, or the
    // register's for a Transpay barcode not yet attached.
    const stickerPlate =
      sticker?.attachedAt && vehicle
        ? vehicle.plateNumberNormalized
        : (sticker?.registeredPlateNormalized ?? null);

    return {
      ...emptyValues(),
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
      onboarded_at: check.firstAttachedAt?.toISOString() ?? null,
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
    };
  }

  /**
   * A card number or a membership number, as presented. The two share one
   * format, so a number is tried as a card first: a card says more than a
   * membership does. The caller's schema has already checked the check
   * character; this only puts the number in its stored form.
   */
  async membershipCheck(
    presented: string,
    now: Date,
  ): Promise<MembershipCheck> {
    const number = parseIdentifier(presented);

    const card = await this.prisma.card.findUnique({
      where: { cardNumber: number },
      select: CARD_SELECT,
    });
    const member = card
      ? await this.prisma.member.findUnique({
          where: { id: card.memberId },
          select: MEMBER_SELECT,
        })
      : await this.prisma.member.findUnique({
          where: { membershipNumber: number },
          select: MEMBER_SELECT,
        });
    const foundAs = card ? 'CARD_NUMBER' : member ? 'MEMBERSHIP_NUMBER' : null;

    // For a membership number, the card shown is the member's current one.
    const shownCard =
      card ??
      (member
        ? await this.prisma.card.findFirst({
            where: {
              memberId: member.id,
              status: { in: [...LIVE_CARD_STATUSES] },
            },
            orderBy: { issueDate: 'desc' },
            select: CARD_SELECT,
          })
        : null);

    const verdict = decideMembershipVerification({
      foundAs,
      member: member ? { status: member.status } : null,
      card: card ? { status: card.status, expiryDate: card.expiryDate } : null,
      now,
    });

    return { number, foundAs, card, member, shownCard, verdict };
  }

  /** The value of every membership field for what a check found. */
  membershipValues(check: MembershipCheck): VerificationValues {
    const { member, shownCard } = check;
    return {
      ...emptyValues(),
      member_name: member ? `${member.firstName} ${member.surname}` : null,
      membership_number: member?.membershipNumber ?? null,
      membership_status: member?.status ?? null,
      card_number: shownCard?.cardNumber ?? null,
      card_status: shownCard?.status ?? null,
      card_expiry_date: shownCard?.expiryDate?.toISOString() ?? null,
      designation: member?.designation?.label ?? null,
      organizational_unit: member?.organisation.name ?? null,
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

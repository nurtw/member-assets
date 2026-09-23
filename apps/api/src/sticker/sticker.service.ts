import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import type { AttachStickerInput, IssueStickerInput } from '@nurtw/contracts';
import {
  assertStickerTransition,
  checkAttachment,
  decodeAndVerifyQrPayload,
  encodeQrPayload,
  generateIdentifier,
  type QrVerificationResult,
} from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { loadEnvironment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ISSUE = 'sticker.issue';
const ATTACH = 'sticker.attach';

const IDENTIFIER_ATTEMPTS = 5;

function hmacSign(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Sticker issuance and attachment (PRD §10, §26, §9A — item 08).
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
 * has no permission to perform.
 */
@Injectable()
export class StickerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
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
   * Attaches a sticker — freshly issued or a legacy barcode — to a vehicle,
   * funded by a confirmed payment. Requirement 9A.4's four conditions are
   * checked by `@nurtw/domain`'s `checkAttachment`; every refusal is
   * audited with its specific reason, and there is no override (VEH-16).
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

    const sticker = input.legacyBarcode
      ? await this.prisma.sticker.findUnique({
          where: { legacyBarcode: input.legacyBarcode },
        })
      : await this.prisma.sticker.findUnique({
          where: { id: input.stickerId },
        });
    if (!sticker) {
      throw new NotFoundException('No such sticker.');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
    });
    if (!payment || payment.status !== 'CONFIRMED') {
      throw new ConflictException(
        'No confirmed payment matches this reference.',
      );
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
    });

    if (!check.allowed) {
      await this.audit.record({
        action: 'sticker.attach',
        subjectType: 'sticker',
        subjectId: sticker.id,
        organisationId: null,
        actorUserId,
        reason: check.reason,
        after: { outcome: 'REFUSED', vehicleId: vehicle.id },
      });
      throw new ConflictException(
        `Attachment refused: ${check.reason.toLowerCase().replaceAll('_', ' ')}.`,
      );
    }

    assertStickerTransition(sticker.status, 'ACTIVE');

    const updated = await this.prisma.$transaction(async (tx) => {
      const attached = await tx.sticker.update({
        where: { id: sticker.id },
        data: {
          vehicleId: vehicle.id,
          plateNumberAtIssue: vehicle.plateNumberNormalized,
          attachedAt: new Date(),
          attachmentPaymentId: payment.id,
          status: 'ACTIVE',
        },
      });
      await this.audit.record(
        {
          action: 'sticker.attach',
          subjectType: 'sticker',
          subjectId: attached.id,
          actorUserId,
          after: { outcome: 'ATTACHED', vehicleId: vehicle.id },
        },
        tx,
      );
      return attached;
    });

    return updated;
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

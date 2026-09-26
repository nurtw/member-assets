import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateIdentifier } from '@nurtw/domain';
import type { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import {
  RENDERABLE_IMAGE_TYPES,
  type EmbeddableImage,
} from '../card/templates/template.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CURRENT_LETTER_TEMPLATE_VERSION,
  letterTemplateFor,
} from './templates/registry.js';
import type { LetterSignatory } from './templates/template.js';

const READ = 'vehicle.read';
const IDENTIFIER_ATTEMPTS = 5;

const SIGNATURE_SELECT = {
  select: { officerName: true, officerTitle: true, mediaAssetId: true },
} as const;

/**
 * The vehicle letter (PRD Requirement 9A.6, `QUESTIONS.md` VEH-19 — item 18).
 *
 * `issueInTransaction` is called by `StickerService.attach` inside the
 * attachment's own transaction: a letter exists exactly when an onboarding
 * does, and an attachment that rolls back leaves no letter behind.
 *
 * Only the snapshot is written then. The PDF is rendered at download, from the
 * snapshot, through the template version the letter recorded — so a rendering
 * problem can never undo an onboarding, and a letter downloaded a year later is
 * the letter issued.
 */
@Injectable()
export class VehicleLetterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async issueInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      vehicleId: string;
      stickerId: string;
      stickerNumber: string;
      actorUserId: string;
    },
  ): Promise<{ letterReference: string }> {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
      select: {
        plateNumberDisplay: true,
        make: true,
        model: true,
        color: true,
        vehicleCategory: { select: { label: true } },
        unit: { select: { name: true } },
        branch: { select: { name: true } },
        declaredByMember: {
          select: {
            firstName: true,
            middleName: true,
            surname: true,
            membershipNumber: true,
          },
        },
      },
    });

    // CARD-07: the signatures active now are the ones this letter carries,
    // for good. None registered yet means blank lines, not a later backfill.
    const signatures = await tx.officerSignature.findMany({
      where: { isActive: true },
      select: { id: true, position: true },
    });

    const member = vehicle.declaredByMember;
    const letterReference = await this.allocateReference(tx);

    const letter = await tx.vehicleLetter.create({
      data: {
        vehicleId: input.vehicleId,
        stickerId: input.stickerId,
        letterReference,
        templateVersion: CURRENT_LETTER_TEMPLATE_VERSION,
        issuedByUserId: input.actorUserId,
        printedPlate: vehicle.plateNumberDisplay,
        printedCategory: vehicle.vehicleCategory?.label ?? null,
        printedMake: vehicle.make,
        printedModel: vehicle.model,
        printedColour: vehicle.color,
        printedStickerNumber: input.stickerNumber,
        printedMemberName: member
          ? [member.firstName, member.middleName, member.surname]
              .filter((part) => part && part.trim().length > 0)
              .join(' ')
          : null,
        // A pending applicant has no number yet (VEH-24); it prints as not
        // recorded rather than as a number that does not exist.
        printedMembershipNumber: member?.membershipNumber ?? null,
        printedUnit: vehicle.unit?.name ?? null,
        printedBranch: vehicle.branch?.name ?? null,
        presidentSignatureId:
          signatures.find((s) => s.position === 'PRESIDENT')?.id ?? null,
        generalSecretarySignatureId:
          signatures.find((s) => s.position === 'GENERAL_SECRETARY')?.id ?? null,
      },
      select: { id: true },
    });

    await this.audit.record(
      {
        action: 'vehicle_letter.issue',
        subjectType: 'vehicle_letter',
        subjectId: letter.id,
        actorUserId: input.actorUserId,
        after: {
          vehicleId: input.vehicleId,
          stickerId: input.stickerId,
          letterReference,
          templateVersion: CURRENT_LETTER_TEMPLATE_VERSION,
        },
      },
      tx,
    );

    return { letterReference };
  }

  /**
   * The vehicle's latest letter as a PDF. `vehicle.read` over the vehicle; a
   * vehicle outside the caller's scope, or with no letter, answers 404 alike.
   * Audited as an export (CLAUDE.md rule 6).
   */
  async render(
    userId: string,
    vehicleId: string,
    meta: { ipAddress?: string; requestId?: string } = {},
  ): Promise<{ bytes: Uint8Array; filename: string }> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        branch: { select: { path: true } },
        unit: { select: { path: true } },
      },
    });
    const path = vehicle?.unit?.path ?? vehicle?.branch?.path;
    if (!path || !(await this.permissions.can(userId, READ, path))) {
      throw new NotFoundException();
    }

    const letter = await this.prisma.vehicleLetter.findFirst({
      where: { vehicleId },
      orderBy: { issuedAt: 'desc' },
      include: {
        presidentSignature: SIGNATURE_SELECT,
        generalSecretarySignature: SIGNATURE_SELECT,
      },
    });
    if (!letter) {
      throw new NotFoundException();
    }

    const bytes = await letterTemplateFor(letter.templateVersion).render({
      letterReference: letter.letterReference,
      issuedAt: letter.issuedAt,
      plate: letter.printedPlate,
      category: letter.printedCategory,
      make: letter.printedMake,
      model: letter.printedModel,
      colour: letter.printedColour,
      stickerNumber: letter.printedStickerNumber,
      memberName: letter.printedMemberName,
      membershipNumber: letter.printedMembershipNumber,
      unit: letter.printedUnit,
      branch: letter.printedBranch,
      chairman: await this.signatory(letter.presidentSignature),
      secretary: await this.signatory(letter.generalSecretarySignature),
    });

    await this.audit.record({
      action: 'vehicle_letter.download',
      subjectType: 'vehicle_letter',
      subjectId: letter.id,
      actorUserId: userId,
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      after: { vehicleId, letterReference: letter.letterReference },
    });

    return {
      bytes,
      filename: `nurtw-vehicle-letter-${letter.letterReference}.pdf`,
    };
  }

  private async signatory(
    signature: {
      officerName: string;
      officerTitle: string;
      mediaAssetId: string;
    } | null,
  ): Promise<LetterSignatory | null> {
    if (!signature) {
      return null;
    }
    return {
      officerName: signature.officerName,
      officerTitle: signature.officerTitle,
      image: await this.embeddable(signature.mediaAssetId),
    };
  }

  /** As the card does: an image the PDF cannot embed prints nothing, never an error. */
  private async embeddable(assetId: string): Promise<EmbeddableImage | null> {
    const asset = await this.media.readInternal(assetId);
    if (!asset || !RENDERABLE_IMAGE_TYPES.includes(asset.contentType)) {
      return null;
    }
    return { bytes: asset.bytes, contentType: asset.contentType };
  }

  /** Random, like the card number, retried on the vanishingly rare collision. */
  private async allocateReference(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt++) {
      const candidate = generateIdentifier(() => randomInt(256));
      const clash = await tx.vehicleLetter.findUnique({
        where: { letterReference: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new ConflictException('Could not allocate a letter reference.');
  }
}

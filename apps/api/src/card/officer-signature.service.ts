import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateOfficerSignatureInput,
  OfficerSignaturePosition,
  OfficerSignatureRecord,
} from '@nurtw/contracts';

import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Officer signature assets (PRD §23.7).
 *
 * Approved signature images held against a position, composited at print. Three
 * properties matter and each is enforced rather than described:
 *
 * 1. **One active signature per position**, by a partial unique index. Two
 *    active president signatures would make "which one was this card signed
 *    with" a matter of query ordering.
 * 2. **Superseded, never overwritten.** An officer leaves office; every card
 *    already issued bearing their signature must stay explicable, so the record
 *    remains and the cards referencing it keep resolving.
 * 3. **Union-wide, so `canAnywhere` is the whole check.** These carry no
 *    organisation path — the same deliberate exception as master data. The guard
 *    on `card_template.manage` is therefore the complete authorisation, and there
 *    is no record path to re-ask against.
 *
 * The whole surface is audited. A forged signature asset would forge every card
 * issued after it, which makes this the most consequential small table in the
 * System.
 */
@Injectable()
export class OfficerSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async list(includeSuperseded = false): Promise<OfficerSignatureRecord[]> {
    const rows = await this.prisma.officerSignature.findMany({
      where: includeSuperseded ? {} : { isActive: true },
      orderBy: [{ position: 'asc' }, { activeFrom: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  /**
   * Registers a signature and supersedes whatever held the position.
   *
   * One transaction, so the position is never briefly held by two signatures and
   * never briefly held by none.
   */
  async create(
    actor: ActorContext,
    input: CreateOfficerSignatureInput,
  ): Promise<OfficerSignatureRecord> {
    // The asset must have been uploaded *as* an officer signature. A passport
    // photograph promoted into a signature slot would be printed on every card
    // issued afterwards.
    await this.media.assertKind(input.mediaAssetId, 'OFFICER_SIGNATURE');

    const inUse = await this.prisma.officerSignature.findUnique({
      where: { mediaAssetId: input.mediaAssetId },
      select: { id: true },
    });
    if (inUse) {
      throw new ConflictException(
        'That image is already registered as an officer signature.',
      );
    }

    const superseded = await this.prisma.officerSignature.findFirst({
      where: { position: input.position, isActive: true },
      select: { id: true, officerName: true },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      if (superseded) {
        await tx.officerSignature.update({
          where: { id: superseded.id },
          data: { isActive: false, activeTo: now },
        });
      }

      const row = await tx.officerSignature.create({
        data: {
          position: input.position,
          officerName: input.officerName,
          officerTitle: input.officerTitle,
          mediaAssetId: input.mediaAssetId,
          isActive: true,
          activeFrom: now,
        },
      });

      await this.audit.record(
        {
          action: 'officer_signature.register',
          subjectType: 'officer_signature',
          subjectId: row.id,
          actorUserId: actor.userId,
          before: superseded
            ? { supersededId: superseded.id, officerName: superseded.officerName }
            : null,
          after: {
            position: row.position,
            officerName: row.officerName,
            officerTitle: row.officerTitle,
            // The asset id, never the bytes. A signature image in the audit
            // trail would be a seven-year copy of the thing being protected.
            mediaAssetId: row.mediaAssetId,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toRecord(created);
  }

  /**
   * Withdraws a signature without a successor.
   *
   * Leaves the position vacant, and cards issued afterwards carry a blank
   * signature line rather than a stale one. Deactivating is not deleting: the
   * record stays so that cards already issued under it still resolve.
   */
  async deactivate(
    actor: ActorContext,
    id: string,
    reason: string,
  ): Promise<OfficerSignatureRecord> {
    const existing = await this.prisma.officerSignature.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException();
    }
    if (!existing.isActive) {
      throw new ConflictException('That signature is already superseded.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.officerSignature.update({
        where: { id },
        data: { isActive: false, activeTo: new Date() },
      });

      await this.audit.record(
        {
          action: 'officer_signature.deactivate',
          subjectType: 'officer_signature',
          subjectId: id,
          actorUserId: actor.userId,
          reason,
          before: { isActive: true },
          after: { isActive: false, position: row.position },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toRecord(updated);
  }

  private toRecord(row: {
    id: string;
    position: string;
    officerName: string;
    officerTitle: string;
    mediaAssetId: string;
    isActive: boolean;
    activeFrom: Date;
    activeTo: Date | null;
  }): OfficerSignatureRecord {
    return {
      id: row.id,
      position: row.position as OfficerSignaturePosition,
      officerName: row.officerName,
      officerTitle: row.officerTitle,
      mediaAssetId: row.mediaAssetId,
      isActive: row.isActive,
      activeFrom: row.activeFrom.toISOString(),
      activeTo: row.activeTo?.toISOString() ?? null,
    };
  }
}

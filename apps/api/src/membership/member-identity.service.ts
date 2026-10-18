import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';

import { encryptSecret } from '../common/secret-box.js';
import { loadEnvironment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What may be said of a member's NIN: whether one is recorded, and its last four digits. */
export interface NinState {
  ninRecorded: boolean;
  ninLastFour: string | null;
}

/**
 * A member's NIN (item 44; `QUESTIONS.md` PAY-22, MEM-19; PRD Requirement 7.4;
 * `ARCHITECTURE.md` Decision 10.1.3).
 *
 * **The one place that touches `member_identity.nin_ciphertext`.** Nothing here
 * returns a NIN: a caller learns whether one is recorded and its last four
 * digits. Item 50, which may send a NIN to Paystack, is the only use planned
 * for the sealed value, and adds its own method here when it is built.
 *
 * - **Sealed** under `IDENTITY_ENCRYPTION_KEY`. Without the key, recording one
 *   answers 503 rather than storing a NIN in the clear.
 * - **Matched by a keyed hash** from the same key, so one NIN is never held by
 *   two records and no plain value is ever compared. The partial unique index
 *   `member_identity_one_held_per_nin` is the control; the check before the
 *   write only makes the usual case fail cleanly.
 * - **Released, not deleted, when a membership is cancelled**, so somebody who
 *   rejoins can be registered with their NIN. The cancelled record keeps it.
 *
 * Never put a NIN, its hash, or its ciphertext in a log, an audit event, or an
 * error message. The audit trail records that it changed, not what it became.
 */
@Injectable()
export class MemberIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Refuses with 503 unless a NIN can be sealed. Call before a transaction starts. */
  assertAvailable(): void {
    this.key();
  }

  /** Whether a member has a NIN recorded, and its last four digits. */
  async state(memberId: string): Promise<NinState> {
    const row = await this.prisma.memberIdentity.findUnique({
      where: { memberId },
      select: { ninLastFour: true },
    });
    return { ninRecorded: row !== null, ninLastFour: row?.ninLastFour ?? null };
  }

  /**
   * Records a member's NIN, or replaces the one they have, inside the caller's
   * transaction. A NIN another record holds answers 409, as generic as every
   * conflict (Requirement 14.3); the screen says what it means. Returns whether
   * one was replaced, for the audit trail.
   */
  async record(
    tx: Prisma.TransactionClient,
    memberId: string,
    nin: string,
  ): Promise<{ replaced: boolean }> {
    const key = this.key();
    const hash = lookupHash(nin, key);

    const heldElsewhere = await tx.memberIdentity.findFirst({
      where: {
        ninLookupHash: hash,
        releasedAt: null,
        memberId: { not: memberId },
      },
      select: { id: true },
    });
    if (heldElsewhere) {
      throw new ConflictException('That NIN is recorded for another member.');
    }

    const existing = await tx.memberIdentity.findUnique({
      where: { memberId },
      select: { id: true },
    });
    const sealed = {
      ninCiphertext: encryptSecret(nin, key),
      ninLookupHash: hash,
      ninLastFour: nin.slice(-4),
      releasedAt: null,
    };
    try {
      await tx.memberIdentity.upsert({
        where: { memberId },
        create: { memberId, ...sealed },
        update: sealed,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Two officers recording one NIN at once: the index let one through.
        throw new ConflictException('That NIN is recorded for another member.');
      }
      throw error;
    }
    return { replaced: existing !== null };
  }

  /** Takes a member's NIN off their record. Returns whether there was one. */
  async remove(
    tx: Prisma.TransactionClient,
    memberId: string,
  ): Promise<boolean> {
    const { count } = await tx.memberIdentity.deleteMany({
      where: { memberId },
    });
    return count > 0;
  }

  /**
   * Frees the NIN of a member whose membership is cancelled, so it can be
   * recorded on a new registration: somebody who rejoins is registered again.
   * The cancelled record keeps it.
   */
  async release(
    tx: Prisma.TransactionClient,
    memberId: string,
    now: Date,
  ): Promise<void> {
    await tx.memberIdentity.updateMany({
      where: { memberId, releasedAt: null },
      data: { releasedAt: now },
    });
  }

  private key(): string {
    const key = loadEnvironment().identityEncryptionKey;
    if (!key) {
      throw new ServiceUnavailableException(
        'A NIN cannot be recorded: IDENTITY_ENCRYPTION_KEY is not configured.',
      );
    }
    return key;
  }
}

/**
 * The keyed hash a NIN is matched by. Keyed, because there are few enough
 * eleven-digit numbers to hash them all: a plain hash would be the NIN itself.
 * Its key is derived from the sealing key and is never the sealing key.
 */
export function lookupHash(nin: string, keyMaterial: string): string {
  const key = createHash('sha256')
    .update(`nin-lookup\0${keyMaterial}`)
    .digest();
  return createHmac('sha256', key).update(nin).digest('hex');
}

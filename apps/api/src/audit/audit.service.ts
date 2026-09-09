import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * A single audited change.
 *
 * `before` and `after` are the material values only — never the whole row.
 * Writing the entire record would put whatever sensitive column is added to that
 * table next into the audit trail automatically, where it would be retained for
 * seven years (PRD §22) and read by anyone holding `audit.read`. The audit trail
 * must record what changed, not accumulate a shadow copy of the database.
 */
export interface AuditEntry {
  /** `resource.action`, matching the permission catalogue's convention. */
  action: string;
  subjectType: string;
  subjectId?: string | null;
  organisationId?: string | null;
  actorUserId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  /** Required for overrides, corrections, suspensions (PRD Requirement 18.1). */
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
}

/**
 * Writes the audit trail (domain rule 6, PRD §18).
 *
 * **Pass a transaction client wherever one is open.** An audit event written
 * outside the transaction that made the change is a lie in one of two
 * directions: the change rolls back and the trail records something that never
 * happened, or the write fails and a real change goes unrecorded. Every method
 * here therefore takes an optional client and uses it in preference to its own.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditEntry,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditEvent.create({
      data: {
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId ?? null,
        organisationId: entry.organisationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        beforeValue: entry.before ?? undefined,
        afterValue: entry.after ?? undefined,
        reason: entry.reason ?? null,
        requestId: entry.requestId ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    });

    this.logger.log(
      `${entry.action} ${entry.subjectType}:${entry.subjectId ?? '-'} by ${
        entry.actorUserId ?? 'system'
      }`,
    );
  }
}

import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateInvitationInput,
  InvitationList,
  InvitationSummary,
  PublicInvitation,
} from '@nurtw/contracts';
import {
  invitationExpiresAt,
  invitationStanding,
  isInvitationCode,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PublicRateLimitService } from '../common/public-rate-limit.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** How long a link lasts, and how often its page may be opened (settings). */
export const PORTAL_INVITATION_EXPIRY_DAYS = 'portal.invitation_expiry_days';
export const PORTAL_INVITATION_VIEWS_PER_MINUTE =
  'portal.invitation_views_per_minute';
const EXPIRY_DAYS_FALLBACK = 14;
const VIEWS_FALLBACK = 30;
const MINUTE_MS = 60 * 1000;
/** The list is for an administrator's eye; the newest are what matter. */
const LIST_LIMIT = 200;

const INVITATION_SELECT = {
  id: true,
  code: true,
  organisationName: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  note: true,
  createdAt: true,
  expiresAt: true,
  usedAt: true,
  apiClientId: true,
  withdrawnAt: true,
  withdrawReason: true,
  createdByUser: { select: { fullName: true } },
  withdrawnByUser: { select: { fullName: true } },
} satisfies Prisma.PortalInvitationSelect;

type InvitationRow = Prisma.PortalInvitationGetPayload<{
  select: typeof INVITATION_SELECT;
}>;

function toSummary(row: InvitationRow, now: Date): InvitationSummary {
  return {
    id: row.id,
    code: row.code,
    organisationName: row.organisationName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    note: row.note,
    standing: invitationStanding(row, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    createdBy: row.createdByUser?.fullName ?? null,
    used: row.usedAt
      ? { at: row.usedAt.toISOString(), apiClientId: row.apiClientId }
      : null,
    withdrawn: row.withdrawnAt
      ? {
          at: row.withdrawnAt.toISOString(),
          by: row.withdrawnByUser?.fullName ?? null,
          reason: row.withdrawReason,
        }
      : null,
  };
}

/**
 * Inviting an organisation to apply (PRD Requirement 12.11, revision 1.10;
 * `QUESTIONS.md` EXT-21 — item 33).
 *
 * - **An invitation confirms nobody and lifts no limit.** It opens the
 *   portal's form addressed to one organisation. The application it produces
 *   is limited, confirmed, and decided exactly as any other.
 * - **Its standing is worked out, never stored** (`invitationStanding`).
 * - **Used once.** One conditional update, in the application's transaction,
 *   sets `usedAt` only while the invitation is open and unused.
 * - **The code is not a credential** (`ARCHITECTURE.md` Decision 9.17), but it
 *   stays out of audit events, and `redactUrl` keeps it out of logged URLs.
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly publicLimits: PublicRateLimitService,
  ) {}

  expiryDays(): Promise<number> {
    return this.settings.getPositiveInteger(
      PORTAL_INVITATION_EXPIRY_DAYS,
      EXPIRY_DAYS_FALLBACK,
    );
  }

  async list(now: Date = new Date()): Promise<InvitationList> {
    const [rows, expiryDays] = await Promise.all([
      this.prisma.portalInvitation.findMany({
        select: INVITATION_SELECT,
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      this.expiryDays(),
    ]);
    return {
      invitations: rows.map((row) => toSummary(row, now)),
      expiryDays,
    };
  }

  async create(
    actor: ActorContext,
    input: CreateInvitationInput,
    now: Date = new Date(),
  ): Promise<InvitationSummary> {
    const expiresAt = invitationExpiresAt(now, await this.expiryDays());
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.portalInvitation.create({
        data: {
          // Sixteen random bytes, as a pay link's: unguessable, and short
          // enough to read out or send in a message.
          code: randomBytes(16).toString('base64url'),
          organisationName: input.organisationName,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          note: input.note ?? null,
          createdByUserId: actor.userId,
          createdAt: now,
          expiresAt,
        },
        select: INVITATION_SELECT,
      });
      await this.audit.record(
        {
          action: 'portal_invitation.create',
          subjectType: 'portal_invitation',
          subjectId: created.id,
          actorUserId: actor.userId,
          // Never the code: the trail is not a list of working links.
          after: {
            organisationName: created.organisationName,
            expiresAt: expiresAt.toISOString(),
            contactGiven:
              created.contactName !== null ||
              created.contactEmail !== null ||
              created.contactPhone !== null,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return created;
    });
    return toSummary(row, now);
  }

  async withdraw(
    actor: ActorContext,
    id: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<InvitationSummary> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.portalInvitation.findUnique({
        where: { id },
        select: INVITATION_SELECT,
      });
      if (!before) {
        throw new NotFoundException();
      }
      // Only an open link can be withdrawn: a used one already did its work,
      // and an expired one opens nothing. The condition is in the update, so
      // an application arriving at the same moment cannot slip between.
      const { count } = await tx.portalInvitation.updateMany({
        where: {
          id,
          usedAt: null,
          withdrawnAt: null,
          expiresAt: { gt: now },
        },
        data: {
          withdrawnAt: now,
          withdrawnByUserId: actor.userId,
          withdrawReason: reason,
        },
      });
      if (count === 0) {
        throw new ConflictException(
          'Only an open invitation can be withdrawn.',
        );
      }
      await this.audit.record(
        {
          action: 'portal_invitation.withdraw',
          subjectType: 'portal_invitation',
          subjectId: id,
          actorUserId: actor.userId,
          before: { standing: invitationStanding(before, now) },
          after: { standing: 'WITHDRAWN' },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return tx.portalInvitation.findUniqueOrThrow({
        where: { id },
        select: INVITATION_SELECT,
      });
    });
    return toSummary(row, now);
  }

  /**
   * What the application form shows for a link: the organisation's name and
   * when the link stops working. Unknown, used, expired, and withdrawn all
   * answer the same 404, and the page is limited per address.
   */
  async publicView(
    code: string,
    ipAddress: string | undefined,
    now: Date = new Date(),
  ): Promise<PublicInvitation> {
    const perMinute = await this.settings.getPositiveInteger(
      PORTAL_INVITATION_VIEWS_PER_MINUTE,
      VIEWS_FALLBACK,
    );
    await this.publicLimits.hit(
      'portal:invitation',
      ipAddress,
      perMinute,
      MINUTE_MS,
    );
    if (!isInvitationCode(code)) {
      throw new NotFoundException();
    }
    const row = await this.prisma.portalInvitation.findUnique({
      where: { code },
      select: {
        organisationName: true,
        expiresAt: true,
        usedAt: true,
        withdrawnAt: true,
      },
    });
    if (!row || invitationStanding(row, now) !== 'OPEN') {
      throw new NotFoundException();
    }
    return {
      organisationName: row.organisationName,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /**
   * Inside an application's transaction: the invitation is used by this
   * application if it is open and unused, by one conditional update, and its
   * id is returned. Any other code is ignored, and `null` returned, so the
   * application goes in uninvited and the applicant is told nothing different.
   */
  async useInTransaction(
    tx: Prisma.TransactionClient,
    code: string | undefined,
    apiClientId: string,
    context: { requestId?: string; ipAddress?: string },
    now: Date = new Date(),
  ): Promise<string | null> {
    if (code === undefined || !isInvitationCode(code)) {
      return null;
    }
    const { count } = await tx.portalInvitation.updateMany({
      where: {
        code,
        usedAt: null,
        withdrawnAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now, apiClientId },
    });
    if (count === 0) {
      this.logger.log('An application arrived with an invitation not open');
      return null;
    }
    const used = await tx.portalInvitation.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });
    await this.audit.record(
      {
        action: 'portal_invitation.use',
        subjectType: 'portal_invitation',
        subjectId: used.id,
        actorApiClientId: apiClientId,
        after: { apiClientId },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      },
      tx,
    );
    return used.id;
  }
}

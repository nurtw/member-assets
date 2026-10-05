import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  PayLinkSubjectInput,
  PayLinkSummary,
  PublicPayInput,
  PublicPayOption,
  PublicPayPage,
  PublicPayStarted,
} from '@nurtw/contracts';
import {
  isPayLinkCode,
  PAY_LINK_FEE_TYPES,
  payLinkLabel,
  payLinkOffers,
  type PayLinkSubject,
} from '@nurtw/domain';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
import { loadEnvironment } from '../config/environment.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { PaymentsService } from './payments.service.js';
import { SettlementService } from './settlement.service.js';

const INITIATE = 'payment.initiate';

/** The public routes' limits, per address (runtime settings, item 31). */
export const PAY_LINK_VIEWS_PER_MINUTE = 'pay_link.views_per_minute';
export const PAY_LINK_PAYMENTS_PER_HOUR = 'pay_link.payments_per_hour';
const VIEWS_FALLBACK = 30;
const PAYMENTS_FALLBACK = 10;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/** A limit refusal, carrying when to try again (`Retry-After`). */
export class PublicRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
  }
}

interface LinkRow {
  id: string;
  code: string;
  subjectType: string;
  subjectId: string;
  createdAt: Date;
}

const LINK_SELECT = {
  id: true,
  code: true,
  subjectType: true,
  subjectId: true,
  createdAt: true,
} as const;

/**
 * Personal pay links (PRD Requirement 27.8, revision 1.9; `QUESTIONS.md`
 * PAY-21 — item 31).
 *
 * Two audiences. An officer holding `payment.initiate` over the subject gets or
 * replaces its link. Anyone holding the link opens a public page offering the
 * published amounts and starts a Paystack payment. Nothing the public side
 * answers depends on what the subject owes: it reads no dues at all.
 *
 * This lives in the payments module, not verification, which stays read-only.
 */
@Injectable()
export class PayLinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayLinkService.name);
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly settlement: SettlementService,
  ) {}

  onModuleInit(): void {
    // Suites call `prune()` themselves, as they do for the rate limits.
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.pruneTimer = setInterval(() => {
      void this.prune().catch((error: unknown) =>
        this.logger.error(`Pay-link counter prune failed: ${String(error)}`),
      );
    }, PRUNE_INTERVAL_MS);
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }
  }

  // --- The officer's side ------------------------------------------------------

  /** The subject's live link, made now if it has none. */
  async forSubject(
    actor: ActorContext,
    input: PayLinkSubjectInput,
  ): Promise<PayLinkSummary> {
    const subject = await this.subjectInScope(actor.userId, input);
    const existing = await this.liveLink(input.subjectType, input.subjectId);
    if (existing) {
      return this.summary(existing, subject.label);
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.payLink.create({
          data: {
            code: newCode(),
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            createdByUserId: actor.userId,
          },
          select: LINK_SELECT,
        });
        await this.audit.record(
          {
            action: 'pay_link.create',
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            actorUserId: actor.userId,
            requestId: actor.requestId ?? undefined,
            ipAddress: actor.ipAddress ?? undefined,
            after: { payLinkId: row.id },
          },
          tx,
        );
        return row;
      });
      return this.summary(created, subject.label);
    } catch (error) {
      // Two officers asked at once: the partial unique index let one through.
      if (isUniqueViolation(error)) {
        const winner = await this.liveLink(input.subjectType, input.subjectId);
        if (winner) {
          return this.summary(winner, subject.label);
        }
      }
      throw error;
    }
  }

  /**
   * Replaces a link: the old one stops working at once and is kept, with who
   * replaced it and why. For a link sent to the wrong person, or misused.
   */
  async replace(
    actor: ActorContext,
    id: string,
    reason: string,
  ): Promise<PayLinkSummary> {
    const old = await this.prisma.payLink.findFirst({
      where: { id, revokedAt: null },
      select: LINK_SELECT,
    });
    if (!old || !isSubjectType(old.subjectType)) {
      throw new NotFoundException();
    }
    const subject = await this.subjectInScope(actor.userId, {
      subjectType: old.subjectType,
      subjectId: old.subjectId,
    });
    const replacement = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.payLink.updateMany({
        where: { id: old.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedByUserId: actor.userId,
          revokeReason: reason,
        },
      });
      if (revoked.count === 0) {
        // Replaced by somebody else a moment ago.
        throw new NotFoundException();
      }
      const row = await tx.payLink.create({
        data: {
          code: newCode(),
          subjectType: old.subjectType,
          subjectId: old.subjectId,
          createdByUserId: actor.userId,
        },
        select: LINK_SELECT,
      });
      await this.audit.record(
        {
          action: 'pay_link.replace',
          subjectType: old.subjectType,
          subjectId: old.subjectId,
          actorUserId: actor.userId,
          reason,
          requestId: actor.requestId ?? undefined,
          ipAddress: actor.ipAddress ?? undefined,
          before: { payLinkId: old.id },
          after: { payLinkId: row.id },
        },
        tx,
      );
      return row;
    });
    return this.summary(replacement, subject.label);
  }

  // --- The public side ---------------------------------------------------------

  /**
   * What the public page shows: the subject's label and the published amounts.
   * An unknown, malformed, or replaced code is the same 404.
   */
  async publicPage(
    code: string,
    address: string | undefined,
  ): Promise<PublicPayPage> {
    await this.limit('views', address);
    const link = await this.publicLink(code);
    const label = await this.publicLabel(link);
    const open = (await this.settlement.getActive()) !== null;
    const options: PublicPayOption[] = [];
    for (const feeTypeCode of PAY_LINK_FEE_TYPES[link.subjectType]) {
      const quote = await this.payments
        .quote(feeTypeCode, { type: link.subjectType, id: link.subjectId })
        .catch(() => null);
      // An inactive or placeholder fee is closed for everybody alike.
      if (!quote || quote.isPlaceholder || !quote.active) {
        continue;
      }
      options.push({
        feeTypeCode: quote.feeTypeCode,
        label: quote.label,
        dueKobo: quote.dueKobo,
        feeKobo: quote.totalChargedKobo - quote.dueKobo,
        totalKobo: quote.totalChargedKobo,
      });
    }
    return { subjectType: link.subjectType, label, open, options };
  }

  /** Starts a Paystack payment from a pay link. No officer is recorded. */
  async publicStart(
    code: string,
    input: PublicPayInput,
    address: string | undefined,
    requestId: string | undefined,
  ): Promise<PublicPayStarted> {
    await this.limit('payments', address);
    const link = await this.publicLink(code);
    if (!payLinkOffers(link.subjectType, input.feeTypeCode)) {
      throw new ValidationException([
        { field: 'feeTypeCode', message: 'This link does not pay that fee.' },
      ]);
    }
    if (input.returnUrl && !this.isOwnOrigin(input.returnUrl)) {
      throw new ValidationException([
        { field: 'returnUrl', message: 'The return address is not allowed.' },
      ]);
    }
    if (!(await this.settlement.getActive())) {
      throw new ValidationException([
        { field: '', message: 'Payments are not open yet.' },
      ]);
    }
    const started = await this.payments.initiate({
      feeTypeCode: input.feeTypeCode,
      subjectType: link.subjectType,
      subjectId: link.subjectId,
      payerEmail: input.payerEmail,
      initiatedByUserId: null,
      callbackUrl: input.returnUrl,
      payLinkId: link.id,
    });
    this.logger.log(
      `Payment started from a pay link [${requestId ?? 'no request id'}]`,
    );
    return { authorizationUrl: started.authorizationUrl };
  }

  /** Deletes counters older than a day. */
  async prune(now: Date = new Date()): Promise<void> {
    await this.prisma.publicRateCounter.deleteMany({
      where: {
        windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
  }

  // --- Internals -----------------------------------------------------------------

  private async liveLink(subjectType: string, subjectId: string) {
    return this.prisma.payLink.findFirst({
      where: { subjectType, subjectId, revokedAt: null },
      select: LINK_SELECT,
    });
  }

  private async publicLink(
    code: string,
  ): Promise<LinkRow & { subjectType: PayLinkSubject }> {
    if (!isPayLinkCode(code)) {
      throw new NotFoundException();
    }
    const link = await this.prisma.payLink.findFirst({
      where: { code, revokedAt: null },
      select: LINK_SELECT,
    });
    if (!link || !isSubjectType(link.subjectType)) {
      throw new NotFoundException();
    }
    return { ...link, subjectType: link.subjectType };
  }

  private async publicLabel(link: {
    subjectType: PayLinkSubject;
    subjectId: string;
  }) {
    if (link.subjectType === 'vehicle') {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: link.subjectId },
        select: { plateNumberDisplay: true },
      });
      if (!vehicle) {
        throw new NotFoundException();
      }
      return payLinkLabel({ type: 'vehicle', ...vehicle });
    }
    const member = await this.prisma.member.findUnique({
      where: { id: link.subjectId },
      select: { firstName: true, membershipNumber: true },
    });
    if (!member) {
      throw new NotFoundException();
    }
    return payLinkLabel({ type: 'member', ...member });
  }

  /**
   * The subject and its label, if the officer may start payments over it.
   * Out of scope answers 404, exactly as for no such subject.
   */
  private async subjectInScope(
    userId: string,
    input: PayLinkSubjectInput,
  ): Promise<{ label: string }> {
    if (input.subjectType === 'vehicle') {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: input.subjectId },
        select: {
          plateNumberDisplay: true,
          branch: { select: { path: true } },
          unit: { select: { path: true } },
        },
      });
      const path = vehicle?.unit?.path ?? vehicle?.branch?.path;
      if (
        !vehicle ||
        !path ||
        !(await this.permissions.can(userId, INITIATE, path))
      ) {
        throw new NotFoundException();
      }
      return {
        label: payLinkLabel({
          type: 'vehicle',
          plateNumberDisplay: vehicle.plateNumberDisplay,
        }),
      };
    }
    const member = await this.prisma.member.findUnique({
      where: { id: input.subjectId },
      select: {
        firstName: true,
        membershipNumber: true,
        organisation: { select: { path: true } },
      },
    });
    if (
      !member ||
      !(await this.permissions.can(userId, INITIATE, member.organisation.path))
    ) {
      throw new NotFoundException();
    }
    return {
      label: payLinkLabel({
        type: 'member',
        firstName: member.firstName,
        membershipNumber: member.membershipNumber,
      }),
    };
  }

  private summary(row: LinkRow, label: string): PayLinkSummary {
    return {
      id: row.id,
      code: row.code,
      subjectType: row.subjectType as PayLinkSubject,
      subjectId: row.subjectId,
      label,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Paystack returns the payer here, so it must be the web application's own page. */
  private isOwnOrigin(url: string): boolean {
    try {
      return loadEnvironment().corsOrigins.includes(new URL(url).origin);
    } catch {
      return false;
    }
  }

  /**
   * One counter per address and window, one atomic statement (as item 13's
   * counters are). An address the request does not carry shares one counter.
   */
  private async limit(kind: 'views' | 'payments', address: string | undefined) {
    const [setting, fallback, windowMs] =
      kind === 'views'
        ? [PAY_LINK_VIEWS_PER_MINUTE, VIEWS_FALLBACK, 60_000]
        : [PAY_LINK_PAYMENTS_PER_HOUR, PAYMENTS_FALLBACK, 3_600_000];
    const allowed = await this.settings.getPositiveInteger(setting, fallback);
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const key = `pay:${kind}:${createHash('sha256')
      .update(address ?? 'unknown')
      .digest('hex')}`;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO public_rate_counter (key, window_start, count)
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = public_rate_counter.count + 1
      RETURNING count`;
    if ((rows[0]?.count ?? 0) > allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((windowStart.getTime() + windowMs - now) / 1000),
      );
      throw new PublicRateLimitedException(retryAfter);
    }
  }
}

function newCode(): string {
  return randomBytes(16).toString('base64url');
}

function isSubjectType(value: string): value is PayLinkSubject {
  return value === 'vehicle' || value === 'member';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

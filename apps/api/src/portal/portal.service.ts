import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ApiTokenSummary,
  CreatePortalAccountInput,
  IssuedApiToken,
  IssuedPortalPassword,
  PortalApplicationInput,
  PortalApplicationReceived,
  PortalChangePasswordInput,
  PortalMe,
  PortalTokens,
  PortalUsage,
  PortalUsageDay,
  RevokeApiTokenInput,
  RotateApiTokenInput,
} from '@nurtw/contracts';
import {
  apiClientStanding,
  applicationExpiresAt,
  emptyUsageTally,
  passwordProblems,
  portalUsageClass,
  type StoredApiClientStatus,
} from '@nurtw/domain';
import { Prisma } from '@prisma/client';

import {
  ApiClientService,
  TOKEN_SELECT,
  toTokenSummary,
} from '../api-client/api-client.service.js';
import {
  ApiTokenService,
  type TokenActor,
} from '../api-client/api-token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, verifyPassword } from '../auth/password-hashing.js';
import {
  PublicRateLimitedException,
  PublicRateLimitService,
} from '../common/public-rate-limit.service.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
import { loadEnvironment } from '../config/environment.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import {
  AUTH_LOCKOUT_MINUTES,
  AUTH_LOCKOUT_THRESHOLD,
  SettingsService,
} from '../settings/settings.service.js';
import { generateTemporaryPassword } from '../users/users.service.js';
import type { PortalPrincipal } from './portal-account.decorator.js';
import {
  PORTAL_ACCOUNT_SELECT,
  toPortalAccountSummary,
} from './portal-account.summary.js';
import {
  PortalSessionService,
  type IssuedPortalSession,
} from './portal-session.service.js';

/** The open form's limits (runtime settings, item 29). */
export const PORTAL_APPLICATIONS_PER_HOUR = 'portal.applications_per_hour';
export const PORTAL_PENDING_CAP = 'portal.pending_cap';
export const PORTAL_APPLICATION_EXPIRY_DAYS = 'portal.application_expiry_days';
const APPLICATIONS_FALLBACK = 3;
const PENDING_CAP_FALLBACK = 50;
const EXPIRY_DAYS_FALLBACK = 30;

const DEFAULT_LOCKOUT_THRESHOLD = 10;
const DEFAULT_LOCKOUT_MINUTES = 15;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LAGOS_OFFSET_MS = HOUR_MS;

export const PORTAL_USAGE_DEFAULT_DAYS = 30;
export const PORTAL_USAGE_MAX_DAYS = 90;

/** `YYYY-MM-DD` in Lagos (UTC+1, no daylight saving). */
function lagosDay(instant: Date): string {
  return new Date(instant.getTime() + LAGOS_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * The organisation portal (PRD §23.23, revision 1.9; `QUESTIONS.md` EXT-20 —
 * item 29).
 *
 * - **Applying is not being approved.** An application makes a `PENDING`
 *   organisation that can do nothing, and an account that can see only that.
 *   Approval is still `api_client.manage`'s act, through `ApiClientService`.
 * - **An organisation acts on itself and no other.** Every method that takes a
 *   `PortalPrincipal` uses its `apiClientId`; none takes an organisation's id
 *   from the request.
 * - **It chooses nothing about its access.** Scopes, the disclosure profile,
 *   and limits are read here and written only by the administrator.
 * - **Usage says no more than the API's answers did** (`portalUsageClass`).
 * - **Secrets:** never select `passwordHash` into a response, and never put a
 *   password in an audit event. A token is shown once, to the organisation.
 */
@Injectable()
export class PortalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortalService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly publicLimits: PublicRateLimitService,
    private readonly sessions: PortalSessionService,
    private readonly clients: ApiClientService,
    private readonly tokens: ApiTokenService,
    private readonly rateLimits: RateLimitService,
  ) {}

  onModuleInit(): void {
    // Suites call `sweep()` themselves, as they do for the other timers.
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch((error: unknown) =>
        this.logger.error(`Portal application sweep failed: ${String(error)}`),
      );
    }, HOUR_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
  }

  // --- Applying (public) --------------------------------------------------------

  /**
   * An organisation applies for itself. The answer is the same whatever
   * happens next, so the form cannot be used to learn which addresses already
   * hold an account.
   */
  async apply(
    input: PortalApplicationInput,
    context: { ipAddress?: string; requestId?: string },
  ): Promise<PortalApplicationReceived> {
    const [perHour, cap, expiryDays] = await Promise.all([
      this.settings.getPositiveInteger(
        PORTAL_APPLICATIONS_PER_HOUR,
        APPLICATIONS_FALLBACK,
      ),
      this.settings.getPositiveInteger(
        PORTAL_PENDING_CAP,
        PENDING_CAP_FALLBACK,
      ),
      this.expiryDays(),
    ]);
    await this.publicLimits.hit(
      'portal:apply',
      context.ipAddress,
      perHour,
      HOUR_MS,
    );

    const problems = passwordProblems(input.password, {
      email: input.email,
      fullName: input.contactName,
    });
    if (problems.length > 0) {
      throw new ValidationException(
        problems.map((message) => ({ field: 'password', message })),
      );
    }

    const now = new Date();
    const pending = await this.prisma.apiClient.count({
      where: {
        selfRegistered: true,
        status: 'PENDING',
        createdAt: { gt: new Date(now.getTime() - expiryDays * DAY_MS) },
      },
    });
    if (pending >= cap) {
      // The list is full until the administrator has worked through it.
      throw new PublicRateLimitedException(HOUR_MS / 1000);
    }

    // Hashed before the lookup, so an address already in use costs the same
    // time as a new one.
    const passwordHash = await hashPassword(input.password);
    const taken = await this.prisma.portalAccount.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (taken) {
      await this.recordDuplicate(context);
      return { received: true };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const client = await tx.apiClient.create({
          data: {
            organisationName: input.organisationName,
            businessPurpose: input.businessPurpose,
            technicalContactName: input.contactName,
            technicalContactEmail: input.email,
            technicalContactPhone: input.phone,
            allowedIpRanges: [],
            // Always pending: approval is the administrator's act.
            status: 'PENDING',
            selfRegistered: true,
          },
          select: { id: true },
        });
        const account = await tx.portalAccount.create({
          data: {
            apiClientId: client.id,
            email: input.email,
            fullName: input.contactName,
            passwordHash,
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            action: 'api_client.apply',
            subjectType: 'api_client',
            subjectId: client.id,
            actorApiClientId: client.id,
            after: {
              organisationName: input.organisationName,
              status: 'PENDING',
              selfRegistered: true,
              portalAccountId: account.id,
            },
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          },
          tx,
        );
      });
    } catch (error) {
      // Two applications with one address at once: the second is a duplicate.
      if (!isUniqueViolation(error)) {
        throw error;
      }
      await this.recordDuplicate(context);
    }
    return { received: true };
  }

  // --- Signing in ---------------------------------------------------------------

  /**
   * One answer for an unknown address, a wrong password, a deactivated
   * account, and a locked one, taking comparable time over each, as the
   * officers' sign-in does.
   */
  async login(
    email: string,
    password: string,
    context: { ipAddress?: string; userAgent?: string } = {},
    now: Date = new Date(),
  ): Promise<IssuedPortalSession> {
    const account = await this.prisma.portalAccount.findUnique({
      where: { email },
      select: {
        id: true,
        apiClientId: true,
        passwordHash: true,
        isActive: true,
        failedSignInCount: true,
        signInLockedUntil: true,
      },
    });
    if (!account) {
      await verifyPassword(password, await hashPassword('decoy'));
      this.logger.warn(
        `Failed portal sign-in for an unknown account from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }

    const valid = await verifyPassword(password, account.passwordHash);
    const locked =
      account.signInLockedUntil !== null && account.signInLockedUntil > now;
    if (locked || !valid || !account.isActive) {
      if (!locked && account.isActive) {
        await this.recordFailure(account, context, now);
      }
      this.logger.warn(
        `Failed portal sign-in for account ${account.id} from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }

    await this.prisma.portalAccount.update({
      where: { id: account.id },
      data: {
        failedSignInCount: 0,
        signInLockedUntil: null,
        lastLoginAt: now,
      },
    });
    return this.sessions.issue(account.id, context);
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }

  // --- The organisation's own view ----------------------------------------------

  async me(
    principal: PortalPrincipal,
    now: Date = new Date(),
  ): Promise<PortalMe> {
    const client = await this.prisma.apiClient.findUnique({
      where: { id: principal.apiClientId },
      select: {
        id: true,
        organisationName: true,
        status: true,
        selfRegistered: true,
        createdAt: true,
        approvedAt: true,
        rateLimitProfile: true,
        dailyQuota: true,
        scopes: { select: { scope: true }, orderBy: { scope: 'asc' } },
        tokens: { select: TOKEN_SELECT },
        disclosureProfile: {
          select: {
            label: true,
            fields: {
              select: { fieldPath: true },
              orderBy: { fieldPath: 'asc' },
            },
          },
        },
        limitProfile: {
          select: {
            verificationPerMinute: true,
            aggregatePerMinute: true,
            burst: true,
          },
        },
      },
    });
    if (!client) {
      throw new NotFoundException();
    }

    const stored = client.status as StoredApiClientStatus;
    const approved = stored !== 'PENDING' && client.approvedAt !== null;
    const { limits, pause } = await this.rateLimits.describe(
      {
        clientId: client.id,
        rateLimitProfile: client.rateLimitProfile,
        dailyQuota: client.dailyQuota,
      },
      now,
    );

    return {
      account: {
        email: principal.email,
        fullName: principal.fullName,
        mustChangePassword: principal.mustChangePassword,
      },
      organisation: {
        name: client.organisationName,
        status: apiClientStanding(stored, client.tokens, now),
        appliedAt: client.createdAt.toISOString(),
        applicationExpiresAt:
          stored === 'PENDING' && client.selfRegistered
            ? applicationExpiresAt(
                client.createdAt,
                await this.expiryDays(),
              ).toISOString()
            : null,
        approvedAt: client.approvedAt?.toISOString() ?? null,
        scopes: client.scopes.map((granted) => granted.scope),
        disclosureProfile: client.disclosureProfile
          ? {
              label: client.disclosureProfile.label,
              fields: client.disclosureProfile.fields.map(
                (field) => field.fieldPath,
              ),
            }
          : null,
        // Its rates and quota, which an integrator must know to stay inside
        // them. Never the detection thresholds, and never why it was paused.
        limits: approved
          ? {
              verificationPerMinute: client.limitProfile.verificationPerMinute,
              aggregatePerMinute: client.limitProfile.aggregatePerMinute,
              burst: client.limitProfile.burst,
              dailyQuota: limits.dailyQuota,
              usedToday: limits.usedToday,
            }
          : null,
        pausedUntil: pause?.active ? pause.pausedUntil : null,
      },
    };
  }

  /**
   * The organisation's own requests, by Lagos day. Counted in the database,
   * so a busy organisation's month is a few hundred rows here, not its log.
   */
  async usage(
    principal: PortalPrincipal,
    days: number,
    now: Date = new Date(),
  ): Promise<PortalUsage> {
    const span = Math.min(Math.max(1, Math.trunc(days)), PORTAL_USAGE_MAX_DAYS);
    const today = lagosDay(now);
    // Midnight in Lagos, `span - 1` days before today.
    const start = new Date(
      new Date(`${today}T00:00:00.000Z`).getTime() -
        LAGOS_OFFSET_MS -
        (span - 1) * DAY_MS,
    );

    // `created_at` holds UTC with no zone, so the bound is given the same
    // way: a zoned value would be shifted by the session's time zone.
    const startText = start.toISOString().slice(0, 23).replace('T', ' ');
    const groups = await this.prisma.$queryRaw<
      {
        day: string;
        result_class: string;
        status_code: number;
        rate_limited: boolean;
        n: number;
      }[]
    >`
      SELECT to_char(created_at + interval '1 hour', 'YYYY-MM-DD') AS day,
             result_class, status_code, rate_limited, count(*)::int AS n
        FROM api_request_log
       WHERE client_id = ${principal.apiClientId}::uuid
         AND created_at >= ${startText}::timestamp
       GROUP BY 1, 2, 3, 4`;

    const byDay = new Map<string, PortalUsageDay>();
    for (let offset = 0; offset < span; offset += 1) {
      const day = lagosDay(
        new Date(start.getTime() + offset * DAY_MS + HOUR_MS),
      );
      byDay.set(day, { day, total: 0, byClass: emptyUsageTally() });
    }
    const totals = emptyUsageTally();
    let total = 0;
    for (const group of groups) {
      const entry = byDay.get(group.day);
      if (!entry) {
        continue;
      }
      const usageClass = portalUsageClass({
        resultClass: group.result_class,
        statusCode: group.status_code,
        rateLimited: group.rate_limited,
      });
      entry.byClass[usageClass] += group.n;
      entry.total += group.n;
      totals[usageClass] += group.n;
      total += group.n;
    }
    return { days: [...byDay.values()], totals, total };
  }

  // --- Its own tokens -----------------------------------------------------------

  async listTokens(
    principal: PortalPrincipal,
    now: Date = new Date(),
  ): Promise<PortalTokens> {
    const [client, reminderDays] = await Promise.all([
      this.prisma.apiClient.findUnique({
        where: { id: principal.apiClientId },
        select: {
          status: true,
          tokens: { select: TOKEN_SELECT, orderBy: { createdAt: 'desc' } },
        },
      }),
      this.clients.reminderDays(),
    ]);
    if (!client) {
      throw new NotFoundException();
    }
    return {
      tokens: client.tokens.map((token) =>
        toTokenSummary(token, now, reminderDays),
      ),
      canManage: client.status === 'ACTIVE',
    };
  }

  /** `ApiTokenService` refuses unless the organisation is approved and active. */
  issueToken(
    principal: PortalPrincipal,
    context: { ipAddress?: string; requestId?: string },
  ): Promise<IssuedApiToken> {
    return this.tokens.issue(
      this.tokenActor(principal, context),
      principal.apiClientId,
    );
  }

  rotateToken(
    principal: PortalPrincipal,
    tokenId: string,
    input: RotateApiTokenInput,
    context: { ipAddress?: string; requestId?: string },
  ): Promise<IssuedApiToken> {
    return this.tokens.rotate(
      this.tokenActor(principal, context),
      principal.apiClientId,
      tokenId,
      input,
    );
  }

  /** Always possible: an organisation can stop a leaked token even when suspended. */
  revokeToken(
    principal: PortalPrincipal,
    tokenId: string,
    input: RevokeApiTokenInput,
    context: { ipAddress?: string; requestId?: string },
  ): Promise<ApiTokenSummary> {
    return this.tokens.revoke(
      this.tokenActor(principal, context),
      principal.apiClientId,
      tokenId,
      input,
    );
  }

  // --- Its own password ---------------------------------------------------------

  async changePassword(
    principal: PortalPrincipal,
    input: PortalChangePasswordInput,
    context: { ipAddress?: string; requestId?: string },
  ): Promise<void> {
    const row = await this.prisma.portalAccount.findUniqueOrThrow({
      where: { id: principal.accountId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(input.currentPassword, row.passwordHash))) {
      throw new ValidationException([
        { field: 'currentPassword', message: 'Incorrect password.' },
      ]);
    }
    const problems = passwordProblems(input.newPassword, {
      email: principal.email,
      fullName: principal.fullName,
    });
    if (input.newPassword === input.currentPassword) {
      problems.push('Choose a password different from the current one.');
    }
    if (problems.length > 0) {
      throw new ValidationException(
        problems.map((message) => ({ field: 'newPassword', message })),
      );
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.portalAccount.update({
        where: { id: principal.accountId },
        data: { passwordHash, mustChangePassword: false },
      });
      await this.audit.record(
        {
          action: 'portal_account.password_change',
          subjectType: 'portal_account',
          subjectId: principal.accountId,
          actorApiClientId: principal.apiClientId,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        },
        tx,
      );
    });
    // Whoever else was signed in with the old password is signed out.
    await this.sessions.revokeOthers(principal.accountId, principal.sessionId);
  }

  // --- The administrator's side -------------------------------------------------

  /**
   * Gives an organisation an officer registered its portal account, on a
   * temporary password shown once. One account per organisation.
   */
  async createAccount(
    actor: ActorContext,
    clientId: string,
    input: CreatePortalAccountInput,
  ): Promise<IssuedPortalPassword> {
    const client = await this.prisma.apiClient.findUnique({
      where: { id: clientId },
      select: { status: true, portalAccount: { select: { id: true } } },
    });
    if (!client) {
      throw new NotFoundException();
    }
    if (client.portalAccount) {
      throw new ConflictException('The organisation already has an account.');
    }
    if (client.status === 'REVOKED') {
      throw new ConflictException('A revoked organisation is given none.');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.portalAccount.create({
          data: {
            apiClientId: clientId,
            email: input.email,
            fullName: input.fullName,
            passwordHash,
            mustChangePassword: true,
          },
          select: PORTAL_ACCOUNT_SELECT,
        });
        await this.audit.record(
          {
            action: 'portal_account.create',
            subjectType: 'portal_account',
            subjectId: created.id,
            actorUserId: actor.userId,
            after: { apiClientId: clientId, email: input.email },
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
          },
          tx,
        );
        return created;
      });
      return {
        account: toPortalAccountSummary(row, new Date()),
        temporaryPassword,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('That address already holds an account.');
      }
      throw error;
    }
  }

  /**
   * A new temporary password, for an organisation that has forgotten its own
   * or locked itself out. It signs every session out and lifts any lock.
   */
  async resetPassword(
    actor: ActorContext,
    clientId: string,
    reason: string,
  ): Promise<IssuedPortalPassword> {
    const account = await this.prisma.portalAccount.findUnique({
      where: { apiClientId: clientId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException();
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.portalAccount.update({
        where: { id: account.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedSignInCount: 0,
          signInLockedUntil: null,
        },
        select: PORTAL_ACCOUNT_SELECT,
      });
      await tx.portalSession.updateMany({
        where: { portalAccountId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'portal_account.password_reset',
          subjectType: 'portal_account',
          subjectId: account.id,
          actorUserId: actor.userId,
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return updated;
    });
    return {
      account: toPortalAccountSummary(row, new Date()),
      temporaryPassword,
    };
  }

  // --- Applications nobody approved ---------------------------------------------

  /**
   * Lapses each self-application left unapproved past its time (EXT-20). The
   * organisation's row is kept, `REVOKED`, with the reason. Its account is
   * removed, so the applicant can apply again with the same address.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const days = await this.expiryDays();
    const expired = await this.prisma.apiClient.findMany({
      where: {
        selfRegistered: true,
        status: 'PENDING',
        createdAt: { lte: new Date(now.getTime() - days * DAY_MS) },
      },
      select: { id: true },
    });
    let lapsed = 0;
    for (const { id } of expired) {
      const done = await this.prisma.$transaction(async (tx) => {
        await this.clients.lock(tx, id);
        const changed = await tx.apiClient.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'REVOKED',
            statusChangedAt: now,
            statusReason: `Not approved within ${days} days of applying.`,
          },
        });
        if (changed.count === 0) {
          // Decided by an administrator a moment ago.
          return false;
        }
        await tx.portalAccount.deleteMany({ where: { apiClientId: id } });
        await this.audit.record(
          {
            action: 'api_client.application_expired',
            subjectType: 'api_client',
            subjectId: id,
            before: { status: 'PENDING' },
            after: { status: 'REVOKED', expiryDays: days },
          },
          tx,
        );
        return true;
      });
      lapsed += done ? 1 : 0;
    }
    return lapsed;
  }

  // --- Internals ----------------------------------------------------------------

  expiryDays(): Promise<number> {
    return this.settings.getPositiveInteger(
      PORTAL_APPLICATION_EXPIRY_DAYS,
      EXPIRY_DAYS_FALLBACK,
    );
  }

  private tokenActor(
    principal: PortalPrincipal,
    context: { ipAddress?: string; requestId?: string },
  ): TokenActor {
    return {
      userId: null,
      portalAccountId: principal.accountId,
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
    };
  }

  /** Recorded without the address: it belongs to somebody who did not apply. */
  private async recordDuplicate(context: {
    ipAddress?: string;
    requestId?: string;
  }): Promise<void> {
    await this.audit.record({
      action: 'api_client.apply_duplicate',
      subjectType: 'api_client',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }

  /** As for officers (Requirement 17.4): a temporary lock, audited. */
  private async recordFailure(
    account: { id: string; apiClientId: string; failedSignInCount: number },
    context: { ipAddress?: string },
    now: Date,
  ): Promise<void> {
    const [threshold, minutes] = await Promise.all([
      this.settings.getPositiveInteger(
        AUTH_LOCKOUT_THRESHOLD,
        DEFAULT_LOCKOUT_THRESHOLD,
      ),
      this.settings.getPositiveInteger(
        AUTH_LOCKOUT_MINUTES,
        DEFAULT_LOCKOUT_MINUTES,
      ),
    ]);
    if (account.failedSignInCount + 1 < threshold) {
      await this.prisma.portalAccount.update({
        where: { id: account.id },
        data: { failedSignInCount: { increment: 1 } },
      });
      return;
    }
    const until = new Date(now.getTime() + minutes * 60_000);
    await this.prisma.portalAccount.update({
      where: { id: account.id },
      data: { failedSignInCount: 0, signInLockedUntil: until },
    });
    await this.audit.record({
      action: 'portal_account.lockout',
      subjectType: 'portal_account',
      subjectId: account.id,
      after: { lockedUntil: until.toISOString() },
      ipAddress: context.ipAddress ?? null,
    });
  }
}

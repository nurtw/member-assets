import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { SecondFactorRequiredException } from '../common/second-factor.exception.js';
import { loadEnvironment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AUTH_LOCKOUT_MINUTES,
  AUTH_LOCKOUT_THRESHOLD,
  SettingsService,
} from '../settings/settings.service.js';
import { PasswordService } from './password.service.js';
import { SessionService, type IssuedSession } from './session.service.js';
import {
  decryptSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  verifyTotp,
} from './totp.js';

/** Fallbacks where the lockout settings are absent. */
const DEFAULT_LOCKOUT_THRESHOLD = 10;
const DEFAULT_LOCKOUT_MINUTES = 15;

/**
 * Internal user authentication.
 *
 * ARCHITECTURE.md Decision 9.1 — separate from external client authentication,
 * with a separate credential store. A session must never authenticate an API
 * call, and an API token must never authenticate a dashboard session.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verifies credentials and issues a session.
   *
   * Failure is always the same `UnauthorizedException`, whether the account does
   * not exist, the password is wrong, the account is deactivated, or it is
   * locked. Anything more specific turns the login form into an
   * account-enumeration oracle — "no such user" confirms which union officials
   * hold accounts.
   *
   * A password verification runs even when the account is absent or locked, so
   * the response time does not distinguish them. Without it, an attacker can
   * enumerate accounts by timing alone regardless of what the message says.
   *
   * **The second factor (item 28).** Where the account has one, the code is
   * asked for only once the password is accepted, and a session issued then
   * is marked as having proved it. A wrong code counts toward the lock, as a
   * wrong password does: six digits are only as strong as the limit on
   * guessing them.
   */
  async login(
    email: string,
    password: string,
    code: string | undefined,
    context: { ipAddress?: string; userAgent?: string } = {},
    now: Date = new Date(),
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        passwordHash: true,
        isActive: true,
        mfaSecret: true,
        mfaEnabledAt: true,
        mfaLastStep: true,
        failedSignInCount: true,
        signInLockedUntil: true,
      },
    });

    if (!user) {
      await this.burnTime(password);
      this.logger.warn(
        `Failed login for unknown account from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }

    const valid = await this.passwords.verify(password, user.passwordHash);
    const locked =
      user.signInLockedUntil !== null && user.signInLockedUntil > now;
    if (locked) {
      // Verified above for the timing alone. A locked account refuses even the
      // right password, or the lock would only slow down a wrong one.
      this.logger.warn(
        `Login refused for locked user ${user.id} from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }
    if (!valid || !user.isActive) {
      if (user.isActive) {
        await this.recordFailure(user.id, user.failedSignInCount, context, now);
      }
      this.logger.warn(
        `Failed login for user ${user.id} from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }

    const enrolled = user.mfaEnabledAt !== null && user.mfaSecret !== null;
    if (enrolled) {
      if (!code) {
        throw new SecondFactorRequiredException([
          {
            field: 'code',
            message: 'Enter the code from your authenticator app.',
          },
        ]);
      }
      const accepted = await this.verifySecondFactor(
        {
          id: user.id,
          mfaSecret: user.mfaSecret!,
          mfaLastStep: user.mfaLastStep,
        },
        code,
        context,
        now,
      );
      if (!accepted) {
        await this.recordFailure(user.id, user.failedSignInCount, context, now);
        this.logger.warn(
          `Second factor refused for user ${user.id} from ${context.ipAddress ?? 'unknown'}`,
        );
        throw new SecondFactorRequiredException([
          { field: 'code', message: 'That code was not accepted.' },
        ]);
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedSignInCount: 0,
        signInLockedUntil: null,
        // Transparent upgrade when cost parameters have since been raised.
        ...(this.passwords.needsRehash(user.passwordHash)
          ? { passwordHash: await this.passwords.hash(password) }
          : {}),
      },
    });

    return this.sessions.issue(user.id, {
      ...context,
      secondFactorVerified: enrolled,
    });
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }

  /**
   * Checks an authenticator code or a recovery code against an account.
   *
   * A time step is accepted once: the update is conditional, so two requests
   * carrying the same code cannot both pass. A recovery code is spent the
   * same way, and its use is audited, since it means a phone was not to hand.
   */
  async verifySecondFactor(
    user: { id: string; mfaSecret: string; mfaLastStep: bigint | null },
    code: string,
    context: { ipAddress?: string },
    now: Date = new Date(),
  ): Promise<boolean> {
    if (looksLikeRecoveryCode(code)) {
      const spent = await this.prisma.userRecoveryCode.updateMany({
        where: {
          userId: user.id,
          codeHash: hashRecoveryCode(code),
          usedAt: null,
        },
        data: { usedAt: now },
      });
      if (spent.count !== 1) {
        return false;
      }
      const left = await this.prisma.userRecoveryCode.count({
        where: { userId: user.id, usedAt: null },
      });
      await this.audit.record({
        action: 'auth.recovery_code_used',
        subjectType: 'user',
        subjectId: user.id,
        actorUserId: user.id,
        after: { recoveryCodesLeft: left },
        ipAddress: context.ipAddress ?? null,
      });
      return true;
    }

    const step = verifyTotp(
      decryptSecret(user.mfaSecret, this.encryptionKey()),
      code,
      now,
      user.mfaLastStep === null ? null : Number(user.mfaLastStep),
    );
    if (step === null) {
      return false;
    }
    const claimed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: BigInt(step) } }],
      },
      data: { mfaLastStep: BigInt(step) },
    });
    return claimed.count === 1;
  }

  /**
   * The key second-factor secrets are encrypted under. Its absence is a
   * configuration fault, answered 503: never a reason to accept a sign-in
   * without the factor, or to store a secret in the clear.
   */
  encryptionKey(): string {
    const key = loadEnvironment().mfaEncryptionKey;
    if (!key) {
      throw new ServiceUnavailableException(
        'The second factor is unavailable: MFA_ENCRYPTION_KEY is not configured.',
      );
    }
    return key;
  }

  /**
   * Counts a failed sign-in, and locks the account at the threshold. The lock
   * is temporary and lifts itself, so it cannot be used to shut an officer
   * out for good. It is audited, since somebody was guessing.
   */
  private async recordFailure(
    userId: string,
    before: number,
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
    const count = before + 1;
    if (count < threshold) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedSignInCount: { increment: 1 } },
      });
      return;
    }
    const until = new Date(now.getTime() + minutes * 60_000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedSignInCount: 0, signInLockedUntil: until },
    });
    await this.audit.record({
      action: 'auth.lockout',
      subjectType: 'user',
      subjectId: userId,
      after: { lockedUntil: until.toISOString(), failedSignIns: count },
      ipAddress: context.ipAddress ?? null,
    });
  }

  /**
   * Spends comparable time to a real verification, so an absent account is not
   * detectable by response time. The result is discarded.
   */
  private async burnTime(password: string): Promise<void> {
    const decoy = await this.passwords.hash('decoy');
    await this.passwords.verify(password, decoy);
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccountState,
  ChangePasswordInput,
  SecondFactorConfirmed,
  SecondFactorEnrolment,
} from '@nurtw/contracts';
import { needsSecondFactor, passwordProblems } from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AUTH_MFA_ENFORCED,
  SettingsService,
} from '../settings/settings.service.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { PermissionService } from './permission.service.js';
import { SessionService, type SessionUser } from './session.service.js';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.js';

/**
 * An officer's own account (item 28): their password and their second
 * factor. Every method acts on the signed-in officer and nobody else, so
 * none takes a user id from the request.
 *
 * Nothing here returns a password or a stored secret. The second-factor
 * secret and the recovery codes are each returned once, at the moment they
 * are made, to the officer they belong to.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /** What the dashboard needs to know to send the officer the right way. */
  async state(user: SessionUser): Promise<AccountState> {
    const [row, held, enforced] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { mfaEnabledAt: true },
      }),
      this.permissions.listFor(user.id),
      this.settings.isEnabled(AUTH_MFA_ENFORCED),
    ]);
    return {
      mustChangePassword: user.mustChangePassword,
      secondFactor: {
        enrolled: row.mfaEnabledAt !== null,
        verified: user.secondFactorVerified,
        required:
          enforced && held.some((entry) => needsSecondFactor(entry.permission)),
      },
    };
  }

  /**
   * Changes the officer's own password. The current one is asked for even on
   * a temporary password, so a session left open on a shared machine cannot
   * be turned into a takeover. Every other session of theirs is ended.
   */
  async changePassword(
    user: SessionUser,
    input: ChangePasswordInput,
    ipAddress: string | null,
  ): Promise<void> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (
      !(await this.passwords.verify(input.currentPassword, row.passwordHash))
    ) {
      throw new UnauthorizedException();
    }
    const problems = passwordProblems(input.newPassword, user);
    if (input.newPassword === input.currentPassword) {
      problems.push('Choose a password different from the current one.');
    }
    if (problems.length > 0) {
      throw new ValidationException(
        problems.map((message) => ({ field: 'newPassword', message })),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await this.passwords.hash(input.newPassword),
          mustChangePassword: false,
        },
      });
      await this.audit.record(
        {
          action: 'auth.password_change',
          subjectType: 'user',
          subjectId: user.id,
          actorUserId: user.id,
          after: { wasTemporary: user.mustChangePassword },
          ipAddress,
        },
        tx,
      );
    });
    await this.sessions.revokeOthers(user.id, user.sessionId);
  }

  /**
   * Starts setting up an authenticator app. The secret is held pending and
   * replaces nothing until a code confirms it, so a half-finished change of
   * phone leaves the old factor working.
   *
   * An officer who already has a factor must have proved it in this session
   * before replacing it. Otherwise a stolen password would be enough to move
   * the second factor to the thief's phone.
   */
  async enrol(user: SessionUser): Promise<SecondFactorEnrolment> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaEnabledAt: true },
    });
    if (row.mfaEnabledAt !== null && !user.secondFactorVerified) {
      throw new ForbiddenException();
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaPendingSecret: encryptSecret(secret, this.auth.encryptionKey()),
      },
    });
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  /**
   * Confirms the pending secret with a code from the app, making it the
   * officer's second factor and marking this session as having proved it.
   * Fresh recovery codes replace any earlier ones.
   */
  async confirm(
    user: SessionUser,
    code: string,
    ipAddress: string | null,
    now: Date = new Date(),
  ): Promise<SecondFactorConfirmed> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaPendingSecret: true, mfaEnabledAt: true },
    });
    if (row.mfaPendingSecret === null) {
      throw new ConflictException('No second factor is being set up.');
    }
    const key = this.auth.encryptionKey();
    const step = verifyTotp(
      decryptSecret(row.mfaPendingSecret, key),
      code,
      now,
      null,
    );
    if (step === null) {
      throw new ValidationException([
        { field: 'code', message: 'That code was not accepted.' },
      ]);
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          mfaSecret: row.mfaPendingSecret,
          mfaPendingSecret: null,
          mfaEnabledAt: now,
          mfaLastStep: BigInt(step),
        },
      });
      await tx.userRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.userRecoveryCode.createMany({
        data: recoveryCodes.map((value) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(value),
        })),
      });
      await tx.userSession.update({
        where: { id: user.sessionId },
        data: { mfaVerifiedAt: now },
      });
      await this.audit.record(
        {
          action:
            row.mfaEnabledAt === null
              ? 'auth.second_factor_enrol'
              : 'auth.second_factor_replace',
          subjectType: 'user',
          subjectId: user.id,
          actorUserId: user.id,
          ipAddress,
        },
        tx,
      );
    });
    await this.sessions.revokeOthers(user.id, user.sessionId);
    return { recoveryCodes };
  }

  /**
   * Proves the second factor for a session that signed in before the officer
   * enrolled, or before a privileged permission was given to them.
   */
  async verify(
    user: SessionUser,
    code: string,
    ipAddress: string | null,
  ): Promise<void> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaSecret: true, mfaEnabledAt: true, mfaLastStep: true },
    });
    if (row.mfaEnabledAt === null || row.mfaSecret === null) {
      throw new ConflictException('No second factor is set up.');
    }
    const accepted = await this.auth.verifySecondFactor(
      { id: user.id, mfaSecret: row.mfaSecret, mfaLastStep: row.mfaLastStep },
      code,
      { ipAddress: ipAddress ?? undefined },
    );
    if (!accepted) {
      throw new ValidationException([
        { field: 'code', message: 'That code was not accepted.' },
      ]);
    }
    await this.sessions.markSecondFactor(user.sessionId);
  }

  /** Replaces the recovery codes. Needs a session that has proved the factor. */
  async regenerateRecoveryCodes(
    user: SessionUser,
    ipAddress: string | null,
  ): Promise<SecondFactorConfirmed> {
    if (!user.secondFactorVerified) {
      throw new ForbiddenException();
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.userRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.userRecoveryCode.createMany({
        data: recoveryCodes.map((value) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(value),
        })),
      });
      await this.audit.record(
        {
          action: 'auth.recovery_codes_replace',
          subjectType: 'user',
          subjectId: user.id,
          actorUserId: user.id,
          ipAddress,
        },
        tx,
      );
    });
    return { recoveryCodes };
  }
}

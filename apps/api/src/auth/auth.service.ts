import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import { SessionService, type IssuedSession } from './session.service.js';

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
  ) {}

  /**
   * Verifies credentials and issues a session.
   *
   * Failure is always the same `UnauthorizedException`, whether the account does
   * not exist, the password is wrong, or the account is deactivated. Anything
   * more specific turns the login form into an account-enumeration oracle —
   * "no such user" confirms which union officials hold accounts.
   *
   * A password verification runs even when the account is absent, so the
   * response time does not distinguish the two. Without it, an attacker can
   * enumerate accounts by timing alone regardless of what the message says.
   */
  async login(
    email: string,
    password: string,
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, passwordHash: true, isActive: true },
    });

    if (!user) {
      await this.burnTime(password);
      this.logger.warn(
        `Failed login for unknown account from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }

    const valid = await this.passwords.verify(password, user.passwordHash);
    if (!valid || !user.isActive) {
      this.logger.warn(
        `Failed login for user ${user.id} from ${context.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException();
    }

    // Transparent upgrade when cost parameters have since been raised.
    if (this.passwords.needsRehash(user.passwordHash)) {
      const rehashed = await this.passwords.hash(password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: rehashed },
      });
    }

    return this.sessions.issue(user.id, context);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
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

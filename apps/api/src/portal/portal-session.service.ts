import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { HousekeepingService } from '../housekeeping/housekeeping.service.js';
import { purgeInBatches } from '../housekeeping/purge.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PortalPrincipal } from './portal-account.decorator.js';

const TOKEN_BYTES = 32;
const LIFETIME_HOURS = 12;

/** How long an expired session's row is kept before it is deleted. */
const EXPIRED_SESSION_KEPT_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedPortalSession {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Sessions for the organisation portal (item 29).
 *
 * The same design as officers' sessions, in tables of their own: an opaque
 * token, stored as SHA-256, checked on every request, so revoking one or
 * deactivating the account takes effect at once. Nothing here can produce a
 * `SessionUser`, which is what every officer route asks for.
 */
@Injectable()
export class PortalSessionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly housekeeping: HousekeepingService,
  ) {}

  onModuleInit(): void {
    // Purged with the other housekeeping. Suites call `prune()` themselves.
    this.housekeeping.register('portal-session.prune', () => this.prune());
  }

  /** Deletes sessions that expired more than a month ago, as officers' are. */
  async prune(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - EXPIRED_SESSION_KEPT_MS);
    return purgeInBatches(
      (take) =>
        this.prisma.portalSession.findMany({
          where: { expiresAt: { lt: cutoff } },
          select: { id: true },
          take,
        }),
      (ids) =>
        this.prisma.portalSession.deleteMany({ where: { id: { in: ids } } }),
    );
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    portalAccountId: string,
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<IssuedPortalSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + LIFETIME_HOURS * 60 * 60 * 1000);
    await this.prisma.portalSession.create({
      data: {
        portalAccountId,
        tokenHash: this.hash(token),
        expiresAt,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return { token, expiresAt };
  }

  async resolve(token: string): Promise<PortalPrincipal | null> {
    if (token.length === 0) {
      return null;
    }
    const session = await this.prisma.portalSession.findUnique({
      where: { tokenHash: this.hash(token) },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        account: {
          select: {
            id: true,
            apiClientId: true,
            email: true,
            fullName: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.account.isActive
    ) {
      return null;
    }
    return {
      accountId: session.account.id,
      apiClientId: session.account.apiClientId,
      email: session.account.email,
      fullName: session.account.fullName,
      sessionId: session.id,
      mustChangePassword: session.account.mustChangePassword,
    };
  }

  async revoke(token: string): Promise<void> {
    if (token.length === 0) {
      return;
    }
    await this.prisma.portalSession.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Signs the account out everywhere, but for the session that asked. */
  async revokeOthers(portalAccountId: string, keepSessionId: string | null) {
    await this.prisma.portalSession.updateMany({
      where: {
        portalAccountId,
        revokedAt: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}

/**
 * On its own, so `AuthModule` can import it for the guard without importing
 * the portal's controllers, which themselves need `AuthModule`.
 */
@Module({
  providers: [PortalSessionService],
  exports: [PortalSessionService],
})
export class PortalSessionModule {}

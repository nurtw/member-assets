import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Opaque server-side sessions.
 *
 * ARCHITECTURE.md Decision 9.1 describes internal access as a *session*, and
 * that word is load-bearing: revocation must take effect on the very next
 * request. A signed JWT cannot do that without a denylist, which reintroduces
 * the lookup the JWT was meant to avoid while leaving a window in which a
 * dismissed officer's token still works. For a system whose whole purpose is
 * controlled access to member data, that window is not acceptable.
 *
 * The token is random and opaque — it carries no claims. Everything about the
 * user is read fresh from the database on each request, so a role change or a
 * permission revocation applies immediately rather than at next login.
 *
 * Only the SHA-256 of the token is stored. A leaked backup must not yield usable
 * credentials, the same reasoning that hashes API tokens at PRD §12.1. SHA-256
 * rather than a slow KDF is correct here: the token is 256 bits of entropy from
 * a CSPRNG, so there is no dictionary to attack and no need to slow lookups.
 */

/** Session token length in bytes. 32 bytes = 256 bits. */
const TOKEN_BYTES = 32;

const DEFAULT_LIFETIME_HOURS = 12;

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

export interface IssuedSession {
  /** Plaintext token. Returned once, to be set as a cookie. Never stored. */
  readonly token: string;
  readonly expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    userId: string,
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<IssuedSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(
      Date.now() + DEFAULT_LIFETIME_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Resolves a token to its user, or null.
   *
   * Returns null uniformly for unknown, expired, revoked, and deactivated —
   * the caller cannot distinguish them, and does not need to.
   */
  async resolve(token: string): Promise<SessionUser | null> {
    if (token.length === 0) {
      return null;
    }

    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: this.hash(token) },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, isActive: true },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    // A deactivated account's existing sessions stop working immediately, rather
    // than lingering until they expire.
    if (!session.user.isActive) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
    };
  }

  /** Revokes one session. Effective on the next request. */
  async revoke(token: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes every session for a user — used when an account is deactivated, a
   * password changes, or a compromise is suspected.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Constant-time comparison helper for callers that need to compare two tokens
   * directly. Exposed so no caller reaches for `===` on a secret.
   */
  static tokensMatch(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    return timingSafeEqual(bufferA, bufferB);
  }
}

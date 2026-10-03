import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  apiTokenState,
  canApiClientAuthenticate,
  ipInRanges,
  type StoredApiClientStatus,
} from '@nurtw/domain';

import type { AuthenticatedApiClient } from '../auth/require-scope.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ApiRequestLogService,
  type ApiDenial,
} from './api-request-log.service.js';
import {
  bearerToken,
  hashApiToken,
  isWellFormedApiToken,
} from './api-token.js';

/** What the guard knows of a request before any route has run. */
export interface ExternalRequestContext {
  /** The `Authorization` header, as sent. */
  authorization: string | undefined;
  ipAddress: string | undefined;
  /** The method and the route pattern, for the access log. */
  endpoint: string;
  requestId: string;
}

/** `lastUsedAt` is written at most this often per token. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Authenticates an external request (ARCHITECTURE.md Decisions 9.1 and 9.8 —
 * item 11).
 *
 * A separate mechanism from sessions, with a separate store. Everything is
 * read on each request, never cached, for the reason sessions are opaque:
 * revoking a token, suspending its organisation, or narrowing its scopes must
 * hold on the very next request (acceptance criterion 11).
 *
 * **Every refusal a credential can cause answers the same 401.** An unknown
 * token, a revoked one, an expired one, a suspended organisation, and a call
 * from an address outside the allowed ranges are indistinguishable to the
 * caller, so a stolen token cannot be probed for which control stopped it. The
 * reason is recorded in the access log. Only a valid credential asking for a
 * scope it does not hold answers 403.
 */
@Injectable()
export class ApiClientAuthService {
  private readonly logger = new Logger(ApiClientAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: ApiRequestLogService,
  ) {}

  async authenticate(
    context: ExternalRequestContext,
    scope: string,
    now: Date = new Date(),
  ): Promise<AuthenticatedApiClient> {
    const token = bearerToken(context.authorization);
    if (token === null) {
      return this.deny(context, scope, 'NO_TOKEN');
    }
    // Refused on its form alone, so nothing that is plainly not a token is
    // ever hashed and looked up.
    if (!isWellFormedApiToken(token)) {
      return this.deny(context, scope, 'MALFORMED_TOKEN');
    }

    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashApiToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        retiresAt: true,
        lastUsedAt: true,
        client: {
          select: {
            id: true,
            organisationName: true,
            status: true,
            allowedIpRanges: true,
            scopes: { select: { scope: true } },
            disclosureProfile: {
              select: { id: true, fields: { select: { fieldPath: true } } },
            },
          },
        },
      },
    });
    if (!row) {
      return this.deny(context, scope, 'UNKNOWN_TOKEN');
    }

    const known = { clientId: row.client.id, tokenId: row.id };
    const state = apiTokenState(row, now);
    if (state === 'REVOKED') {
      return this.deny(context, scope, 'TOKEN_REVOKED', known);
    }
    if (state === 'REPLACED') {
      return this.deny(context, scope, 'TOKEN_REPLACED', known);
    }
    if (state === 'EXPIRED') {
      return this.deny(context, scope, 'TOKEN_EXPIRED', known);
    }
    if (!canApiClientAuthenticate(row.client.status as StoredApiClientStatus)) {
      return this.deny(context, scope, 'CLIENT_NOT_ACTIVE', known);
    }
    // An empty list means any address. A list that is not empty is exact: an
    // address that cannot be read is in no range.
    if (
      row.client.allowedIpRanges.length > 0 &&
      !ipInRanges(context.ipAddress ?? '', row.client.allowedIpRanges)
    ) {
      return this.deny(context, scope, 'ADDRESS_NOT_ALLOWED', known);
    }

    const scopes = row.client.scopes.map((granted) => granted.scope);
    if (!scopes.includes(scope)) {
      return this.deny(context, scope, 'SCOPE_DENIED', known);
    }

    await this.touch(row.id, row.lastUsedAt, now);

    return {
      clientId: row.client.id,
      tokenId: row.id,
      organisationName: row.client.organisationName,
      scopes,
      disclosureProfileId: row.client.disclosureProfile?.id ?? null,
      permittedFields:
        row.client.disclosureProfile?.fields.map((field) => field.fieldPath) ??
        [],
    };
  }

  /**
   * Notes that a token was used, to the minute. The condition is repeated in
   * the update, so a burst of requests writes once.
   *
   * A failure here is logged and not raised: an organisation must not be
   * refused because a usage timestamp could not be written.
   */
  private async touch(
    tokenId: string,
    lastUsedAt: Date | null,
    now: Date,
  ): Promise<void> {
    const stale = new Date(now.getTime() - LAST_USED_RESOLUTION_MS);
    if (lastUsedAt !== null && lastUsedAt.getTime() > stale.getTime()) {
      return;
    }
    try {
      await this.prisma.apiToken.updateMany({
        where: {
          id: tokenId,
          OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: stale } }],
        },
        data: { lastUsedAt: now },
      });
    } catch (error) {
      this.logger.warn(`Token ${tokenId} use not recorded: ${String(error)}`);
    }
  }

  /** Records the refusal, then refuses. Never returns. */
  private async deny(
    context: ExternalRequestContext,
    scope: string,
    denial: ApiDenial,
    known: { clientId: string; tokenId: string } | null = null,
  ): Promise<never> {
    const statusCode = denial === 'SCOPE_DENIED' ? 403 : 401;
    await this.requests.record({
      requestId: context.requestId,
      endpoint: context.endpoint,
      scope,
      resultClass: denial,
      statusCode,
      clientId: known?.clientId ?? null,
      tokenId: known?.tokenId ?? null,
      ipAddress: context.ipAddress ?? null,
    });
    // The token is not in this line and never may be (Requirement 12.2).
    this.logger.warn(
      `${context.endpoint} refused: ${denial} client=${known?.clientId ?? '-'} ` +
        `token=${known?.tokenId ?? '-'} [${context.requestId}]`,
    );
    throw statusCode === 403
      ? new ForbiddenException()
      : new UnauthorizedException();
  }
}

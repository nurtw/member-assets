import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  type ApiTokenSummary,
  type IssuedApiToken,
  type RevokeApiTokenInput,
  type RotateApiTokenInput,
} from '@nurtw/contracts';
import { apiTokenState, retirementFor } from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  API_TOKEN_EXPIRY_DAYS,
  SettingsService,
} from '../settings/settings.service.js';
import {
  ApiClientService,
  TOKEN_SELECT,
  toTokenSummary,
} from './api-client.service.js';
import { generateApiToken } from './api-token.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Who is acting on a token. An officer holding `api_token.manage`, or the
 * organisation itself through its portal account (item 29, EXT-20), which may
 * act on its own tokens and no other's. Exactly one of the two is set.
 */
export interface TokenActor {
  userId: string | null;
  portalAccountId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
}

/** Who the audit trail names: the officer, or the organisation. */
function auditActor(actor: TokenActor, clientId: string) {
  return actor.userId
    ? { actorUserId: actor.userId }
    : { actorUserId: null, actorApiClientId: clientId };
}

/** Recorded with an organisation's own act, so the account is named too. */
function viaPortal(actor: TokenActor) {
  return actor.portalAccountId
    ? { portalAccountId: actor.portalAccountId }
    : {};
}

/**
 * Issuing, rotating, and revoking tokens (PRD Requirements 12.1, 12.2, 12.6,
 * 12.10 — item 11).
 *
 * - **A token is returned once**, in the response to the request that created
 *   it. Only its SHA-256 and its prefix are stored. Neither the token nor its
 *   hash is ever selected for a response, logged, or put in an audit event.
 * - **An organisation holds one token in use.** Issuing is refused while one
 *   is current; replacing it is rotation, which keeps the old one working for
 *   the overlap the officer chose and no longer.
 * - **Revocation is immediate.** It is a row change read on the next request
 *   (acceptance criterion 11).
 *
 * Each method takes the client's lock, so two requests cannot both find no
 * token in use and issue one each.
 */
@Injectable()
export class ApiTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly clients: ApiClientService,
  ) {}

  async issue(actor: TokenActor, clientId: string): Promise<IssuedApiToken> {
    const now = new Date();
    const [expiresAt, reminderDays] = await Promise.all([
      this.expiryFrom(now),
      this.clients.reminderDays(),
    ]);

    return this.prisma.$transaction(async (tx) => {
      await this.clients.lock(tx, clientId);
      const client = await tx.apiClient.findUnique({
        where: { id: clientId },
        select: {
          status: true,
          agreementReference: true,
          tokens: { select: TOKEN_SELECT },
        },
      });
      if (!client) {
        throw new NotFoundException();
      }
      // Approval is the only way to `ACTIVE`, and approval records the
      // agreement. The second half is checked all the same: a credential must
      // never exist for an organisation with no agreement on record
      // (Requirement 12.8), however its row came to say so.
      if (client.status !== 'ACTIVE' || !client.agreementReference) {
        throw new ConflictException(
          'A token is issued only to an approved, active client.',
        );
      }
      if (
        client.tokens.some((token) => apiTokenState(token, now) === 'CURRENT')
      ) {
        throw new ConflictException(
          'The client has a token in use. Rotate it instead.',
        );
      }

      const generated = generateApiToken();
      const row = await tx.apiToken.create({
        data: {
          clientId,
          tokenHash: generated.hash,
          tokenPrefix: generated.prefix,
          expiresAt,
          createdByUserId: actor.userId,
        },
        select: TOKEN_SELECT,
      });

      await this.audit.record(
        {
          action: 'api_token.issue',
          subjectType: 'api_token',
          subjectId: row.id,
          ...auditActor(actor, clientId),
          after: {
            clientId,
            prefix: generated.prefix,
            expiresAt: expiresAt.toISOString(),
            ...viaPortal(actor),
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return {
        token: generated.token,
        summary: toTokenSummary(row, now, reminderDays),
      };
    });
  }

  /**
   * Replaces the token in use. The new one starts a full term; the old one is
   * accepted until `retiresAt`, which is never later than its own expiry.
   */
  async rotate(
    actor: TokenActor,
    clientId: string,
    tokenId: string,
    input: RotateApiTokenInput,
  ): Promise<IssuedApiToken> {
    const now = new Date();
    const [expiresAt, reminderDays] = await Promise.all([
      this.expiryFrom(now),
      this.clients.reminderDays(),
    ]);

    return this.prisma.$transaction(async (tx) => {
      await this.clients.lock(tx, clientId);
      const old = await tx.apiToken.findFirst({
        where: { id: tokenId, clientId },
        select: { ...TOKEN_SELECT, client: { select: { status: true } } },
      });
      if (!old) {
        throw new NotFoundException();
      }
      if (old.client.status !== 'ACTIVE') {
        throw new ConflictException(
          'A token is rotated only for an active client.',
        );
      }
      // Only the token in use is replaced. One that has stopped is not
      // brought back by rotating it; a new token is issued instead.
      if (apiTokenState(old, now) !== 'CURRENT') {
        throw new ConflictException('Only the token in use can be rotated.');
      }

      const retiresAt = retirementFor(input.overlap, now, old.expiresAt);
      await tx.apiToken.update({
        where: { id: old.id },
        data: { retiresAt },
      });

      const generated = generateApiToken();
      const row = await tx.apiToken.create({
        data: {
          clientId,
          tokenHash: generated.hash,
          tokenPrefix: generated.prefix,
          expiresAt,
          createdByUserId: actor.userId,
          rotatedFromTokenId: old.id,
        },
        select: TOKEN_SELECT,
      });

      await this.audit.record(
        {
          action: 'api_token.rotate',
          subjectType: 'api_token',
          subjectId: row.id,
          ...auditActor(actor, clientId),
          before: {
            tokenId: old.id,
            prefix: old.tokenPrefix,
            expiresAt: old.expiresAt.toISOString(),
          },
          after: {
            clientId,
            prefix: generated.prefix,
            expiresAt: expiresAt.toISOString(),
            overlap: input.overlap,
            replacedTokenRetiresAt: retiresAt.toISOString(),
            ...viaPortal(actor),
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return {
        token: generated.token,
        summary: toTokenSummary(row, now, reminderDays),
      };
    });
  }

  /**
   * Withdraws one token, at once. Any token not yet revoked can be: the one
   * in use, or one still running out its overlap after a rotation.
   */
  async revoke(
    actor: TokenActor,
    clientId: string,
    tokenId: string,
    input: RevokeApiTokenInput,
  ): Promise<ApiTokenSummary> {
    const now = new Date();
    const reminderDays = await this.clients.reminderDays();

    return this.prisma.$transaction(async (tx) => {
      await this.clients.lock(tx, clientId);
      const before = await tx.apiToken.findFirst({
        where: { id: tokenId, clientId },
        select: TOKEN_SELECT,
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (before.revokedAt !== null) {
        throw new ConflictException('That token is already revoked.');
      }

      const row = await tx.apiToken.update({
        where: { id: tokenId },
        data: { revokedAt: now },
        select: TOKEN_SELECT,
      });

      await this.audit.record(
        {
          action: 'api_token.revoke',
          subjectType: 'api_token',
          subjectId: tokenId,
          ...auditActor(actor, clientId),
          before: {
            clientId,
            prefix: before.tokenPrefix,
            state: apiTokenState(before, now),
          },
          after: { state: 'REVOKED', ...viaPortal(actor) },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return toTokenSummary(row, now, reminderDays);
    });
  }

  /** Requirement 12.6 — 90 days, from the `api_token.expiry_days` setting. */
  private async expiryFrom(now: Date): Promise<Date> {
    const days = await this.settings.getPositiveInteger(
      API_TOKEN_EXPIRY_DAYS,
      DEFAULT_TOKEN_EXPIRY_DAYS,
    );
    return new Date(now.getTime() + days * DAY_MS);
  }
}

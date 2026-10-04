import { SetMetadata } from '@nestjs/common';
import type { ApiScope } from '@nurtw/contracts';
import type { Request } from 'express';

export const SCOPE_METADATA_KEY = 'nurtw:required-scope';

/**
 * Declares the scope an external route requires (item 11).
 *
 * ARCHITECTURE.md Decisions 9.1 and 9.8 — external clients are authorised by
 * scope, internal users by permission, and the two share nothing. A route
 * carries `@RequireScope` or `@RequirePermission`, never both: the guard sends
 * a scope route down the API-token path, where a session cookie is not even
 * read, and every other route down the session path, where a token is not.
 *
 * Typed over the scope catalogue, so a scope that does not exist cannot be
 * required by a typing slip (Requirement 12.4).
 */
export const RequireScope = (scope: ApiScope) =>
  SetMetadata(SCOPE_METADATA_KEY, scope);

/** The external client a token resolved to, as a scope route receives it. */
export interface AuthenticatedApiClient {
  readonly clientId: string;
  readonly tokenId: string;
  readonly organisationName: string;
  readonly scopes: readonly string[];
  readonly disclosureProfileId: string | null;
  /**
   * The fields the client's disclosure profile permits, read on this request.
   * A response is built by projecting through these (Decision 5.1).
   */
  readonly permittedFields: readonly string[];
  /** The limit profile it is held to, read on this request (item 13). */
  readonly rateLimitProfile: string;
  /** Its own daily quota, or `null` for its profile's. */
  readonly dailyQuota: number | null;
}

/**
 * What an external route reports of its outcome, for the request log. The
 * caller is never told it.
 */
export interface ExternalOutcome {
  /** A coarse class, such as `MATCH` or `NO_MATCH`. */
  readonly resultClass: string;
  /** PRD §26.4 — which scheme the presented code used, if one was. */
  readonly identifierScheme: 'SIGNED' | 'LEGACY' | null;
  /**
   * What was presented, for abuse detection only (item 13): the normalised
   * plate, and a Transpay barcode. A signed code is never passed: it is in
   * no sequence, and a forgery is counted by its outcome.
   */
  readonly presented?: { plate: string | null; code: string | null };
}

/** Set on the request once a token resolves, for scope routes to read. */
export interface ExternalRequest extends Request {
  apiClient?: AuthenticatedApiClient;
  /** Proposal §14.3 — the id the System gave this request. */
  serverRequestId?: string;
  /** Set by the route, read by `ExternalRequestLogInterceptor`. */
  externalOutcome?: ExternalOutcome;
}

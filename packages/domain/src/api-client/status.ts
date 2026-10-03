/**
 * The external-client lifecycle, and the state of a token (PRD §12.1, item 11).
 *
 * PRD §12.1 names five client statuses: Pending, Active, Suspended, Expired,
 * Revoked. Four are decisions an officer takes and are stored. `EXPIRED` is
 * not: a client is expired when its token has run out and nothing replaced it,
 * which is a fact about the clock. It is worked out when asked, the way
 * "onboarded" is, so no job has to notice the date for the answer to be right.
 */

export const API_CLIENT_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
] as const;

export type ApiClientStatus = (typeof API_CLIENT_STATUSES)[number];

/** The statuses a row is written with. `EXPIRED` is derived, never stored. */
export const STORED_API_CLIENT_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
] as const;

export type StoredApiClientStatus = (typeof STORED_API_CLIENT_STATUSES)[number];

export class InvalidApiClientTransitionError extends Error {
  override readonly name = 'InvalidApiClientTransitionError';
}

/**
 * `PENDING -> ACTIVE` is approval. `PENDING -> REVOKED` is a refusal: PRD
 * §12.1 has no "rejected" state, and an organisation that was never approved
 * is closed the same way one whose access was withdrawn is.
 *
 * `SUSPENDED` returns to `ACTIVE`: a suspension is a hold, and lifting it
 * restores the tokens the organisation already holds. `REVOKED` is final. An
 * organisation whose access was withdrawn is registered afresh, so the record
 * of the withdrawal stays as it was.
 */
const API_CLIENT_TRANSITIONS: Readonly<
  Record<StoredApiClientStatus, readonly StoredApiClientStatus[]>
> = {
  PENDING: ['ACTIVE', 'REVOKED'],
  ACTIVE: ['SUSPENDED', 'REVOKED'],
  SUSPENDED: ['ACTIVE', 'REVOKED'],
  REVOKED: [],
};

export function canTransitionApiClient(
  from: StoredApiClientStatus,
  to: StoredApiClientStatus,
): boolean {
  return (API_CLIENT_TRANSITIONS[from] ?? []).includes(to);
}

export function assertApiClientTransition(
  from: StoredApiClientStatus,
  to: StoredApiClientStatus,
): void {
  if (canTransitionApiClient(from, to)) {
    return;
  }
  const allowed = API_CLIENT_TRANSITIONS[from] ?? [];
  throw new InvalidApiClientTransitionError(
    allowed.length === 0
      ? `An API client in ${from} is final and cannot move to ${to}.`
      : `An API client cannot move from ${from} to ${to}. Permitted: ${allowed.join(', ')}.`,
  );
}

export function isApiClientFinal(status: StoredApiClientStatus): boolean {
  return API_CLIENT_TRANSITIONS[status].length === 0;
}

/**
 * Whether a client in this status may be authenticated at all. `ACTIVE` alone:
 * a suspended client's tokens are intact and refused. Never widen this to "not
 * revoked", which would admit a client nobody has approved.
 */
export function canApiClientAuthenticate(
  status: StoredApiClientStatus,
): boolean {
  return status === 'ACTIVE';
}

// --- Tokens ----------------------------------------------------------------

/**
 * - `CURRENT`: in use.
 * - `RETIRING`: replaced by a newer token, and still accepted until the
 *   overlap the officer chose runs out.
 * - `REPLACED`: replaced, and the overlap is over.
 * - `EXPIRED`: its 90 days ran out (Requirement 12.6).
 * - `REVOKED`: withdrawn by an officer.
 */
export const API_TOKEN_STATES = [
  'CURRENT',
  'RETIRING',
  'REPLACED',
  'EXPIRED',
  'REVOKED',
] as const;

export type ApiTokenState = (typeof API_TOKEN_STATES)[number];

/** The dates that decide a token's state. Nothing else does. */
export interface ApiTokenFacts {
  expiresAt: Date;
  revokedAt: Date | null;
  /** Set when a newer token replaced this one: when this one stops. */
  retiresAt: Date | null;
}

/**
 * Revocation is checked first, so a token an officer withdrew never reads as
 * anything gentler. A boundary instant counts as over: a token expiring at
 * noon is refused at noon.
 */
export function apiTokenState(token: ApiTokenFacts, now: Date): ApiTokenState {
  if (token.revokedAt !== null) {
    return 'REVOKED';
  }
  if (token.retiresAt !== null && token.retiresAt.getTime() <= now.getTime()) {
    return 'REPLACED';
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return token.retiresAt !== null ? 'RETIRING' : 'CURRENT';
}

/** Whether a token in this state authenticates a request. */
export function isApiTokenUsable(state: ApiTokenState): boolean {
  return state === 'CURRENT' || state === 'RETIRING';
}

/**
 * How long a replaced token keeps working (the owner's direction of 3 October
 * 2026, `QUESTIONS.md` EXT-11). The officer picks one at each rotation, so an
 * organisation can install the new token without an outage. A token that has
 * leaked is revoked instead, which is immediate.
 */
export const TOKEN_ROTATION_OVERLAPS = {
  NONE: 0,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
} as const;

export type TokenRotationOverlap = keyof typeof TOKEN_ROTATION_OVERLAPS;

export const TOKEN_ROTATION_OVERLAP_CODES = Object.keys(
  TOKEN_ROTATION_OVERLAPS,
) as readonly TokenRotationOverlap[];

/**
 * When a token being replaced stops working. Never later than its own expiry:
 * a rotation must not lengthen the life of the token it replaces.
 */
export function retirementFor(
  overlap: TokenRotationOverlap,
  now: Date,
  expiresAt: Date,
): Date {
  const retires = now.getTime() + TOKEN_ROTATION_OVERLAPS[overlap];
  return new Date(Math.min(retires, expiresAt.getTime()));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a token should be flagged for replacement (Requirement 12.6). Only a
 * `CURRENT` token is: one already being replaced needs no reminder, and one
 * that has stopped is past reminding.
 */
export function isTokenExpiringSoon(
  token: ApiTokenFacts,
  now: Date,
  reminderDays: number,
): boolean {
  if (apiTokenState(token, now) !== 'CURRENT') {
    return false;
  }
  return token.expiresAt.getTime() - now.getTime() <= reminderDays * DAY_MS;
}

/**
 * The status a client is shown with. A stored `ACTIVE` reads `EXPIRED` when
 * the client's newest token has run out and no token of its is still accepted.
 *
 * A client that was approved and never issued a token, or whose newest token
 * an officer revoked, stays `ACTIVE`: nothing expired, and saying so would
 * send an officer looking for a date that is not the cause.
 */
export function apiClientStanding(
  status: StoredApiClientStatus,
  tokens: readonly (ApiTokenFacts & { createdAt: Date })[],
  now: Date,
): ApiClientStatus {
  if (status !== 'ACTIVE' || tokens.length === 0) {
    return status;
  }
  if (tokens.some((token) => isApiTokenUsable(apiTokenState(token, now)))) {
    return 'ACTIVE';
  }
  const newest = tokens.reduce((latest, token) =>
    token.createdAt.getTime() > latest.createdAt.getTime() ? token : latest,
  );
  return apiTokenState(newest, now) === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE';
}

/**
 * External API scopes.
 *
 * PRD §12.2 adopts the proposal's scope catalogue, amended at PRD §12.5 by the
 * substitution of two aggregate tiers for the single scope originally proposed.
 *
 * PRD Requirement 12.4: broad scopes such as `database:read` or `member:read:all`
 * must not be defined at all — not merely withheld. A scope that does not exist
 * cannot be granted by mistake.
 *
 * These are external-client scopes. They are a separate system from internal user
 * permissions (ARCHITECTURE.md Decision 9.8) and share no storage: an internal
 * permission can never be reached through an API token, and a scope can never be
 * reached through a session.
 */

export const API_SCOPES = [
  'vehicle:verify:plate',
  'sticker:verify:qr',
  'vehicle:verify:combined',
  'member:verify:membership',
  'aggregate:vehicles:total',
  'aggregate:vehicles:read',
  'organization:metadata:read',
  'audit:client:read',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/**
 * What each scope lets an organisation do, in the words an officer granting
 * it reads (proposal §12.2). Typed over `ApiScope`, so a scope added above
 * without a description here fails to compile.
 */
export const API_SCOPE_DESCRIPTIONS: Readonly<Record<ApiScope, string>> = {
  'vehicle:verify:plate': 'Verify a vehicle by its plate number.',
  'sticker:verify:qr': 'Verify a sticker by its code.',
  'vehicle:verify:combined':
    'Verify a plate and a sticker together, to catch a sticker on the wrong vehicle.',
  'member:verify:membership': 'Confirm a membership number or a card number.',
  'aggregate:vehicles:total':
    'Read the grand total of vehicles. No filter is accepted.',
  'aggregate:vehicles:read':
    'Read vehicle totals by the approved filters. Small totals are suppressed.',
  'organization:metadata:read':
    'Read the branch, unit, and category labels needed to interpret a response.',
  'audit:client:read': 'Read the organisation’s own usage summary.',
};

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/**
 * Aggregate access is tiered — PRD §13.2.
 *
 * `aggregate:vehicles:total` returns the unfiltered grand total and rejects any
 * filter parameter outright. It needs no suppression because an unfiltered count
 * cannot be differenced: there is no second query to subtract from it.
 *
 * `aggregate:vehicles:read` accepts the approved filter dimensions and is subject
 * to the suppression floor below.
 */
export const AGGREGATE_TOTAL_SCOPE =
  'aggregate:vehicles:total' satisfies ApiScope;
export const AGGREGATE_FILTERED_SCOPE =
  'aggregate:vehicles:read' satisfies ApiScope;

/**
 * Default suppression floor, determined at PRD §23.12.
 *
 * Runtime configuration, not a constant to branch on — PRD Requirement 14.1
 * requires every limit and threshold to be adjustable by a Union administrator
 * without a deployment. This value seeds that configuration; it is not the
 * authority at request time.
 */
export const DEFAULT_AGGREGATE_SUPPRESSION_FLOOR = 25;

/** Default external token lifetime in days, determined at PRD §12.6. Seed value. */
export const DEFAULT_TOKEN_EXPIRY_DAYS = 90;

/**
 * How many days before a token expires it is flagged for replacement
 * (Requirement 12.6, `QUESTIONS.md` EXT-10). Seed value for the
 * `api_token.reminder_days` setting, which is the authority at request time.
 */
export const DEFAULT_TOKEN_REMINDER_DAYS = 14;

/**
 * The organisation portal (PRD §23.23, revision 1.9; `QUESTIONS.md` EXT-20 —
 * item 29).
 *
 * An outside organisation applies for itself and, once approved, sees its own
 * usage. The rules here are the ones that must not drift: what the portal may
 * say about a request, when an application lapses, and how an applicant is
 * confirmed before approval.
 */

/**
 * How the administrator confirmed an applicant before approving it. The
 * System sends no mail (GOV-08), so the confirmation is made outside it.
 */
export const APPLICANT_CONFIRMATIONS = ['TELEPHONE', 'LETTER'] as const;
export type ApplicantConfirmation = (typeof APPLICANT_CONFIRMATIONS)[number];

/**
 * What the portal calls a request, for the organisation's own usage figures.
 *
 * - `MATCH`, `NO_MATCH`: a verification the System answered.
 * - `TOTALS`: a total, or the metadata it is filtered by.
 * - `LIMITED`: refused by a limit or a pause (`429`).
 * - `REFUSED`: the credential or its scope was not accepted (`401`, `403`).
 * - `INVALID_REQUEST`: the request itself was malformed (`400`).
 */
export const PORTAL_USAGE_CLASSES = [
  'MATCH',
  'NO_MATCH',
  'TOTALS',
  'LIMITED',
  'REFUSED',
  'INVALID_REQUEST',
  'OTHER',
] as const;
export type PortalUsageClass = (typeof PORTAL_USAGE_CLASSES)[number];

/**
 * Classes one logged request for the organisation that made it.
 *
 * **The portal says no more than the API's own answer did** (PRD Requirement
 * 14.3). The log keeps why a request failed; the caller was never told, and
 * is not told here either:
 *
 * - A forged code is logged `INVALID_SIGNATURE`, and answered exactly as any
 *   other non-match. It is counted as `NO_MATCH`, or the count would tell a
 *   forger which of their codes failed the signature and which merely matched
 *   nothing.
 * - A suppressed total is logged `SUPPRESSED`. It is counted with the totals.
 * - Every credential failure is one `REFUSED`, whatever the log says of it.
 *
 * The status code decides first: it is the one thing the caller did see.
 */
export function portalUsageClass(request: {
  resultClass: string;
  statusCode: number;
  rateLimited: boolean;
}): PortalUsageClass {
  if (request.rateLimited || request.statusCode === 429) {
    return 'LIMITED';
  }
  if (request.statusCode === 401 || request.statusCode === 403) {
    return 'REFUSED';
  }
  if (request.statusCode === 400) {
    return 'INVALID_REQUEST';
  }
  switch (request.resultClass) {
    case 'MATCH':
      return 'MATCH';
    case 'NO_MATCH':
    case 'INVALID_SIGNATURE':
      return 'NO_MATCH';
    case 'TOTAL':
    case 'SUPPRESSED':
    case 'METADATA':
      return 'TOTALS';
    default:
      return 'OTHER';
  }
}

/** An empty tally, so a day with no requests still has every class. */
export function emptyUsageTally(): Record<PortalUsageClass, number> {
  return {
    MATCH: 0,
    NO_MATCH: 0,
    TOTALS: 0,
    LIMITED: 0,
    REFUSED: 0,
    INVALID_REQUEST: 0,
    OTHER: 0,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An application nobody approved lapses after `expiryDays` (EXT-20), so the
 * open form cannot fill the administrator's list for good.
 */
export function applicationExpiresAt(
  appliedAt: Date,
  expiryDays: number,
): Date {
  return new Date(appliedAt.getTime() + expiryDays * DAY_MS);
}

export function isApplicationExpired(
  appliedAt: Date,
  now: Date,
  expiryDays: number,
): boolean {
  return applicationExpiresAt(appliedAt, expiryDays).getTime() <= now.getTime();
}

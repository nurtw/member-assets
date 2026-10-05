/**
 * Inviting an organisation to apply (PRD Requirement 12.11, revision 1.10;
 * `QUESTIONS.md` EXT-21 — item 33).
 *
 * An invitation is open, used, expired, or withdrawn, and that is worked out
 * from its dates, as a token's expiry is, never stored. It opens the portal's
 * application form addressed to one organisation, and nothing more: it
 * confirms nobody, lifts no limit, and the application it produces is decided
 * as any other.
 */

export const INVITATION_STANDINGS = [
  'OPEN',
  'USED',
  'EXPIRED',
  'WITHDRAWN',
] as const;

export type InvitationStanding = (typeof INVITATION_STANDINGS)[number];

/** Sixteen random bytes, base64url: 22 characters, as a pay link's code. */
export const INVITATION_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function isInvitationCode(value: string): boolean {
  return INVITATION_CODE_PATTERN.test(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function invitationExpiresAt(createdAt: Date, expiryDays: number): Date {
  return new Date(createdAt.getTime() + expiryDays * DAY_MS);
}

/**
 * Used is final: an application arrived, whatever happened after. A
 * withdrawal then beats the calendar, so a withdrawn link reads withdrawn even
 * once it would have expired.
 */
export function invitationStanding(
  invitation: {
    expiresAt: Date;
    usedAt: Date | null;
    withdrawnAt: Date | null;
  },
  now: Date,
): InvitationStanding {
  if (invitation.usedAt !== null) {
    return 'USED';
  }
  if (invitation.withdrawnAt !== null) {
    return 'WITHDRAWN';
  }
  return now.getTime() >= invitation.expiresAt.getTime() ? 'EXPIRED' : 'OPEN';
}

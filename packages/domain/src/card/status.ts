/**
 * The membership-card lifecycle.
 *
 * PRD §8 — nine states. Domain rule 5, history is preserved: a card is never
 * deleted and never silently overwritten. It reaches a terminal state and stays
 * there, with the superseding card pointing back at it.
 *
 * Expressed as a transition table for the same reason as
 * `../membership/status.ts`: "which transitions are legal" is the rule that gets
 * re-implemented slightly differently in a second place, after which the two
 * disagree about whether a lost card can be reactivated.
 */

export const CARD_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'ISSUED',
  'ACTIVE',
  'SUSPENDED',
  'LOST',
  'REPLACED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export class InvalidCardTransitionError extends Error {
  override readonly name = 'InvalidCardTransitionError';
}

/**
 * Card transitions.
 *
 * Three things here are deliberate and worth reading twice.
 *
 * **`PENDING_APPROVAL → DRAFT`.** An approver who finds an error sends the card
 * back rather than refusing it outright. There is no `REJECTED` state in PRD §8;
 * a card that should not exist is `CANCELLED`.
 *
 * **`ISSUED` and `ACTIVE` are different things.** `ISSUED` is printed and in the
 * office; `ACTIVE` is in the member's hands. Both are live — a printed card that
 * has gone missing between the printer and the counter is exactly as dangerous
 * as one lost afterwards — so both are covered by the one-live-card index, and
 * both can be reported `LOST` or superseded. A spoiled print is `REPLACED`
 * rather than `CANCELLED`: cancelling would retire the number with no successor
 * recorded, and the chain is the only thing that later explains why it is
 * dead.
 *
 * **`LOST` and `EXPIRED` lead only to `REPLACED` or `CANCELLED`.** Neither
 * returns to `ACTIVE`. A card reported lost may be in someone else's pocket, and
 * restoring it would revalidate whatever is out there; a card found again is
 * replaced, not resurrected. `EXPIRED` behaves the same way because renewal
 * issues a new card with a new validity, which is a replacement.
 *
 * `REPLACED` and `CANCELLED` are terminal. A card that could be quietly restored
 * after cancellation would make the register unable to answer "was this card
 * valid on that date", which is the only question verification asks.
 */
const CARD_TRANSITIONS: Readonly<Record<CardStatus, readonly CardStatus[]>> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['DRAFT', 'ISSUED', 'CANCELLED'],
  ISSUED: ['ACTIVE', 'LOST', 'REPLACED', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'LOST', 'EXPIRED', 'REPLACED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'LOST', 'EXPIRED', 'REPLACED', 'CANCELLED'],
  LOST: ['REPLACED', 'CANCELLED'],
  EXPIRED: ['REPLACED', 'CANCELLED'],
  REPLACED: [],
  CANCELLED: [],
};

/**
 * The states in which a card physically exists and answers for its holder.
 *
 * This is the set the one-live-card-per-member index is built over, and the set
 * `card.replace` supersedes from. It is deliberately **not** "anything but
 * cancelled": `LOST`, `REPLACED`, and `EXPIRED` cards are all real objects still
 * in existence somewhere, and none of them should authorise anybody.
 */
export const LIVE_CARD_STATUSES: readonly CardStatus[] = ['ISSUED', 'ACTIVE'];

/**
 * The states from which a replacement may be issued.
 *
 * Wider than the live set, because the overwhelmingly common replacement is of a
 * card already reported `LOST` or gone `EXPIRED`. Narrower than "everything",
 * because replacing a `DRAFT` is meaningless — nothing was printed — and
 * replacing a `CANCELLED` card would re-credential somebody whose card was
 * deliberately voided.
 */
export const REPLACEABLE_CARD_STATUSES: readonly CardStatus[] = [
  'ISSUED',
  'ACTIVE',
  'SUSPENDED',
  'LOST',
  'EXPIRED',
];

function permitted(from: CardStatus, to: CardStatus): boolean {
  return CARD_TRANSITIONS[from].includes(to);
}

export function canTransitionCard(from: CardStatus, to: CardStatus): boolean {
  return permitted(from, to);
}

export function assertCardTransition(from: CardStatus, to: CardStatus): void {
  if (permitted(from, to)) {
    return;
  }
  const allowed = CARD_TRANSITIONS[from];
  throw new InvalidCardTransitionError(
    allowed.length === 0
      ? `A card in ${from} is final and cannot move to ${to}.`
      : `A card cannot move from ${from} to ${to}. Permitted: ${allowed.join(', ')}.`,
  );
}

export function isCardFinal(status: CardStatus): boolean {
  return CARD_TRANSITIONS[status].length === 0;
}

/** Whether a card in this status occupies its holder's one live-card slot. */
export function isCardLive(status: CardStatus): boolean {
  return LIVE_CARD_STATUSES.includes(status);
}

export function isCardReplaceable(status: CardStatus): boolean {
  return REPLACEABLE_CARD_STATUSES.includes(status);
}

/**
 * Whether the card has been issued, and therefore whether it bears a number.
 *
 * The rendering path asks this to decide between the real card and a proof.
 * A card that has not passed through `ISSUED` has no card number allocated
 * (see `plans/06-membership-card-issuance.md`, decisions 3 and 4), so rendering
 * it as a finished card would produce a numberless article indistinguishable
 * from the real one at a glance.
 */
export function isCardIssued(status: CardStatus): boolean {
  return status !== 'DRAFT' && status !== 'PENDING_APPROVAL';
}

/**
 * Whether a card in this status may be presented as valid.
 *
 * `ACTIVE` alone. Kept separate from {@link isCardLive} on purpose: `ISSUED`
 * occupies the live slot because the object exists, but it has not been handed
 * over and must not verify. The same distinction the sticker statuses draw at
 * `VERIFIABLE_STICKER_STATUSES` — and, as there, never widen this to "not
 * cancelled".
 */
export function isCardVerifiable(status: CardStatus): boolean {
  return status === 'ACTIVE';
}

/**
 * The expiry date for a card issued on `issuedOn` under a validity in months,
 * or `null` where the template carries no validity.
 *
 * PRD §23.5 — validity is configurable per template and **may be none**. The
 * Union has not yet stated the period (QUESTIONS.md CARD-04), so `null` is the
 * live configuration and this path is exercised by tests rather than by data.
 *
 * Month arithmetic, not 365 days: an annual card issued on 29 February expires
 * on 28 February, which is what a person reading the card expects. `setMonth`
 * would roll 31 January + 1 month to 3 March; clamping to the last day of the
 * target month is the conventional reading of "one month later".
 */
export function expiryDateFor(
  issuedOn: Date,
  validityMonths: number | null,
): Date | null {
  if (validityMonths === null) {
    return null;
  }
  if (!Number.isInteger(validityMonths) || validityMonths <= 0) {
    throw new InvalidCardTransitionError(
      'A template validity must be a positive whole number of months, or none.',
    );
  }

  const year = issuedOn.getUTCFullYear();
  const month = issuedOn.getUTCMonth() + validityMonths;
  const day = issuedOn.getUTCDate();

  // Day 0 of the following month is the last day of the target month, which
  // clamps 31 January + 1 month to 28 or 29 February rather than overflowing.
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDayOfTargetMonth),
      issuedOn.getUTCHours(),
      issuedOn.getUTCMinutes(),
      issuedOn.getUTCSeconds(),
      issuedOn.getUTCMilliseconds(),
    ),
  );
}

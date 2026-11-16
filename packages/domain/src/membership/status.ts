/**
 * Status lifecycle for members, and who may correct a registration.
 *
 * PRD §7 and §16. Domain rule 5 — history is preserved:
 * nothing here deletes, and a terminal state is reached rather than erased.
 *
 * Expressed as explicit transition tables rather than as `if` statements spread
 * through a service. "Which transitions are legal" is precisely the rule that
 * gets re-implemented slightly differently somewhere else six months later, and
 * the two implementations then disagree about whether a suspended member may be
 * issued a card.
 */

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MEMBER_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export class InvalidStatusTransitionError extends Error {
  override readonly name = 'InvalidStatusTransitionError';
}

/**
 * Member transitions.
 *
 * `PENDING` is no longer created (item 61): a registration is active at once. It remains
 * in the enum for rows registered before then.
 * Suspension is reversible; cancellation is not. `CANCELLED` is terminal because
 * a cancelled membership that could be silently restored would make the register
 * unable to answer "was this person a member on that date".
 */
const MEMBER_TRANSITIONS: Readonly<
  Record<MemberStatus, readonly MemberStatus[]>
> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [],
};

function can<T extends string>(
  table: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
): boolean {
  return (table[from] ?? []).includes(to);
}

function assert<T extends string>(
  table: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
  noun: string,
): void {
  if (can(table, from, to)) {
    return;
  }
  const allowed = table[from] ?? [];
  throw new InvalidStatusTransitionError(
    allowed.length === 0
      ? `A ${noun} in ${from} is final and cannot move to ${to}.`
      : `A ${noun} cannot move from ${from} to ${to}. Permitted: ${allowed.join(', ')}.`,
  );
}

export function canTransitionMember(
  from: MemberStatus,
  to: MemberStatus,
): boolean {
  return can(MEMBER_TRANSITIONS, from, to);
}

export function assertMemberTransition(
  from: MemberStatus,
  to: MemberStatus,
): void {
  assert(MEMBER_TRANSITIONS, from, to, 'member');
}

export function isMemberFinal(status: MemberStatus): boolean {
  return MEMBER_TRANSITIONS[status].length === 0;
}

/**
 * Who may correct a member's registration after it is saved (item 61,
 * `QUESTIONS.md` MEM-20, answered 16 November 2026; the same shape as VEH-40).
 *
 * There is no draft and no review: registering makes the member active at once.
 * An administrator (`member.update`) corrects at any time. The officer who
 * registered the member has **one** correction, and nobody else has any.
 */
export type CorrectionRight = 'ANYTIME' | 'ONCE' | 'NONE';

export function correctionRight(input: {
  /** Holds `member.update` over the member. */
  administrator: boolean;
  /** Is the officer who registered this member. */
  registeredByCaller: boolean;
  /** The registering officer's one correction is already used. */
  correctionUsed: boolean;
}): CorrectionRight {
  if (input.administrator) {
    return 'ANYTIME';
  }
  if (input.registeredByCaller && !input.correctionUsed) {
    return 'ONCE';
  }
  return 'NONE';
}

/**
 * Whether a member in this status may hold a valid card or declare a vehicle.
 *
 * Consulted by items 06 and 07 so that "who is in good standing" is answered in
 * one place. A pending applicant is not a member yet; a suspended one is a member
 * whose privileges are withdrawn.
 */
export function isMemberInGoodStanding(status: MemberStatus): boolean {
  return status === 'ACTIVE';
}

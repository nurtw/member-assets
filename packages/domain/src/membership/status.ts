/**
 * Status lifecycles for membership applications and members.
 *
 * PRD §7 (review and approval) and §16. Domain rule 5 — history is preserved:
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
 * Application transitions.
 *
 * `UNDER_REVIEW` is reachable only from `SUBMITTED`, and a decision only from
 * `UNDER_REVIEW` or `SUBMITTED` — an approver may decide directly without first
 * claiming the application, which is how a small office actually works.
 *
 * `WITHDRAWN` is available up to the point of decision and not after. A decision
 * is a record of what the Union determined; permitting withdrawal afterwards
 * would let an applicant erase a refusal.
 */
const APPLICATION_TRANSITIONS: Readonly<
  Record<ApplicationStatus, readonly ApplicationStatus[]>
> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

/**
 * Member transitions.
 *
 * `PENDING → ACTIVE` is the approval of an application and has no other cause.
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

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return can(APPLICATION_TRANSITIONS, from, to);
}

export function assertApplicationTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): void {
  assert(APPLICATION_TRANSITIONS, from, to, 'application');
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

/** Statuses from which no further transition is possible. */
export function isApplicationFinal(status: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[status].length === 0;
}

export function isMemberFinal(status: MemberStatus): boolean {
  return MEMBER_TRANSITIONS[status].length === 0;
}

/**
 * Whether an application may still be edited.
 *
 * Only a draft. Once submitted, the record is what the reviewer is judging;
 * editing it underneath them would mean the decision recorded in the audit trail
 * refers to something other than what was decided upon.
 */
export function isApplicationEditable(status: ApplicationStatus): boolean {
  return status === 'DRAFT';
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

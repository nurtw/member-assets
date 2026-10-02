/**
 * Allocating dedicated-account money across dues (PRD Requirement 27.7,
 * `QUESTIONS.md` PAY-12 — item 23).
 *
 * A member sends money to their dedicated account without saying what it is
 * for. It may have to cover their membership fee and the levy on several
 * vehicles. It pays the **oldest outstanding due first**, a due in part when
 * the money runs out, and whatever is left over is held until the next due
 * falls.
 *
 * Pure: the caller works out what is outstanding (item 22's schedule) and
 * records the allocations as payments, so the ledger, not this function, is
 * what says a due is paid (Requirement 27.9).
 */

/**
 * PAY-12 — "the order is a setting". `OLDEST_FIRST` is the Union's answer and
 * the default. The other two put dues charged against the member, or against
 * their vehicles, ahead of the rest, oldest first within each group. They name
 * what a fee is charged against rather than a fee code, because fee types are
 * data (Requirement 27.1).
 */
export type AllocationOrder =
  'OLDEST_FIRST' | 'MEMBER_DUES_FIRST' | 'VEHICLE_DUES_FIRST';

export const ALLOCATION_ORDERS: readonly AllocationOrder[] = [
  'OLDEST_FIRST',
  'MEMBER_DUES_FIRST',
  'VEHICLE_DUES_FIRST',
];

/** An unreadable setting falls back to the answered order, never to another one. */
export function parseAllocationOrder(
  value: string | null | undefined,
): AllocationOrder {
  const candidate = value?.trim().toUpperCase();
  return (ALLOCATION_ORDERS as readonly string[]).includes(candidate ?? '')
    ? (candidate as AllocationOrder)
    : 'OLDEST_FIRST';
}

/** One due period that has fallen due and is not yet fully paid. */
export interface OutstandingDue {
  subjectType: 'member' | 'vehicle';
  subjectId: string;
  feeTypeCode: string;
  /** What the period is called on a receipt: `2026-11` for a levy month. */
  period: string;
  dueOn: Date;
  outstandingKobo: number;
}

export interface Allocation {
  subjectType: 'member' | 'vehicle';
  subjectId: string;
  feeTypeCode: string;
  period: string;
  dueOn: Date;
  amountKobo: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Credit left once every outstanding due is paid; held for the next due. */
  remainingKobo: number;
  /** What is still outstanding afterwards, in the same order. */
  outstanding: OutstandingDue[];
}

function compareDues(order: AllocationOrder) {
  const groupRank = (due: OutstandingDue): number => {
    if (order === 'MEMBER_DUES_FIRST') {
      return due.subjectType === 'member' ? 0 : 1;
    }
    if (order === 'VEHICLE_DUES_FIRST') {
      return due.subjectType === 'vehicle' ? 0 : 1;
    }
    return 0;
  };
  return (a: OutstandingDue, b: OutstandingDue): number =>
    groupRank(a) - groupRank(b) ||
    a.dueOn.getTime() - b.dueOn.getTime() ||
    // Ties are broken the same way every time, so that a replay or a second
    // sweep allocates exactly as the first did: the member's own due first,
    // then by fee, vehicle, and period.
    (a.subjectType === b.subjectType
      ? 0
      : a.subjectType === 'member'
        ? -1
        : 1) ||
    a.feeTypeCode.localeCompare(b.feeTypeCode) ||
    a.subjectId.localeCompare(b.subjectId) ||
    a.period.localeCompare(b.period);
}

/**
 * Pays `creditKobo` into `dues` in the given order. A due is paid in part when
 * the credit runs out, and the rest stays outstanding: a member chipping away
 * at their oldest due is still paying their oldest due.
 */
export function allocateCredit(input: {
  creditKobo: number;
  dues: readonly OutstandingDue[];
  order: AllocationOrder;
}): AllocationResult {
  let remaining = Math.max(0, input.creditKobo);
  const allocations: Allocation[] = [];
  const outstanding: OutstandingDue[] = [];

  for (const due of [...input.dues].sort(compareDues(input.order))) {
    if (due.outstandingKobo <= 0) {
      continue;
    }
    const amountKobo = Math.min(remaining, due.outstandingKobo);
    if (amountKobo > 0) {
      remaining -= amountKobo;
      allocations.push({
        subjectType: due.subjectType,
        subjectId: due.subjectId,
        feeTypeCode: due.feeTypeCode,
        period: due.period,
        dueOn: due.dueOn,
        amountKobo,
      });
    }
    if (amountKobo < due.outstandingKobo) {
      outstanding.push({
        ...due,
        outstandingKobo: due.outstandingKobo - amountKobo,
      });
    }
  }

  return { allocations, remainingKobo: remaining, outstanding };
}

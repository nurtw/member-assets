/**
 * The dues schedule (PRD Requirement 27.13, `QUESTIONS.md` PAY-03, PAY-04,
 * PAY-12 — item 22).
 *
 * Pure functions: what is owed is worked out from when a due started, what
 * each period cost, and what the ledger has credited. Nothing here is stored,
 * so there is no "paid" flag to overwrite (Requirement 27.9).
 *
 * **Calendar months are Lagos months.** The Union works in Africa/Lagos, which
 * is UTC+1 all year with no daylight saving. A sticker attached at 23:30 UTC
 * on 31 October was attached on 1 November in Awka, and its levy starts in
 * December, not November.
 */

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/**
 * - `NOT_DUE` — nothing has fallen due yet.
 * - `PAID` — everything that has fallen due is paid.
 * - `OWED` — only the current period is unpaid.
 * - `IN_ARREARS` — a period before the current one is unpaid.
 *
 * Internal only (Requirement 27.8): no external response, public page, or
 * disclosure profile ever carries one of these.
 */
export type DuesStatus = 'NOT_DUE' | 'PAID' | 'OWED' | 'IN_ARREARS';

export const DUES_STATUSES: readonly DuesStatus[] = [
  'NOT_DUE',
  'PAID',
  'OWED',
  'IN_ARREARS',
];

interface LagosParts {
  year: number;
  /** 0–11, as `Date` counts months. */
  month: number;
  day: number;
}

function lagosParts(instant: Date): LagosParts {
  const shifted = new Date(instant.getTime() + LAGOS_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** Midnight in Lagos on the 1st of a month, as an instant. Month may overflow. */
function firstOfLagosMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - LAGOS_OFFSET_MS);
}

/** `2026-11`, the Lagos month an instant falls in. */
export function lagosMonthLabel(instant: Date): string {
  const { year, month } = lagosParts(instant);
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// --- The levy ---------------------------------------------------------------

export interface LevyMonth {
  /** `2026-11`. */
  month: string;
  /** The 1st of the month, Lagos time. */
  dueOn: Date;
  amountKobo: number;
  paidKobo: number;
  outstandingKobo: number;
}

export interface LevySchedule {
  status: DuesStatus;
  /** `null` when the vehicle has not been onboarded. */
  firstDueOn: Date | null;
  /** Every month that has fallen due so far, oldest first. */
  months: LevyMonth[];
  outstandingKobo: number;
  /** Paid beyond what has fallen due, held against the next month (PAY-12). */
  creditKobo: number;
  /** The next 1st after `now`; `null` when not onboarded. */
  nextDueOn: Date | null;
}

/**
 * The levy on one vehicle. It falls due on the 1st of each calendar month,
 * starting with the month **after** the vehicle is onboarded, with no
 * proration: a vehicle onboarded on the 30th owes the whole of next month, and
 * nothing for the days left in this one.
 *
 * `creditKobo` is what the ledger holds for this vehicle's levy: credits less
 * reversing debits. It is applied to the oldest month first, and whatever is
 * left over is carried as credit (PAY-12).
 *
 * `amountForMonth` is asked for the amount in force when each month fell due,
 * so a later price change leaves earlier months as they were.
 */
export function levySchedule(input: {
  onboardedAt: Date | null;
  now: Date;
  creditKobo: number;
  amountForMonth: (dueOn: Date) => number;
}): LevySchedule {
  if (!input.onboardedAt) {
    return {
      status: 'NOT_DUE',
      firstDueOn: null,
      months: [],
      outstandingKobo: 0,
      creditKobo: Math.max(0, input.creditKobo),
      nextDueOn: null,
    };
  }

  const onboarded = lagosParts(input.onboardedAt);
  const firstDueOn = firstOfLagosMonth(onboarded.year, onboarded.month + 1);

  let remaining = Math.max(0, input.creditKobo);
  const months: LevyMonth[] = [];
  let dueOn = firstDueOn;
  let offset = 1;
  while (dueOn.getTime() <= input.now.getTime()) {
    const amountKobo = input.amountForMonth(dueOn);
    const paidKobo = Math.min(remaining, amountKobo);
    remaining -= paidKobo;
    months.push({
      month: lagosMonthLabel(dueOn),
      dueOn,
      amountKobo,
      paidKobo,
      outstandingKobo: amountKobo - paidKobo,
    });
    offset += 1;
    dueOn = firstOfLagosMonth(onboarded.year, onboarded.month + offset);
  }

  const outstandingKobo = months.reduce(
    (sum, month) => sum + month.outstandingKobo,
    0,
  );
  const earlierUnpaid = months
    .slice(0, -1)
    .some((month) => month.outstandingKobo > 0);

  return {
    status:
      months.length === 0
        ? 'NOT_DUE'
        : outstandingKobo === 0
          ? 'PAID'
          : earlierUnpaid
            ? 'IN_ARREARS'
            : 'OWED',
    firstDueOn,
    months,
    outstandingKobo,
    creditKobo: remaining,
    // The loop stopped at the first 1st still in the future.
    nextDueOn: dueOn,
  };
}

// --- The membership fee -------------------------------------------------------

export interface MembershipCover {
  /** Never `IN_ARREARS`: at most one fee is outstanding at a time (PAY-18). */
  status: DuesStatus;
  /** When the fee first fell due; `null` when it has not started. */
  firstDueOn: Date | null;
  /** The end of the cover in force now; `null` when not covered. */
  coveredUntil: Date | null;
  /** Since when the fee has been owed; `null` unless `OWED`. */
  owedSince: Date | null;
}

/**
 * Twelve months on, to the day, in Lagos time. 29 February runs to 28
 * February: the cover ends on the last day of that month, not on 1 March.
 */
export function addTwelveMonths(instant: Date): Date {
  const shifted = new Date(instant.getTime() + LAGOS_OFFSET_MS);
  const year = shifted.getUTCFullYear() + 1;
  const month = shifted.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(shifted.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      shifted.getUTCHours(),
      shifted.getUTCMinutes(),
      shifted.getUTCSeconds(),
      shifted.getUTCMilliseconds(),
    ) - LAGOS_OFFSET_MS,
  );
}

/**
 * The membership fee. It covers the member for 12 months **from the date it
 * is paid** (PAY-03), and first falls due on approval, or on the go-live date
 * for a member migrated before it.
 *
 * Applied as written, which settles two cases the Union has not been asked
 * about (PAY-18, open): a fee paid while cover is still running starts its 12
 * months on the day it is paid, so the overlap is not added on; and a lapse is
 * never billed, so one fee is outstanding at most.
 *
 * `firstDueOn` is `null` when the fee has not started: the member is not yet
 * approved, or was migrated and no go-live date is set (GOV-11).
 */
export function membershipCover(input: {
  firstDueOn: Date | null;
  paidOn: readonly Date[];
  now: Date;
}): MembershipCover {
  const now = input.now.getTime();

  // Each payment covers [paid, paid + 12 months). Overlapping covers merge.
  const covers = [...input.paidOn]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((paid) => ({ from: paid.getTime(), to: addTwelveMonths(paid).getTime() }))
    .reduce<{ from: number; to: number }[]>((merged, cover) => {
      const last = merged[merged.length - 1];
      if (last && cover.from <= last.to) {
        last.to = Math.max(last.to, cover.to);
      } else {
        merged.push({ ...cover });
      }
      return merged;
    }, []);

  const current = covers.find((cover) => cover.from <= now && now < cover.to);
  if (current) {
    return {
      status: 'PAID',
      firstDueOn: input.firstDueOn,
      coveredUntil: new Date(current.to),
      owedSince: null,
    };
  }

  if (!input.firstDueOn || now < input.firstDueOn.getTime()) {
    return {
      status: 'NOT_DUE',
      firstDueOn: input.firstDueOn,
      coveredUntil: null,
      owedSince: null,
    };
  }

  const lastLapse = covers
    .filter((cover) => cover.to <= now)
    .reduce((latest, cover) => Math.max(latest, cover.to), 0);
  return {
    status: 'OWED',
    firstDueOn: input.firstDueOn,
    coveredUntil: null,
    owedSince: new Date(Math.max(input.firstDueOn.getTime(), lastLapse)),
  };
}

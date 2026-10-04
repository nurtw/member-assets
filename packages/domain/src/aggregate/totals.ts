/**
 * Vehicle totals for outside organisations (PRD §13 — item 14).
 *
 * Three rules, each pure:
 *
 * - **Which vehicle counts** at an instant (Requirement 13.5): declared and
 *   onboarded by then, and not retired by then.
 * - **Which period** a caller may ask about: a calendar month, quarter, or
 *   year in Lagos (the owner's direction of 4 October 2026), counted as at
 *   its end.
 * - **What a filtered total may say**: below the floor it is suppressed
 *   (Requirement 13.3), and otherwise it is rounded, so that subtracting one
 *   total from another cannot uncover a small one (the owner's direction of
 *   4 October 2026). The grand total is neither: an unfiltered count cannot
 *   be differenced.
 */

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// --- Which vehicle counts ------------------------------------------------------

/** What the count rule needs of one vehicle. */
export interface CountableVehicle {
  readonly status: string;
  readonly declaredAt: Date | null;
  /** When a sticker was first attached; `null` if never onboarded. */
  readonly firstAttachedAt: Date | null;
  readonly retiredAt: Date | null;
}

/**
 * Whether a vehicle is in the external total as at `at`.
 *
 * Declared and onboarded by then, and either declared now or retired after
 * then. **The status is today's.** A vehicle suspended or disputed now is
 * left out of past periods too: the System keeps no history of those
 * statuses that a count could read, and leaving a vehicle out is the
 * disclosure-safe error. A legacy vehicle on record counts in no period
 * until it is declared and onboarded (acceptance criterion 14).
 */
export function isCountedAt(vehicle: CountableVehicle, at: Date): boolean {
  if (vehicle.declaredAt === null || vehicle.declaredAt > at) {
    return false;
  }
  if (vehicle.firstAttachedAt === null || vehicle.firstAttachedAt > at) {
    return false;
  }
  if (vehicle.status === 'ACTIVE') {
    return true;
  }
  return (
    vehicle.status === 'RETIRED' &&
    vehicle.retiredAt !== null &&
    vehicle.retiredAt > at
  );
}

// --- Which period ------------------------------------------------------------------

export const REPORTING_PERIOD_KINDS = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type ReportingPeriodKind = (typeof REPORTING_PERIOD_KINDS)[number];

export interface ReportingPeriod {
  readonly kind: ReportingPeriodKind;
  /** As written in a request: `2026-09`, `2026-Q3`, or `2026`. */
  readonly label: string;
  /** Midnight in Lagos on its first day. */
  readonly start: Date;
  /** Midnight in Lagos on the day after its last: the first instant after it. */
  readonly end: Date;
}

/** Midnight in Lagos on the 1st of a month. The month may overflow. */
function lagosMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - LAGOS_OFFSET_MS);
}

/**
 * A reporting period from its label, or `null` for anything else. Years run
 * from 2000 to 2999; nothing else is a period, so a caller cannot ask for an
 * arbitrary date range.
 */
export function parseReportingPeriod(label: string): ReportingPeriod | null {
  const month = /^(2\d{3})-(0[1-9]|1[0-2])$/.exec(label);
  if (month) {
    const year = Number(month[1]);
    const index = Number(month[2]) - 1;
    return {
      kind: 'MONTH',
      label,
      start: lagosMonthStart(year, index),
      end: lagosMonthStart(year, index + 1),
    };
  }
  const quarter = /^(2\d{3})-Q([1-4])$/.exec(label);
  if (quarter) {
    const year = Number(quarter[1]);
    const first = (Number(quarter[2]) - 1) * 3;
    return {
      kind: 'QUARTER',
      label,
      start: lagosMonthStart(year, first),
      end: lagosMonthStart(year, first + 3),
    };
  }
  const year = /^(2\d{3})$/.exec(label);
  if (year) {
    const value = Number(year[1]);
    return {
      kind: 'YEAR',
      label,
      start: lagosMonthStart(value, 0),
      end: lagosMonthStart(value + 1, 0),
    };
  }
  return null;
}

/** A period that has not begun has nothing to count. */
export function hasPeriodBegun(period: ReportingPeriod, now: Date): boolean {
  return period.start <= now;
}

/**
 * The instant a period is counted at: the last moment of the period, or now
 * if it has not yet ended.
 */
export function periodCountedAt(period: ReportingPeriod, now: Date): Date {
  const last = new Date(period.end.getTime() - 1);
  return last < now ? last : now;
}

// --- What a total may say ------------------------------------------------------------

export const SUPPRESSED = 'SUPPRESSED' as const;
export type FilteredTotal = number | typeof SUPPRESSED;

/**
 * Rounds to the nearest multiple of `base`, halves up. A base of 1 leaves the
 * count as it is.
 */
export function roundToNearest(count: number, base: number): number {
  return Math.round(count / base) * base;
}

/**
 * What a filtered total may say. Suppression is decided on the exact count,
 * before rounding, so a count of 24 is suppressed and not shown as 20.
 */
export function filteredTotal(
  count: number,
  floor: number,
  base: number,
): FilteredTotal {
  return count < floor ? SUPPRESSED : roundToNearest(count, base);
}

// --- What every total says -------------------------------------------------------

/**
 * PRD Requirement 11.1 and §22 — the matter counted, and nothing more. It
 * says nothing of declaration (Requirement 12.7): the rule that decides
 * which vehicles count is the Union's, not the caller's.
 */
export const AGGREGATE_STATEMENT =
  'The number of vehicles held in NURTW records under the requested criteria.';

/** PRD §22 — what a total does not establish. */
export const AGGREGATE_LIMITATION =
  'A total is a count of NURTW records. It does not establish the ownership, roadworthiness, licensing, or insurance of any vehicle.';

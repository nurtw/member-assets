/**
 * The onboarding report (roadmap item 66, `QUESTIONS.md` GOV-25): how many people
 * and vehicles were taken on each day, and by which officer. Pure rules, so what
 * counts as a day and how a range is read are tested apart from any query.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = HOUR_MS;

/** The longest range one report covers. */
export const ONBOARDING_MAX_DAYS = 92;
/** The range shown when none is asked for: today and the 13 days before. */
export const ONBOARDING_DEFAULT_DAYS = 14;

/** The Lagos calendar day an instant falls in, as `YYYY-MM-DD`. */
export function lagosDay(instant: Date): string {
  return new Date(instant.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Lagos day begins. */
export function lagosDayBegins(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - LAGOS_OFFSET_MS);
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) {
    return false;
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export type DayRange =
  | { ok: true; from: string; to: string; starts: Date; ends: Date }
  | { ok: false; reason: 'FORMAT' | 'ORDER' | 'TOO_LONG' };

/**
 * Reads the days asked for, both included. A missing `to` is today and a missing
 * `from` is the default span before it. `ends` is the instant after the last day.
 */
export function readDayRange(
  input: { from?: string; to?: string },
  now: Date,
): DayRange {
  const to = input.to ?? lagosDay(now);
  if (!isRealDay(to) || (input.from !== undefined && !isRealDay(input.from))) {
    return { ok: false, reason: 'FORMAT' };
  }
  const from =
    input.from ??
    lagosDay(
      new Date(lagosDayBegins(to).getTime() - (ONBOARDING_DEFAULT_DAYS - 1) * DAY_MS),
    );
  if (from > to) {
    return { ok: false, reason: 'ORDER' };
  }
  const starts = lagosDayBegins(from);
  const ends = new Date(lagosDayBegins(to).getTime() + DAY_MS);
  if ((ends.getTime() - starts.getTime()) / DAY_MS > ONBOARDING_MAX_DAYS) {
    return { ok: false, reason: 'TOO_LONG' };
  }
  return { ok: true, from, to, starts, ends };
}

export const ONBOARDING_KINDS = [
  'membersRegistered',
  'vehiclesRecorded',
  'vehiclesDeclared',
  'stickersAttached',
] as const;

export type OnboardingKind = (typeof ONBOARDING_KINDS)[number];

export interface OnboardingEvent {
  at: Date;
  officerId: string;
  kind: OnboardingKind;
}

export interface OnboardingRow {
  day: string;
  officerId: string;
  membersRegistered: number;
  vehiclesRecorded: number;
  vehiclesDeclared: number;
  stickersAttached: number;
}

/**
 * One row for each day and officer that has anything, newest day first. A day an
 * officer did nothing has no row: an empty row would read as a count of nothing.
 * Within a day the busiest officer comes first, then by id so the order is stable.
 */
export function tallyOnboarding(events: readonly OnboardingEvent[]): OnboardingRow[] {
  const rows = new Map<string, OnboardingRow>();
  for (const event of events) {
    const day = lagosDay(event.at);
    const key = `${day}|${event.officerId}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        day,
        officerId: event.officerId,
        membersRegistered: 0,
        vehiclesRecorded: 0,
        vehiclesDeclared: 0,
        stickersAttached: 0,
      };
      rows.set(key, row);
    }
    row[event.kind] += 1;
  }
  const total = (row: OnboardingRow) =>
    row.membersRegistered +
    row.vehiclesRecorded +
    row.vehiclesDeclared +
    row.stickersAttached;
  return [...rows.values()].sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      total(b) - total(a) ||
      a.officerId.localeCompare(b.officerId),
  );
}

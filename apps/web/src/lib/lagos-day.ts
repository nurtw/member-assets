/**
 * The Union's day is the Lagos day (UTC+1, no daylight saving). The onboarding
 * report and the counts on Home are by that day, so a screen asks for "today" by it,
 * not by the browser's own clock zone.
 */
const LAGOS_OFFSET_MS = 3_600_000;

/** The Lagos calendar day an instant falls in, as `YYYY-MM-DD`. */
export function lagosDay(instant: Date): string {
  return new Date(instant.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Lagos day `days` before the one `instant` falls in. */
export function lagosDaysBefore(instant: Date, days: number): string {
  return lagosDay(new Date(instant.getTime() - days * 86_400_000));
}

/** A day as an officer reads it: 16 Nov 2026. */
export function readableDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

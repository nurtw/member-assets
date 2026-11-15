/**
 * How the whole application's SWR reads behave unless a screen says otherwise.
 *
 * SWR refetches every mounted key each time the browser tab regains focus,
 * throttled to once in five seconds by default. An officer who switches between
 * a spreadsheet and the System all day would send every list, panel, and
 * `/auth/me` to the API on each switch, and each of those is several database
 * queries on a database that bills for the time it is awake.
 *
 * Five minutes keeps the point of revalidating on focus (a screen left open
 * overnight is fresh when it is looked at again, and a session revoked in the
 * meantime is noticed) without paying for a refresh on every switch of tab.
 * A screen that must always be current says so for itself.
 */
export const FOCUS_THROTTLE_MS = 5 * 60 * 1000;

export const SWR_DEFAULTS = {
  focusThrottleInterval: FOCUS_THROTTLE_MS,
} as const;

/**
 * Quota enforcement for the external API (PRD §14, proposal §14.2 — item 13).
 *
 * The first of the two layers of ARCHITECTURE.md Decision 8.1. It answers one
 * question: has this organisation sent more than it may? The second layer,
 * `detection.ts`, asks a different one and is deliberately separate.
 *
 * Three limits apply to an organisation, in this order:
 *
 * - **A rate with a burst.** A token bucket: it holds `burst` tokens, refills
 *   at the rate per minute, and each request takes one.
 * - **An hourly quota**, where the profile sets one.
 * - **A daily quota**, counted over the day in Lagos, where the Union works.
 *
 * Nothing here is a limit. Every number comes from the organisation's limit
 * profile, which is a row the Union changes (Decision 8.3).
 */

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The two rates of proposal §14.2. A verification answers about one record;
 * a total answers about many, so it is allowed far less often.
 */
export const RATE_LIMIT_ROUTE_CLASSES = ['VERIFICATION', 'AGGREGATE'] as const;
export type RateLimitRouteClass = (typeof RATE_LIMIT_ROUTE_CLASSES)[number];

/**
 * The rate a scope's routes are held to. Only an `aggregate:` scope takes the
 * aggregate rate; every other external route takes the verification rate.
 */
export function routeClassForScope(scope: string): RateLimitRouteClass {
  return scope.startsWith('aggregate:') ? 'AGGREGATE' : 'VERIFICATION';
}

/** Why a request was refused by a limit. Each answers `429`. */
export const RATE_LIMIT_REFUSALS = [
  'RATE_LIMITED',
  'HOURLY_QUOTA',
  'DAILY_QUOTA',
] as const;
export type RateLimitRefusal = (typeof RATE_LIMIT_REFUSALS)[number];

/** The quota half of a limit profile. */
export interface RateLimitQuotas {
  readonly verificationPerMinute: number;
  readonly aggregatePerMinute: number;
  /** The bucket's size: how many requests may arrive at once. */
  readonly burst: number;
  /** `null` where the profile sets no hourly quota. */
  readonly hourlyQuota: number | null;
  readonly dailyQuota: number;
}

export function ratePerMinute(
  quotas: RateLimitQuotas,
  routeClass: RateLimitRouteClass,
): number {
  return routeClass === 'AGGREGATE'
    ? quotas.aggregatePerMinute
    : quotas.verificationPerMinute;
}

/**
 * The daily quota an organisation is held to: its own where one was set for
 * it, otherwise its profile's.
 */
export function effectiveDailyQuota(
  profileDailyQuota: number,
  override: number | null,
): number {
  return override ?? profileDailyQuota;
}

/**
 * How long until the bucket holds a whole token again, in whole seconds and
 * never less than one. `tokens` is what the bucket held when it refused.
 */
export function bucketRetryAfterSeconds(
  tokens: number,
  perMinute: number,
): number {
  const missing = Math.max(0, 1 - tokens);
  return Math.max(1, Math.ceil((missing * 60) / perMinute));
}

/** The start of the fixed window of `minutes` an instant falls in. */
export function windowStart(now: Date, minutes: number): Date {
  const size = minutes * MINUTE_MS;
  return new Date(Math.floor(now.getTime() / size) * size);
}

export function hourStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Midnight in Lagos on the day an instant falls in. Lagos is UTC+1 all year,
 * so the Union's day starts at 23:00 UTC.
 */
export function lagosDayStart(now: Date): Date {
  const shifted = now.getTime() + LAGOS_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - LAGOS_OFFSET_MS);
}

/** Whole seconds from `now` until `instant`, never less than one. */
export function secondsUntil(instant: Date, now: Date): number {
  return Math.max(1, Math.ceil((instant.getTime() - now.getTime()) / 1000));
}

/** When the hourly quota starts again. */
export function hourlyRetryAfterSeconds(now: Date): number {
  return secondsUntil(new Date(hourStart(now).getTime() + HOUR_MS), now);
}

/** When the daily quota starts again: the next midnight in Lagos. */
export function dailyRetryAfterSeconds(now: Date): number {
  return secondsUntil(new Date(lagosDayStart(now).getTime() + DAY_MS), now);
}

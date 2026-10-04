/**
 * Limit profiles for the external API (PRD §14, §23.12, proposal §14.2 —
 * item 13).
 *
 * A limit profile is a row holding every number an organisation is held to:
 * its rates, burst, and quotas, and the thresholds abuse detection applies to
 * it. The Union changes a profile, or composes another, without a release
 * (Requirement 14.1, ARCHITECTURE.md Decision 8.3).
 */

import {
  type AbuseSignal,
  type AbuseThresholds,
  type RateLimitQuotas,
} from '@nurtw/domain';
import { z } from 'zod';

/** Everything a limit profile sets. */
export interface RateLimitProfileValues
  extends RateLimitQuotas, AbuseThresholds {}

export interface SystemRateLimitProfile extends RateLimitProfileValues {
  readonly code: string;
  readonly label: string;
  readonly description: string;
}

/** The profile an organisation holds until an officer gives it another. */
export const DEFAULT_RATE_LIMIT_PROFILE = 'STANDARD';

/**
 * The two client types of proposal §14.2, as the rows the System starts with.
 * These are seed values. The rows are the authority once they exist, and the
 * Union may change every number in them.
 *
 * - **Rates and burst** are the proposal's, adopted as launch configuration
 *   at PRD §23.12.
 * - **Daily quotas** are the owner's direction of 3 October 2026: 1,000 and
 *   5,000 (`QUESTIONS.md` EXT-15). The standard figure is below the size of
 *   the register, so a day's quota cannot walk it.
 * - **No hourly quota** is set. The proposal names none.
 * - **The pause** is an hour, by the same direction (EXT-16).
 * - **Detection thresholds** are launch defaults the Union has not yet
 *   confirmed (EXT-17). The non-match threshold is one minute of requests at
 *   the profile's full rate.
 */
export const SYSTEM_RATE_LIMIT_PROFILES = [
  {
    code: 'STANDARD',
    label: 'Approved external client',
    description:
      'The limits an approved organisation is held to unless it is given another profile.',
    verificationPerMinute: 30,
    aggregatePerMinute: 2,
    burst: 5,
    hourlyQuota: null,
    dailyQuota: 1000,
    windowMinutes: 10,
    forgeryThreshold: 5,
    missThreshold: 30,
    missPercent: 80,
    sequenceThreshold: 5,
    sequenceReach: 3,
    pauseMinutes: 60,
  },
  {
    code: 'TRUSTED',
    label: 'Trusted operational client',
    description:
      'Higher limits, for an organisation whose approved operation needs them.',
    verificationPerMinute: 120,
    aggregatePerMinute: 5,
    burst: 20,
    hourlyQuota: null,
    dailyQuota: 5000,
    windowMinutes: 10,
    forgeryThreshold: 5,
    missThreshold: 120,
    missPercent: 80,
    sequenceThreshold: 5,
    sequenceReach: 3,
    pauseMinutes: 60,
  },
] as const satisfies readonly SystemRateLimitProfile[];

/**
 * Why the System paused an organisation, in the words an officer reads.
 * Typed over the signals, so one added without wording fails to compile.
 */
export const ABUSE_SIGNAL_LABELS: Readonly<
  Record<AbuseSignal, { label: string; description: string }>
> = {
  FORGED_CODES: {
    label: 'Forged sticker codes',
    description:
      'It sent sticker codes that were not made by the Union. A scanner reading real stickers does not.',
  },
  SEQUENTIAL_PLATES: {
    label: 'Plate numbers in sequence',
    description:
      'It checked plate numbers one step apart that matched nothing, as if working through a range.',
  },
  SEQUENTIAL_CODES: {
    label: 'Sticker numbers in sequence',
    description:
      'It checked sticker numbers one step apart that matched nothing, as if working through a range.',
  },
  HIGH_MISS_RATE: {
    label: 'Mostly non-matching checks',
    description:
      'Most of what it checked matched nothing, as if guessing identifiers.',
  },
};

const whole = (min: number, max: number) =>
  z
    .number('Enter a whole number.')
    .int('Enter a whole number.')
    .min(min, `Enter ${min.toLocaleString('en-GB')} or more.`)
    .max(max, `Enter ${max.toLocaleString('en-GB')} or less.`);

/** A reason is mandatory, and audited with the values before and after. */
const reason = z
  .string()
  .trim()
  .min(4, 'A reason is required for this change.')
  .max(1000);

const profileCode = z
  .string()
  .trim()
  .regex(
    /^[A-Z][A-Z0-9_]{2,49}$/,
    'Use capital letters, digits, and underscores, starting with a letter.',
  );

const label = z.string().trim().min(2, 'A name is required.').max(120);
const description = z.string().trim().max(500);

/**
 * The numbers a profile sets, with the bounds the screen and the API share.
 * The bounds only keep a mistyped value out. No bound is a limit: the row is.
 */
const profileValues = {
  verificationPerMinute: whole(1, 6000),
  aggregatePerMinute: whole(1, 6000),
  burst: whole(1, 1000),
  /** `null` for no hourly quota. */
  hourlyQuota: whole(1, 1_000_000).nullable(),
  dailyQuota: whole(1, 10_000_000),
  windowMinutes: whole(1, 1440),
  forgeryThreshold: whole(1, 100_000),
  missThreshold: whole(1, 1_000_000),
  missPercent: whole(1, 100),
  sequenceThreshold: whole(2, 100_000),
  sequenceReach: whole(1, 1000),
  /** At most a week. A longer block is a suspension, which an officer decides. */
  pauseMinutes: whole(1, 10_080),
};

/** `POST /rate-limits/profiles`. The code is fixed once created. */
export const createRateLimitProfileSchema = z.object({
  code: profileCode,
  label,
  description: description.optional(),
  ...profileValues,
});
export type CreateRateLimitProfileInput = z.infer<
  typeof createRateLimitProfileSchema
>;

/**
 * `PUT /rate-limits/profiles/:code` — replaces every number in the profile.
 * It applies, from the next request, to each organisation that holds it.
 */
export const updateRateLimitProfileSchema = z.object({
  label,
  description: description.optional(),
  ...profileValues,
  reason,
});
export type UpdateRateLimitProfileInput = z.infer<
  typeof updateRateLimitProfileSchema
>;

/**
 * `PUT /api-clients/:id/limits` — the organisation's limit profile, and a
 * daily quota of its own where the profile's does not fit. `null` returns it
 * to the profile's.
 */
export const setApiClientLimitsSchema = z.object({
  rateLimitProfile: profileCode,
  dailyQuota: whole(1, 10_000_000).nullable(),
  reason,
});
export type SetApiClientLimitsInput = z.infer<typeof setApiClientLimitsSchema>;

/** `POST /api-clients/:id/pause/lift`. */
export const liftApiClientPauseSchema = z.object({ reason });
export type LiftApiClientPauseInput = z.infer<typeof liftApiClientPauseSchema>;

/** A limit profile, as an officer sees it. */
export interface RateLimitProfileSummary extends RateLimitProfileValues {
  code: string;
  label: string;
  description: string | null;
  /** How many organisations hold it. */
  clientCount: number;
  updatedAt: string;
}

/** The limits one organisation is held to, and its use of them today. */
export interface ApiClientLimits {
  profile: { code: string; label: string };
  /** The daily quota in force: the organisation's own, else its profile's. */
  dailyQuota: number;
  /** The organisation's own daily quota, where one is set. */
  dailyQuotaOverride: number | null;
  /** Requests let through so far today, in Lagos. */
  usedToday: number;
}

/**
 * The last time the System paused an organisation. `active` while the pause
 * holds; afterwards the record stays, so an officer sees that it happened.
 */
export interface ApiClientPause {
  signal: AbuseSignal;
  pausedAt: string;
  pausedUntil: string;
  active: boolean;
}

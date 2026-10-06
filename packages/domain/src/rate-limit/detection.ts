/**
 * Abuse detection for the external API (PRD Requirement 14.2, proposal §14.3
 * — item 13).
 *
 * The second layer of ARCHITECTURE.md Decision 8.1. A quota counts requests.
 * This looks at what the requests were and how they turned out, so that an
 * organisation testing identifiers one after another is stopped while still
 * inside its quota (acceptance criterion 8).
 *
 * Three patterns are looked for:
 *
 * - **Forged codes.** A signed code that fails its signature was not minted
 *   by the Union. An integrator scanning real stickers never sends one.
 * - **A sequence.** Plates or legacy barcodes that differ only by a step in
 *   their number, and do not match: ABC101XY, ABC102XY, ABC103XY.
 * - **A high non-match rate.** Guessing at random matches almost nothing. An
 *   organisation checking vehicles that present as NURTW vehicles matches
 *   most of the time.
 *
 * A signal pauses the organisation for a time (the owner's direction of
 * 3 October 2026). Every threshold comes from the organisation's limit
 * profile, which is a row the Union changes (Decision 8.3).
 */

export const ABUSE_SIGNALS = [
  'FORGED_CODES',
  'SEQUENTIAL_PLATES',
  'SEQUENTIAL_CODES',
  'HIGH_MISS_RATE',
] as const;
export type AbuseSignal = (typeof ABUSE_SIGNALS)[number];

export function isAbuseSignal(value: string): value is AbuseSignal {
  return (ABUSE_SIGNALS as readonly string[]).includes(value);
}

/** The detection half of a limit profile. */
export interface AbuseThresholds {
  /** The fixed window, in minutes, that checks are counted over. */
  readonly windowMinutes: number;
  /** Forged codes in one window that pause the organisation. */
  readonly forgeryThreshold: number;
  /** Non-matches in one window, at or above `missPercent` of its checks. */
  readonly missThreshold: number;
  readonly missPercent: number;
  /** Non-matching steps in one sequence that pause the organisation. */
  readonly sequenceThreshold: number;
  /** How far apart two numbers may be and still count as a step. */
  readonly sequenceReach: number;
  /** How long a pause lasts, in minutes. */
  readonly pauseMinutes: number;
}

/** How one check turned out, as the request log classes it. */
export const OBSERVED_OUTCOMES = [
  'MATCH',
  'NO_MATCH',
  'INVALID_SIGNATURE',
] as const;
export type ObservedOutcome = (typeof OBSERVED_OUTCOMES)[number];

export function isObservedOutcome(value: string): value is ObservedOutcome {
  return (OBSERVED_OUTCOMES as readonly string[]).includes(value);
}

/**
 * What one check adds to the window's counts. A forged code is a non-match
 * as well as a forgery.
 *
 * A request refused as badly formed is not counted. It was never looked up,
 * and its refusal describes only the request, so it tests nothing.
 */
export function tallyOutcome(outcome: ObservedOutcome): {
  miss: number;
  forgery: number;
} {
  return {
    miss: outcome === 'MATCH' ? 0 : 1,
    forgery: outcome === 'INVALID_SIGNATURE' ? 1 : 0,
  };
}

/** Longest run of digits read as a number. Beyond it, precision is lost. */
const MAX_SEQUENCE_DIGITS = 15;

/**
 * Where an identifier sits in a sequence: everything but its last run of
 * digits, and that run as a number. `ABC123XY` is 123 in `ABC###XY`. The
 * stem keeps the run's width, so `ABC12XY` is in a different sequence.
 */
export interface SequencePosition {
  readonly stem: string;
  readonly number: number;
}

/**
 * `null` where the identifier has no digits, or too many to compare. Such an
 * identifier is in no sequence and neither extends nor breaks one.
 */
export function sequencePosition(identifier: string): SequencePosition | null {
  const match = /^(.*?)(\d+)(\D*)$/.exec(identifier);
  if (!match) {
    return null;
  }
  const [, before = '', digits = '', after = ''] = match;
  if (digits.length > MAX_SEQUENCE_DIGITS) {
    return null;
  }
  return {
    stem: `${before}${'#'.repeat(digits.length)}${after}`,
    number: Number(digits),
  };
}

/** The last identifier an organisation presented, and the run it was in. */
export interface SequenceState extends SequencePosition {
  /** Non-matching steps so far in this sequence. */
  readonly run: number;
  readonly updatedAt: Date;
}

/**
 * The run after one more check.
 *
 * - A step is the same stem with a number within `reach` of the last one.
 * - **Only a non-match adds to the run.** A fleet of buses registered
 *   together carries plates in sequence, and verifying them in turn matches
 *   every time. A match keeps the sequence going and adds nothing.
 * - The same identifier again neither adds to the run nor ends it.
 * - Anything else starts again, as does a sequence last seen before
 *   `freshSince`.
 */
export function advanceSequence(
  previous: SequenceState | null,
  current: SequencePosition,
  options: { missed: boolean; reach: number; freshSince: Date },
): number {
  const start = options.missed ? 1 : 0;
  if (
    previous === null ||
    previous.updatedAt.getTime() < options.freshSince.getTime() ||
    previous.stem !== current.stem
  ) {
    return start;
  }
  const distance = Math.abs(current.number - previous.number);
  if (distance === 0) {
    return previous.run;
  }
  if (distance <= options.reach) {
    return previous.run + (options.missed ? 1 : 0);
  }
  return start;
}

/** What detection knows of an organisation after a check. */
export interface AbuseEvidence {
  /** Checks, non-matches, and forged codes in the current window. */
  readonly checks: number;
  readonly misses: number;
  readonly forgeries: number;
  /** The run each kind of identifier is in. Zero where none was presented. */
  readonly plateRun: number;
  readonly codeRun: number;
}

/**
 * The signal the evidence amounts to, or `null`. The most specific is named
 * first: a forgery or a sequence says more than a rate does.
 */
export function detectAbuse(
  evidence: AbuseEvidence,
  thresholds: AbuseThresholds,
): AbuseSignal | null {
  if (evidence.forgeries >= thresholds.forgeryThreshold) {
    return 'FORGED_CODES';
  }
  if (evidence.plateRun >= thresholds.sequenceThreshold) {
    return 'SEQUENTIAL_PLATES';
  }
  if (evidence.codeRun >= thresholds.sequenceThreshold) {
    return 'SEQUENTIAL_CODES';
  }
  if (
    evidence.misses >= thresholds.missThreshold &&
    evidence.misses * 100 >= thresholds.missPercent * evidence.checks
  ) {
    return 'HIGH_MISS_RATE';
  }
  return null;
}

/** When a pause starting at `now` ends. */
export function pauseEnd(now: Date, pauseMinutes: number): Date {
  return new Date(now.getTime() + pauseMinutes * 60 * 1000);
}

/** A pause holds until its end. One that has ended, or was never set, does not. */
export function isPaused(pausedUntil: Date | null, now: Date): boolean {
  return pausedUntil !== null && pausedUntil.getTime() > now.getTime();
}

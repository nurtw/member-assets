import { describe, expect, it } from 'vitest';

import {
  ABUSE_SIGNALS,
  advanceSequence,
  detectAbuse,
  isAbuseSignal,
  isObservedOutcome,
  isPaused,
  pauseEnd,
  sequencePosition,
  tallyOutcome,
  type AbuseEvidence,
  type AbuseThresholds,
  type SequenceState,
} from './detection.js';

const NOW = new Date('2026-10-03T12:00:00Z');
const MINUTE = 60 * 1000;

const THRESHOLDS: AbuseThresholds = {
  windowMinutes: 10,
  forgeryThreshold: 5,
  missThreshold: 30,
  missPercent: 80,
  sequenceThreshold: 5,
  sequenceReach: 3,
  pauseMinutes: 60,
};

const evidence = (overrides: Partial<AbuseEvidence> = {}): AbuseEvidence => ({
  checks: 0,
  misses: 0,
  forgeries: 0,
  plateRun: 0,
  codeRun: 0,
  ...overrides,
});

describe('where an identifier sits in a sequence', () => {
  it('splits a plate at its digits', () => {
    expect(sequencePosition('ABC123XY')).toEqual({
      stem: 'ABC###XY',
      number: 123,
    });
    expect(sequencePosition('ABC007XY')).toEqual({
      stem: 'ABC###XY',
      number: 7,
    });
  });

  it('reads a Transpay barcode as one number', () => {
    expect(sequencePosition('1600000000001')).toEqual({
      stem: '#############',
      number: 1_600_000_000_001,
    });
  });

  it('uses the last run of digits', () => {
    expect(sequencePosition('A1B22C')).toEqual({ stem: 'A1B##C', number: 22 });
    expect(sequencePosition('KJA12')).toEqual({ stem: 'KJA##', number: 12 });
  });

  it('keeps the width, so a shorter number is another sequence', () => {
    expect(sequencePosition('ABC12XY')?.stem).toBe('ABC##XY');
    expect(sequencePosition('ABC123XY')?.stem).toBe('ABC###XY');
  });

  it('places nothing with no digits, or too many to compare', () => {
    expect(sequencePosition('ABCDEFG')).toBeNull();
    expect(sequencePosition('')).toBeNull();
    expect(sequencePosition('1'.repeat(16))).toBeNull();
    expect(sequencePosition('1'.repeat(15))).not.toBeNull();
  });
});

describe('a run of steps', () => {
  const fresh = { reach: 3, freshSince: new Date(NOW.getTime() - 10 * MINUTE) };
  const state = (
    number: number,
    run: number,
    overrides: Partial<SequenceState> = {},
  ): SequenceState => ({
    stem: 'ABC###XY',
    number,
    run,
    updatedAt: NOW,
    ...overrides,
  });
  const plate = (number: number) => ({ stem: 'ABC###XY', number });

  it('starts at one on a non-match, and at nothing on a match', () => {
    expect(advanceSequence(null, plate(100), { ...fresh, missed: true })).toBe(
      1,
    );
    expect(advanceSequence(null, plate(100), { ...fresh, missed: false })).toBe(
      0,
    );
  });

  it('grows with each non-matching step', () => {
    let run = 0;
    let previous: SequenceState | null = null;
    for (const number of [100, 101, 102, 103, 104]) {
      run = advanceSequence(previous, plate(number), {
        ...fresh,
        missed: true,
      });
      previous = state(number, run);
    }
    expect(run).toBe(5);
  });

  it('counts a step in either direction, within the reach', () => {
    const options = { ...fresh, missed: true };
    expect(advanceSequence(state(100, 2), plate(99), options)).toBe(3);
    expect(advanceSequence(state(100, 2), plate(103), options)).toBe(3);
    expect(advanceSequence(state(100, 2), plate(104), options)).toBe(1);
  });

  it('is not grown by a match, which keeps it going', () => {
    // A fleet registered together, verified in turn: every plate matches.
    let previous: SequenceState | null = null;
    for (const number of [100, 101, 102, 103, 104, 105]) {
      const run = advanceSequence(previous, plate(number), {
        ...fresh,
        missed: false,
      });
      expect(run).toBe(0);
      previous = state(number, run);
    }
    // A match in the middle of a walk does not hide the walk.
    expect(
      advanceSequence(state(102, 3), plate(103), { ...fresh, missed: false }),
    ).toBe(3);
    expect(
      advanceSequence(state(103, 3), plate(104), { ...fresh, missed: true }),
    ).toBe(4);
  });

  it('is neither grown nor ended by the same identifier again', () => {
    expect(
      advanceSequence(state(100, 3), plate(100), { ...fresh, missed: true }),
    ).toBe(3);
  });

  it('starts again on another stem, a far number, or a stale sequence', () => {
    const options = { ...fresh, missed: true };
    expect(
      advanceSequence(
        state(100, 4),
        { stem: 'XYZ###AB', number: 101 },
        options,
      ),
    ).toBe(1);
    expect(advanceSequence(state(100, 4), plate(500), options)).toBe(1);
    expect(
      advanceSequence(
        state(100, 4, { updatedAt: new Date(NOW.getTime() - 11 * MINUTE) }),
        plate(101),
        options,
      ),
    ).toBe(1);
  });
});

describe('what a check adds to the counts', () => {
  it('counts a forged code as a non-match too', () => {
    expect(tallyOutcome('MATCH')).toEqual({ miss: 0, forgery: 0 });
    expect(tallyOutcome('NO_MATCH')).toEqual({ miss: 1, forgery: 0 });
    expect(tallyOutcome('INVALID_SIGNATURE')).toEqual({ miss: 1, forgery: 1 });
  });

  it('observes only a check that was decided', () => {
    expect(isObservedOutcome('MATCH')).toBe(true);
    expect(isObservedOutcome('NO_MATCH')).toBe(true);
    expect(isObservedOutcome('INVALID_SIGNATURE')).toBe(true);
    for (const other of ['INVALID_REQUEST', 'UNAVAILABLE', 'ERROR', 'OK']) {
      expect(isObservedOutcome(other)).toBe(false);
    }
  });
});

describe('the signal', () => {
  it('is nothing for ordinary use', () => {
    expect(detectAbuse(evidence(), THRESHOLDS)).toBeNull();
    expect(
      detectAbuse(evidence({ checks: 200, misses: 20 }), THRESHOLDS),
    ).toBeNull();
    expect(
      detectAbuse(
        evidence({ checks: 40, misses: 29, forgeries: 4, plateRun: 4 }),
        THRESHOLDS,
      ),
    ).toBeNull();
  });

  it('is raised by forged codes at the threshold', () => {
    expect(
      detectAbuse(evidence({ checks: 5, misses: 5, forgeries: 5 }), THRESHOLDS),
    ).toBe('FORGED_CODES');
  });

  it('is raised by a sequence of plates or of codes', () => {
    expect(detectAbuse(evidence({ plateRun: 5 }), THRESHOLDS)).toBe(
      'SEQUENTIAL_PLATES',
    );
    expect(detectAbuse(evidence({ codeRun: 5 }), THRESHOLDS)).toBe(
      'SEQUENTIAL_CODES',
    );
  });

  it('is raised by non-matches only at both the count and the share', () => {
    expect(detectAbuse(evidence({ checks: 30, misses: 30 }), THRESHOLDS)).toBe(
      'HIGH_MISS_RATE',
    );
    expect(detectAbuse(evidence({ checks: 100, misses: 80 }), THRESHOLDS)).toBe(
      'HIGH_MISS_RATE',
    );
    // Enough non-matches, but most checks matched.
    expect(
      detectAbuse(evidence({ checks: 100, misses: 79 }), THRESHOLDS),
    ).toBeNull();
    // Every check missed, but too few to judge.
    expect(
      detectAbuse(evidence({ checks: 29, misses: 29 }), THRESHOLDS),
    ).toBeNull();
  });

  it('names the most specific pattern first', () => {
    const everything = evidence({
      checks: 50,
      misses: 50,
      forgeries: 5,
      plateRun: 9,
      codeRun: 9,
    });
    expect(detectAbuse(everything, THRESHOLDS)).toBe('FORGED_CODES');
    expect(detectAbuse({ ...everything, forgeries: 0 }, THRESHOLDS)).toBe(
      'SEQUENTIAL_PLATES',
    );
    expect(
      detectAbuse({ ...everything, forgeries: 0, plateRun: 0 }, THRESHOLDS),
    ).toBe('SEQUENTIAL_CODES');
  });

  it('is one of a closed list', () => {
    for (const signal of ABUSE_SIGNALS) {
      expect(isAbuseSignal(signal)).toBe(true);
    }
    expect(isAbuseSignal('SUSPICIOUS')).toBe(false);
  });
});

describe('a pause', () => {
  it('lasts the minutes the profile gives', () => {
    expect(pauseEnd(NOW, 60)).toEqual(new Date('2026-10-03T13:00:00Z'));
    expect(pauseEnd(NOW, 15)).toEqual(new Date('2026-10-03T12:15:00Z'));
  });

  it('holds until its end, and not after', () => {
    expect(isPaused(null, NOW)).toBe(false);
    expect(isPaused(new Date(NOW.getTime() + 1), NOW)).toBe(true);
    expect(isPaused(NOW, NOW)).toBe(false);
    expect(isPaused(new Date(NOW.getTime() - MINUTE), NOW)).toBe(false);
  });
});

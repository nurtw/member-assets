import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_MAX_DAYS,
  lagosDay,
  lagosDayBegins,
  readDayRange,
  tallyOnboarding,
} from './onboarding.js';

describe('lagosDay', () => {
  it('puts 23:00 UTC in the next Lagos day', () => {
    expect(lagosDay(new Date('2026-11-15T22:59:59Z'))).toBe('2026-11-15');
    expect(lagosDay(new Date('2026-11-15T23:00:00Z'))).toBe('2026-11-16');
  });

  it('begins a Lagos day at 23:00 UTC the evening before', () => {
    expect(lagosDayBegins('2026-11-16').toISOString()).toBe('2026-11-15T23:00:00.000Z');
  });
});

describe('readDayRange', () => {
  const now = new Date('2026-11-16T10:00:00Z');

  it('reads today and the 13 days before when nothing is asked', () => {
    const range = readDayRange({}, now);
    expect(range).toMatchObject({ ok: true, from: '2026-11-03', to: '2026-11-16' });
  });

  it('ends after the last day asked for, so that day is included', () => {
    const range = readDayRange({ from: '2026-11-16', to: '2026-11-16' }, now);
    expect(range.ok && range.ends.getTime() - range.starts.getTime()).toBe(86_400_000);
  });

  it('refuses a day that is not one', () => {
    expect(readDayRange({ from: '2026-02-30' }, now)).toEqual({ ok: false, reason: 'FORMAT' });
    expect(readDayRange({ to: 'yesterday' }, now)).toEqual({ ok: false, reason: 'FORMAT' });
  });

  it('refuses a start after the end', () => {
    expect(readDayRange({ from: '2026-11-10', to: '2026-11-09' }, now)).toEqual({
      ok: false,
      reason: 'ORDER',
    });
  });

  it('refuses more than the limit and accepts exactly the limit', () => {
    expect(ONBOARDING_MAX_DAYS).toBe(92);
    expect(readDayRange({ from: '2026-08-16', to: '2026-11-16' }, now)).toEqual({
      ok: false,
      reason: 'TOO_LONG',
    });
    expect(readDayRange({ from: '2026-08-17', to: '2026-11-16' }, now).ok).toBe(true);
  });
});

describe('tallyOnboarding', () => {
  const at = (iso: string) => new Date(iso);

  it('counts each kind per day per officer', () => {
    const rows = tallyOnboarding([
      { at: at('2026-11-16T09:00:00Z'), officerId: 'a', kind: 'membersRegistered' },
      { at: at('2026-11-16T10:00:00Z'), officerId: 'a', kind: 'membersRegistered' },
      { at: at('2026-11-16T10:00:00Z'), officerId: 'a', kind: 'vehiclesRecorded' },
      { at: at('2026-11-16T11:00:00Z'), officerId: 'b', kind: 'stickersAttached' },
      { at: at('2026-11-15T09:00:00Z'), officerId: 'a', kind: 'vehiclesDeclared' },
    ]);
    expect(rows).toEqual([
      {
        day: '2026-11-16',
        officerId: 'a',
        membersRegistered: 2,
        vehiclesRecorded: 1,
        vehiclesDeclared: 0,
        stickersAttached: 0,
      },
      {
        day: '2026-11-16',
        officerId: 'b',
        membersRegistered: 0,
        vehiclesRecorded: 0,
        vehiclesDeclared: 0,
        stickersAttached: 1,
      },
      {
        day: '2026-11-15',
        officerId: 'a',
        membersRegistered: 0,
        vehiclesRecorded: 0,
        vehiclesDeclared: 1,
        stickersAttached: 0,
      },
    ]);
  });

  it('splits an evening and the next morning at the Lagos midnight', () => {
    const rows = tallyOnboarding([
      { at: at('2026-11-15T22:30:00Z'), officerId: 'a', kind: 'membersRegistered' },
      { at: at('2026-11-15T23:30:00Z'), officerId: 'a', kind: 'membersRegistered' },
    ]);
    expect(rows.map((row) => row.day)).toEqual(['2026-11-16', '2026-11-15']);
  });

  it('gives a day with nothing no row', () => {
    expect(tallyOnboarding([])).toEqual([]);
  });
});

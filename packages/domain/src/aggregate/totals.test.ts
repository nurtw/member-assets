import { describe, expect, it } from 'vitest';

import {
  SUPPRESSED,
  filteredTotal,
  hasPeriodBegun,
  isCountedAt,
  parseReportingPeriod,
  periodCountedAt,
  roundToNearest,
  type CountableVehicle,
} from './totals.js';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-04T12:00:00Z');

const vehicle = (
  overrides: Partial<CountableVehicle> = {},
): CountableVehicle => ({
  status: 'ACTIVE',
  declaredAt: at('2026-09-01T09:00:00Z'),
  firstAttachedAt: at('2026-09-02T09:00:00Z'),
  retiredAt: null,
  ...overrides,
});

describe('which vehicle counts (Requirement 13.5)', () => {
  it('counts a vehicle declared and onboarded', () => {
    expect(isCountedAt(vehicle(), NOW)).toBe(true);
  });

  it('never counts a vehicle only on record, or declared and not onboarded', () => {
    expect(
      isCountedAt(
        vehicle({
          status: 'ON_RECORD',
          declaredAt: null,
          firstAttachedAt: null,
        }),
        NOW,
      ),
    ).toBe(false);
    expect(isCountedAt(vehicle({ firstAttachedAt: null }), NOW)).toBe(false);
    // On record and onboarded, but never declared.
    expect(
      isCountedAt(vehicle({ status: 'ON_RECORD', declaredAt: null }), NOW),
    ).toBe(false);
  });

  it('counts a vehicle only from the later of declaring and onboarding', () => {
    expect(isCountedAt(vehicle(), at('2026-09-01T12:00:00Z'))).toBe(false);
    expect(isCountedAt(vehicle(), at('2026-09-02T09:00:00Z'))).toBe(true);
  });

  it('counts a retired vehicle only before its retirement', () => {
    const retired = vehicle({
      status: 'RETIRED',
      retiredAt: at('2026-09-20T09:00:00Z'),
    });
    expect(isCountedAt(retired, at('2026-09-10T00:00:00Z'))).toBe(true);
    expect(isCountedAt(retired, at('2026-09-20T09:00:00Z'))).toBe(false);
    expect(isCountedAt(retired, NOW)).toBe(false);
  });

  it('leaves out a vehicle suspended or disputed now, in every period', () => {
    for (const status of ['SUSPENDED', 'DISPUTED', 'ARCHIVED', 'PENDING']) {
      expect(isCountedAt(vehicle({ status }), at('2026-09-10T00:00:00Z'))).toBe(
        false,
      );
    }
  });
});

describe('reporting periods', () => {
  it('reads a month, a quarter, and a year, in Lagos', () => {
    expect(parseReportingPeriod('2026-09')).toEqual({
      kind: 'MONTH',
      label: '2026-09',
      start: at('2026-08-31T23:00:00Z'),
      end: at('2026-09-30T23:00:00Z'),
    });
    expect(parseReportingPeriod('2026-Q3')).toMatchObject({
      kind: 'QUARTER',
      start: at('2026-06-30T23:00:00Z'),
      end: at('2026-09-30T23:00:00Z'),
    });
    expect(parseReportingPeriod('2026-Q4')?.end).toEqual(
      at('2026-12-31T23:00:00Z'),
    );
    expect(parseReportingPeriod('2026')).toMatchObject({
      kind: 'YEAR',
      start: at('2025-12-31T23:00:00Z'),
      end: at('2026-12-31T23:00:00Z'),
    });
    expect(parseReportingPeriod('2026-12')?.end).toEqual(
      at('2026-12-31T23:00:00Z'),
    );
  });

  it('refuses anything that is not one of them', () => {
    for (const label of [
      '2026-13',
      '2026-00',
      '2026-9',
      '2026-Q5',
      '2026-q3',
      '26',
      '1999',
      '2026-09-01',
      '2026-09..2026-10',
      '',
      ' 2026',
    ]) {
      expect(parseReportingPeriod(label), label).toBeNull();
    }
  });

  it('counts an ended period at its last moment, and a current one now', () => {
    const september = parseReportingPeriod('2026-09')!;
    expect(periodCountedAt(september, NOW)).toEqual(
      at('2026-09-30T22:59:59.999Z'),
    );
    const october = parseReportingPeriod('2026-10')!;
    expect(periodCountedAt(october, NOW)).toEqual(NOW);
  });

  it('knows a period that has not begun', () => {
    expect(hasPeriodBegun(parseReportingPeriod('2026-10')!, NOW)).toBe(true);
    expect(hasPeriodBegun(parseReportingPeriod('2026-11')!, NOW)).toBe(false);
    expect(hasPeriodBegun(parseReportingPeriod('2027')!, NOW)).toBe(false);
  });
});

describe('what a filtered total may say', () => {
  it('is suppressed below the floor, judged on the exact count (Requirement 13.3)', () => {
    expect(filteredTotal(0, 25, 10)).toBe(SUPPRESSED);
    expect(filteredTotal(24, 25, 10)).toBe(SUPPRESSED);
    expect(filteredTotal(25, 25, 10)).toBe(30);
  });

  it('is rounded to the nearest base otherwise, halves up', () => {
    expect(filteredTotal(1284, 25, 10)).toBe(1280);
    expect(filteredTotal(1285, 25, 10)).toBe(1290);
    expect(filteredTotal(34, 25, 10)).toBe(30);
    expect(roundToNearest(1284, 1)).toBe(1284);
    expect(roundToNearest(1284, 100)).toBe(1300);
  });

  it('cannot be subtracted to uncover a suppressed total exactly', () => {
    // A branch of three units, one of them small.
    const units = [212, 147, 9];
    const branch = filteredTotal(
      units.reduce((sum, n) => sum + n, 0),
      25,
      10,
    ) as number;
    const others = units
      .slice(0, 2)
      .map((n) => filteredTotal(n, 25, 10) as number)
      .reduce((sum, n) => sum + n, 0);
    expect(filteredTotal(9, 25, 10)).toBe(SUPPRESSED);
    // The difference is not the small unit's count.
    expect(branch - others).not.toBe(9);
  });
});

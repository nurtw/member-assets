import { describe, expect, it } from 'vitest';

import {
  allocateCredit,
  parseAllocationOrder,
  type OutstandingDue,
} from './allocation.js';

function lagos(date: string, time = '00:00:00'): Date {
  return new Date(`${date}T${time}+01:00`);
}

const LEVY = 700_000;
const FEE = 3_000_000;

function levyMonth(
  vehicleId: string,
  month: string,
  outstandingKobo = LEVY,
): OutstandingDue {
  return {
    subjectType: 'vehicle',
    subjectId: vehicleId,
    feeTypeCode: 'LEVY',
    period: month,
    dueOn: lagos(`${month}-01`),
    outstandingKobo,
  };
}

function membership(dueOn: Date, outstandingKobo = FEE): OutstandingDue {
  return {
    subjectType: 'member',
    subjectId: 'member-1',
    feeTypeCode: 'MEMBERSHIP',
    period: dueOn.toISOString().slice(0, 10),
    dueOn,
    outstandingKobo,
  };
}

describe('allocateCredit (PRD Requirement 27.7, PAY-12)', () => {
  it('pays the oldest due first, across vehicles and the membership fee', () => {
    const result = allocateCredit({
      creditKobo: LEVY + FEE,
      dues: [
        levyMonth('vehicle-b', '2026-12'),
        membership(lagos('2026-11-20', '09:00:00')),
        levyMonth('vehicle-a', '2026-11'),
      ],
      order: 'OLDEST_FIRST',
    });
    expect(
      result.allocations.map((a) => [a.subjectId, a.period, a.amountKobo]),
    ).toEqual([
      ['vehicle-a', '2026-11', LEVY],
      ['member-1', '2026-11-20', FEE],
    ]);
    expect(result.remainingKobo).toBe(0);
    expect(result.outstanding.map((d) => [d.subjectId, d.period])).toEqual([
      ['vehicle-b', '2026-12'],
    ]);
  });

  it('pays a due in part when the money runs out, and leaves the rest outstanding', () => {
    const result = allocateCredit({
      creditKobo: LEVY + 200_000,
      dues: [
        levyMonth('vehicle-a', '2026-11'),
        levyMonth('vehicle-a', '2026-12'),
      ],
      order: 'OLDEST_FIRST',
    });
    expect(result.allocations.map((a) => [a.period, a.amountKobo])).toEqual([
      ['2026-11', LEVY],
      ['2026-12', 200_000],
    ]);
    expect(result.outstanding).toEqual([
      levyMonth('vehicle-a', '2026-12', LEVY - 200_000),
    ]);
  });

  it('chips at the membership fee when it is the oldest due, rather than skipping it', () => {
    const result = allocateCredit({
      creditKobo: LEVY,
      dues: [
        membership(lagos('2026-10-15')),
        levyMonth('vehicle-a', '2026-11'),
      ],
      order: 'OLDEST_FIRST',
    });
    expect(result.allocations).toEqual([
      expect.objectContaining({ feeTypeCode: 'MEMBERSHIP', amountKobo: LEVY }),
    ]);
  });

  it('holds what is left once everything outstanding is paid', () => {
    const result = allocateCredit({
      creditKobo: 2 * LEVY + 50_000,
      dues: [
        levyMonth('vehicle-a', '2026-11'),
        levyMonth('vehicle-b', '2026-11'),
      ],
      order: 'OLDEST_FIRST',
    });
    expect(result.remainingKobo).toBe(50_000);
    expect(result.outstanding).toEqual([]);
  });

  it('breaks a tie the same way every time: the member, then by vehicle', () => {
    const sameDay = lagos('2026-11-01');
    const dues = [
      levyMonth('vehicle-b', '2026-11'),
      levyMonth('vehicle-a', '2026-11'),
      membership(sameDay),
    ];
    const first = allocateCredit({
      creditKobo: FEE + LEVY,
      dues,
      order: 'OLDEST_FIRST',
    });
    const second = allocateCredit({
      creditKobo: FEE + LEVY,
      dues: [...dues].reverse(),
      order: 'OLDEST_FIRST',
    });
    expect(first.allocations.map((a) => a.subjectId)).toEqual([
      'member-1',
      'vehicle-a',
    ]);
    expect(second.allocations).toEqual(first.allocations);
  });

  it('allocates nothing from no credit, and never from a negative one', () => {
    for (const creditKobo of [0, -LEVY]) {
      const result = allocateCredit({
        creditKobo,
        dues: [levyMonth('vehicle-a', '2026-11')],
        order: 'OLDEST_FIRST',
      });
      expect(result.allocations).toEqual([]);
      expect(result.remainingKobo).toBe(0);
    }
  });

  it('can put dues charged against the member, or against vehicles, first (the order is a setting)', () => {
    const dues = [
      levyMonth('vehicle-a', '2026-10'),
      membership(lagos('2026-11-15')),
    ];
    expect(
      allocateCredit({ creditKobo: LEVY, dues, order: 'MEMBER_DUES_FIRST' })
        .allocations[0]?.subjectType,
    ).toBe('member');
    expect(
      allocateCredit({ creditKobo: LEVY, dues, order: 'VEHICLE_DUES_FIRST' })
        .allocations[0]?.subjectType,
    ).toBe('vehicle');
  });
});

describe('parseAllocationOrder', () => {
  it('reads a known order and falls back to the answered one otherwise', () => {
    expect(parseAllocationOrder('member_dues_first')).toBe('MEMBER_DUES_FIRST');
    expect(parseAllocationOrder(null)).toBe('OLDEST_FIRST');
    expect(parseAllocationOrder('NEWEST_FIRST')).toBe('OLDEST_FIRST');
  });
});

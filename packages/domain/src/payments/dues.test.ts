import { describe, expect, it } from 'vitest';

import {
  addTwelveMonths,
  lagosMonthLabel,
  levySchedule,
  membershipCover,
} from './dues.js';
import { resolveFeeAmountAtKobo, type FeeAmountChange } from './fee-amount.js';

const LEVY = 700_000;
const flat = () => LEVY;

/** Midnight in Lagos (UTC+1) on a calendar date. */
function lagos(date: string, time = '00:00:00'): Date {
  return new Date(`${date}T${time}+01:00`);
}

describe('levySchedule (PRD Requirement 27.13)', () => {
  it('owes nothing for a vehicle that has not been onboarded', () => {
    const schedule = levySchedule({
      onboardedAt: null,
      now: lagos('2027-03-15'),
      creditKobo: 0,
      amountForMonth: flat,
    });
    expect(schedule).toMatchObject({
      status: 'NOT_DUE',
      firstDueOn: null,
      months: [],
      outstandingKobo: 0,
      nextDueOn: null,
    });
  });

  it('starts with the month after onboarding, with no proration', () => {
    // Onboarded on the 30th: nothing for the rest of October, all of November.
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-30', '16:00:00'),
      now: lagos('2026-11-01'),
      creditKobo: 0,
      amountForMonth: flat,
    });
    expect(schedule.firstDueOn).toEqual(lagos('2026-11-01'));
    expect(schedule.months.map((m) => m.month)).toEqual(['2026-11']);
    expect(schedule.months[0]!.amountKobo).toBe(LEVY);
    expect(schedule.status).toBe('OWED');
  });

  it('owes nothing in the month of onboarding itself', () => {
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-02'),
      now: lagos('2026-10-31', '23:59:59'),
      creditKobo: 0,
      amountForMonth: flat,
    });
    expect(schedule.status).toBe('NOT_DUE');
    expect(schedule.months).toEqual([]);
    expect(schedule.nextDueOn).toEqual(lagos('2026-11-01'));
  });

  it('counts months in Lagos time, not UTC', () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Awka: the vehicle was
    // onboarded in November, so its levy starts in December.
    const schedule = levySchedule({
      onboardedAt: new Date('2026-10-31T23:30:00Z'),
      now: lagos('2026-12-15'),
      creditKobo: 0,
      amountForMonth: flat,
    });
    expect(schedule.months.map((m) => m.month)).toEqual(['2026-12']);
  });

  it('accumulates unpaid months across a year end, and calls earlier ones arrears', () => {
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-10'),
      now: lagos('2027-02-10'),
      creditKobo: 0,
      amountForMonth: flat,
    });
    expect(schedule.months.map((m) => m.month)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(schedule.outstandingKobo).toBe(4 * LEVY);
    expect(schedule.status).toBe('IN_ARREARS');
    expect(schedule.nextDueOn).toEqual(lagos('2027-03-01'));
  });

  it('pays the oldest month first and is only owed when the current month is the one unpaid', () => {
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-10'),
      now: lagos('2027-01-10'),
      creditKobo: 2 * LEVY,
      amountForMonth: flat,
    });
    expect(schedule.months.map((m) => m.outstandingKobo)).toEqual([0, 0, LEVY]);
    expect(schedule.status).toBe('OWED');
    expect(schedule.creditKobo).toBe(0);
  });

  it('shows a part-paid month as part paid', () => {
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-10'),
      now: lagos('2026-12-10'),
      creditKobo: LEVY + 200_000,
      amountForMonth: flat,
    });
    expect(schedule.months[1]).toMatchObject({
      paidKobo: 200_000,
      outstandingKobo: LEVY - 200_000,
    });
    expect(schedule.status).toBe('OWED');
  });

  it('holds what is paid beyond the months due as credit (PAY-12)', () => {
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-10'),
      now: lagos('2026-11-10'),
      creditKobo: 3 * LEVY,
      amountForMonth: flat,
    });
    expect(schedule.status).toBe('PAID');
    expect(schedule.outstandingKobo).toBe(0);
    expect(schedule.creditKobo).toBe(2 * LEVY);
  });

  it('treats a refund larger than the credits as no credit, never a negative one', () => {
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-10'),
      now: lagos('2026-11-10'),
      creditKobo: -LEVY,
      amountForMonth: flat,
    });
    expect(schedule.creditKobo).toBe(0);
    expect(schedule.outstandingKobo).toBe(LEVY);
  });

  it('keeps a month paid at the old amount paid after the levy rises', () => {
    // The reason the amount history exists. November and December were paid
    // at 7,000. The levy rises to 8,000 on 1 January.
    const rise = lagos('2027-01-01');
    const schedule = levySchedule({
      onboardedAt: lagos('2026-10-10'),
      now: lagos('2027-01-10'),
      creditKobo: 2 * LEVY,
      amountForMonth: (dueOn) => (dueOn.getTime() >= rise.getTime() ? 800_000 : LEVY),
    });
    expect(schedule.months.map((m) => [m.month, m.amountKobo, m.outstandingKobo])).toEqual([
      ['2026-11', 700_000, 0],
      ['2026-12', 700_000, 0],
      ['2027-01', 800_000, 800_000],
    ]);
    expect(schedule.status).toBe('OWED');
  });
});

describe('resolveFeeAmountAtKobo', () => {
  const current = {
    defaultAmountKobo: 800_000,
    prices: [{ routeTypeId: 'interstate', amountKobo: 900_000 }],
  };
  const epoch = new Date(0);

  it('uses the current amount for a price that has never changed', () => {
    expect(
      resolveFeeAmountAtKobo({ at: lagos('2026-11-01'), routeTypeId: null, current, history: [] }),
    ).toBe(800_000);
    expect(
      resolveFeeAmountAtKobo({
        at: lagos('2026-11-01'),
        routeTypeId: 'interstate',
        current,
        history: [],
      }),
    ).toBe(900_000);
  });

  it('returns the amount in force on the date, not the latest', () => {
    const history: FeeAmountChange[] = [
      { routeTypeId: null, amountKobo: 700_000, effectiveFrom: epoch },
      { routeTypeId: null, amountKobo: 800_000, effectiveFrom: lagos('2027-01-01') },
    ];
    const at = (date: string) =>
      resolveFeeAmountAtKobo({ at: lagos(date), routeTypeId: null, current, history });
    expect(at('2026-12-01')).toBe(700_000);
    expect(at('2027-01-01')).toBe(800_000);
    expect(at('2027-06-01')).toBe(800_000);
  });

  it('falls back to the default for a route type with no price of its own', () => {
    expect(
      resolveFeeAmountAtKobo({
        at: lagos('2026-11-01'),
        routeTypeId: 'town-service',
        current,
        history: [],
      }),
    ).toBe(800_000);
  });

  it('charges the default before a route type was first priced separately', () => {
    // Interstate got its own amount on 1 March. Before then the default applied.
    const history: FeeAmountChange[] = [
      { routeTypeId: 'interstate', amountKobo: 900_000, effectiveFrom: lagos('2027-03-01') },
    ];
    const at = (date: string) =>
      resolveFeeAmountAtKobo({ at: lagos(date), routeTypeId: 'interstate', current, history });
    expect(at('2027-02-01')).toBe(800_000);
    expect(at('2027-03-01')).toBe(900_000);
  });

  it('keeps route history and default history apart', () => {
    const history: FeeAmountChange[] = [
      { routeTypeId: null, amountKobo: 700_000, effectiveFrom: epoch },
      { routeTypeId: null, amountKobo: 800_000, effectiveFrom: lagos('2027-01-01') },
      { routeTypeId: 'interstate', amountKobo: 750_000, effectiveFrom: epoch },
      { routeTypeId: 'interstate', amountKobo: 900_000, effectiveFrom: lagos('2027-02-01') },
    ];
    expect(
      resolveFeeAmountAtKobo({
        at: lagos('2027-01-15'),
        routeTypeId: 'interstate',
        current,
        history,
      }),
    ).toBe(750_000);
  });
});

describe('membershipCover (PRD Requirement 27.13, PAY-03)', () => {
  const approved = lagos('2026-11-10', '09:00:00');

  it('has not started for a member with no first due date', () => {
    // Not yet approved, or migrated with no go-live date set (GOV-11).
    expect(
      membershipCover({ firstDueOn: null, paidOn: [], now: lagos('2027-01-01') }),
    ).toEqual({ status: 'NOT_DUE', firstDueOn: null, coveredUntil: null, owedSince: null });
  });

  it('is owed from approval until it is paid', () => {
    expect(
      membershipCover({ firstDueOn: approved, paidOn: [], now: lagos('2026-12-01') }),
    ).toEqual({
      status: 'OWED',
      firstDueOn: approved,
      coveredUntil: null,
      owedSince: approved,
    });
  });

  it('covers 12 months from the date it is paid, not from approval', () => {
    const paid = lagos('2027-01-20', '14:30:00');
    const cover = membershipCover({
      firstDueOn: approved,
      paidOn: [paid],
      now: lagos('2027-06-01'),
    });
    expect(cover.status).toBe('PAID');
    expect(cover.coveredUntil).toEqual(lagos('2028-01-20', '14:30:00'));
  });

  it('lapses when the 12 months end, and is owed from that day', () => {
    const paid = lagos('2027-01-20');
    const lapse = lagos('2028-01-20');
    expect(
      membershipCover({ firstDueOn: approved, paidOn: [paid], now: lapse }),
    ).toMatchObject({ status: 'OWED', owedSince: lapse });
    expect(
      membershipCover({
        firstDueOn: approved,
        paidOn: [paid],
        now: new Date(lapse.getTime() - 1),
      }).status,
    ).toBe('PAID');
  });

  it('owes one fee after a long gap, never one for each year missed (PAY-18)', () => {
    const cover = membershipCover({
      firstDueOn: approved,
      paidOn: [lagos('2027-01-20')],
      now: lagos('2031-05-01'),
    });
    expect(cover.status).toBe('OWED');
    expect(cover.owedSince).toEqual(lagos('2028-01-20'));
  });

  it('starts a fee paid early on the day it is paid, as PAY-03 reads (PAY-18)', () => {
    // Covered to 20 January 2028, paid again on 20 November 2027. Read
    // literally, the second cover ends 20 November 2028; the two overlap.
    const cover = membershipCover({
      firstDueOn: approved,
      paidOn: [lagos('2027-01-20'), lagos('2027-11-20')],
      now: lagos('2027-12-01'),
    });
    expect(cover.status).toBe('PAID');
    expect(cover.coveredUntil).toEqual(lagos('2028-11-20'));
  });

  it('counts a fee paid before the first due date', () => {
    const cover = membershipCover({
      firstDueOn: lagos('2027-03-01'),
      paidOn: [lagos('2027-01-05')],
      now: lagos('2027-02-01'),
    });
    expect(cover.status).toBe('PAID');
  });

  it('is not due before its first due date when nothing is paid', () => {
    expect(
      membershipCover({ firstDueOn: lagos('2027-03-01'), paidOn: [], now: lagos('2027-02-01') })
        .status,
    ).toBe('NOT_DUE');
  });
});

describe('date helpers', () => {
  it('labels an instant with its Lagos month', () => {
    expect(lagosMonthLabel(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01');
    expect(lagosMonthLabel(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12');
  });

  it('adds twelve months to the day, and ends a 29 February cover on 28 February', () => {
    expect(addTwelveMonths(lagos('2027-05-17', '08:15:00'))).toEqual(lagos('2028-05-17', '08:15:00'));
    expect(addTwelveMonths(lagos('2028-02-29'))).toEqual(lagos('2029-02-28'));
  });
});

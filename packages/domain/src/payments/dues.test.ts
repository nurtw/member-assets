import { describe, expect, it } from 'vitest';

import {
  addTwelveMonths,
  lagosMonthLabel,
  levySchedule,
  membershipCover,
  routeTypeInForce,
  type MembershipPayment,
  type RouteTypeChange,
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
      amountForMonth: (dueOn) =>
        dueOn.getTime() >= rise.getTime() ? 800_000 : LEVY,
    });
    expect(
      schedule.months.map((m) => [m.month, m.amountKobo, m.outstandingKobo]),
    ).toEqual([
      ['2026-11', 700_000, 0],
      ['2026-12', 700_000, 0],
      ['2027-01', 800_000, 800_000],
    ]);
    expect(schedule.status).toBe('OWED');
  });

  describe('retirement (PAY-19)', () => {
    it('charges the month a vehicle is retired in, and none after it', () => {
      const schedule = levySchedule({
        onboardedAt: lagos('2026-10-10'),
        now: lagos('2027-03-10'),
        creditKobo: 0,
        amountForMonth: flat,
        retiredAt: lagos('2027-01-15'),
      });
      expect(schedule.months.map((m) => m.month)).toEqual([
        '2026-11',
        '2026-12',
        '2027-01',
      ]);
      expect(schedule.nextDueOn).toBeNull();
    });

    it('still charges a month whose 1st is the instant of retirement', () => {
      const schedule = levySchedule({
        onboardedAt: lagos('2026-10-10'),
        now: lagos('2027-03-10'),
        creditKobo: 0,
        amountForMonth: flat,
        retiredAt: lagos('2027-02-01'),
      });
      expect(schedule.months.at(-1)?.month).toBe('2027-02');
    });

    it('is paid once the months before retirement are paid', () => {
      const schedule = levySchedule({
        onboardedAt: lagos('2026-10-10'),
        now: lagos('2027-06-10'),
        creditKobo: 2 * LEVY,
        amountForMonth: flat,
        retiredAt: lagos('2026-12-20'),
      });
      expect(schedule).toMatchObject({
        status: 'PAID',
        outstandingKobo: 0,
        nextDueOn: null,
      });
    });
  });
});

describe('routeTypeInForce (PAY-19)', () => {
  const change = (
    routeTypeId: string,
    previousRouteTypeId: string | null,
    changedAt: Date,
  ): RouteTypeChange => ({ routeTypeId, previousRouteTypeId, changedAt });

  it('is the current route type when it has never changed', () => {
    expect(routeTypeInForce(lagos('2027-01-01'), [], 'TOWN')).toBe('TOWN');
  });

  it('is the route type in force at the instant, whatever came later', () => {
    const history = [
      change('TOWN', null, lagos('2026-09-01')),
      change('INTERSTATE', 'TOWN', lagos('2027-02-10')),
    ];
    expect(routeTypeInForce(lagos('2027-02-01'), history, 'INTERSTATE')).toBe(
      'TOWN',
    );
    expect(routeTypeInForce(lagos('2027-03-01'), history, 'INTERSTATE')).toBe(
      'INTERSTATE',
    );
  });

  it('takes the route type the first recorded change replaced, before it', () => {
    // History kept from item 25 only: an earlier month had what the first
    // change replaced.
    const history = [change('INTERSTATE', 'TOWN', lagos('2027-02-10'))];
    expect(routeTypeInForce(lagos('2027-01-01'), history, 'INTERSTATE')).toBe(
      'TOWN',
    );
  });

  it('takes the first route type when the vehicle had none before it', () => {
    const history = [change('TOWN', null, lagos('2027-02-10'))];
    expect(routeTypeInForce(lagos('2027-01-01'), history, 'TOWN')).toBe('TOWN');
  });

  it('applies a change made on the 1st itself to that month', () => {
    const history = [
      change('TOWN', null, lagos('2026-09-01')),
      change('INTERSTATE', 'TOWN', lagos('2027-03-01')),
    ];
    expect(routeTypeInForce(lagos('2027-03-01'), history, 'INTERSTATE')).toBe(
      'INTERSTATE',
    );
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
      resolveFeeAmountAtKobo({
        at: lagos('2026-11-01'),
        routeTypeId: null,
        current,
        history: [],
      }),
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
      {
        routeTypeId: null,
        amountKobo: 800_000,
        effectiveFrom: lagos('2027-01-01'),
      },
    ];
    const at = (date: string) =>
      resolveFeeAmountAtKobo({
        at: lagos(date),
        routeTypeId: null,
        current,
        history,
      });
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
      {
        routeTypeId: 'interstate',
        amountKobo: 900_000,
        effectiveFrom: lagos('2027-03-01'),
      },
    ];
    const at = (date: string) =>
      resolveFeeAmountAtKobo({
        at: lagos(date),
        routeTypeId: 'interstate',
        current,
        history,
      });
    expect(at('2027-02-01')).toBe(800_000);
    expect(at('2027-03-01')).toBe(900_000);
  });

  it('keeps route history and default history apart', () => {
    const history: FeeAmountChange[] = [
      { routeTypeId: null, amountKobo: 700_000, effectiveFrom: epoch },
      {
        routeTypeId: null,
        amountKobo: 800_000,
        effectiveFrom: lagos('2027-01-01'),
      },
      { routeTypeId: 'interstate', amountKobo: 750_000, effectiveFrom: epoch },
      {
        routeTypeId: 'interstate',
        amountKobo: 900_000,
        effectiveFrom: lagos('2027-02-01'),
      },
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
  const FEE = 3_000_000;
  const fee = () => FEE;
  /** Each date a payment link paid the whole fee. */
  const paidInFull = (...dates: Date[]): MembershipPayment[] =>
    dates.map((date) => ({ paidOn: date, pricedOn: date, kobo: FEE }));

  it('has not started for a member with no first due date', () => {
    // Not yet approved, or migrated with no go-live date set (GOV-11).
    expect(
      membershipCover({
        firstDueOn: null,
        payments: [],
        amountAt: fee,
        now: lagos('2027-01-01'),
      }),
    ).toEqual({
      status: 'NOT_DUE',
      firstDueOn: null,
      coveredUntil: null,
      owedSince: null,
      heldKobo: 0,
      outstandingKobo: 0,
    });
  });

  it('is owed from approval until it is paid', () => {
    expect(
      membershipCover({
        firstDueOn: approved,
        payments: [],
        amountAt: fee,
        now: lagos('2026-12-01'),
      }),
    ).toEqual({
      status: 'OWED',
      firstDueOn: approved,
      coveredUntil: null,
      owedSince: approved,
      heldKobo: 0,
      outstandingKobo: FEE,
    });
  });

  it('covers 12 months from the date it is paid, not from approval', () => {
    const paid = lagos('2027-01-20', '14:30:00');
    const cover = membershipCover({
      firstDueOn: approved,
      payments: paidInFull(paid),
      amountAt: fee,
      now: lagos('2027-06-01'),
    });
    expect(cover.status).toBe('PAID');
    expect(cover.coveredUntil).toEqual(lagos('2028-01-20', '14:30:00'));
  });

  it('lapses when the 12 months end, and is owed from that day', () => {
    const paid = lagos('2027-01-20');
    const lapse = lagos('2028-01-20');
    expect(
      membershipCover({
        firstDueOn: approved,
        payments: paidInFull(paid),
        amountAt: fee,
        now: lapse,
      }),
    ).toMatchObject({ status: 'OWED', owedSince: lapse });
    expect(
      membershipCover({
        firstDueOn: approved,
        payments: paidInFull(paid),
        amountAt: fee,
        now: new Date(lapse.getTime() - 1),
      }).status,
    ).toBe('PAID');
  });

  it('owes one fee after a long gap, never one for each year missed (PAY-18)', () => {
    const cover = membershipCover({
      firstDueOn: approved,
      payments: paidInFull(lagos('2027-01-20')),
      amountAt: fee,
      now: lagos('2031-05-01'),
    });
    expect(cover.status).toBe('OWED');
    expect(cover.owedSince).toEqual(lagos('2028-01-20'));
  });

  it('adds a fee paid early to the end of the current cover (PAY-18)', () => {
    // Covered to 20 January 2028, paid again on 20 November 2027: the new
    // year runs from 20 January 2028, so nothing already paid for is lost.
    const cover = membershipCover({
      firstDueOn: approved,
      payments: paidInFull(lagos('2027-01-20'), lagos('2027-11-20')),
      amountAt: fee,
      now: lagos('2027-12-01'),
    });
    expect(cover.status).toBe('PAID');
    expect(cover.coveredUntil).toEqual(lagos('2029-01-20'));
  });

  it('stacks every early fee, one year each (PAY-18)', () => {
    const cover = membershipCover({
      firstDueOn: approved,
      payments: paidInFull(
        lagos('2027-01-20'),
        lagos('2027-03-01'),
        lagos('2027-06-01'),
      ),
      amountAt: fee,
      now: lagos('2027-07-01'),
    });
    expect(cover.coveredUntil).toEqual(lagos('2030-01-20'));
  });

  it('starts afresh on the day it is paid after a lapse (PAY-18)', () => {
    const cover = membershipCover({
      firstDueOn: approved,
      payments: paidInFull(lagos('2027-01-20'), lagos('2029-05-01')),
      amountAt: fee,
      now: lagos('2029-06-01'),
    });
    expect(cover.coveredUntil).toEqual(lagos('2030-05-01'));
  });

  it('counts a fee paid before the first due date', () => {
    const cover = membershipCover({
      firstDueOn: lagos('2027-03-01'),
      payments: paidInFull(lagos('2027-01-05')),
      amountAt: fee,
      now: lagos('2027-02-01'),
    });
    expect(cover.status).toBe('PAID');
  });

  it('is not due before its first due date when nothing is paid', () => {
    expect(
      membershipCover({
        firstDueOn: lagos('2027-03-01'),
        payments: [],
        amountAt: fee,
        now: lagos('2027-02-01'),
      }).status,
    ).toBe('NOT_DUE');
  });

  describe('part payments (item 23)', () => {
    const part = (date: Date, kobo: number): MembershipPayment => ({
      paidOn: date,
      pricedOn: date,
      kobo,
    });

    it('holds a part payment toward the fee and leaves the rest owed', () => {
      const cover = membershipCover({
        firstDueOn: approved,
        payments: [part(lagos('2026-12-01'), 1_000_000)],
        amountAt: fee,
        now: lagos('2026-12-05'),
      });
      expect(cover).toMatchObject({
        status: 'OWED',
        owedSince: approved,
        heldKobo: 1_000_000,
        outstandingKobo: FEE - 1_000_000,
      });
    });

    it('starts the year on the day the last part arrives', () => {
      const last = lagos('2027-02-14', '10:00:00');
      const cover = membershipCover({
        firstDueOn: approved,
        payments: [part(lagos('2026-12-01'), 1_000_000), part(last, 2_000_000)],
        amountAt: fee,
        now: lagos('2027-03-01'),
      });
      expect(cover).toMatchObject({
        status: 'PAID',
        heldKobo: 0,
        outstandingKobo: 0,
      });
      expect(cover.coveredUntil).toEqual(addTwelveMonths(last));
    });

    it('buys a year for each whole fee and holds the rest (PAY-18)', () => {
      const cover = membershipCover({
        firstDueOn: approved,
        payments: [part(lagos('2026-12-01'), 2 * FEE + 500_000)],
        amountAt: fee,
        now: lagos('2027-01-01'),
      });
      expect(cover).toMatchObject({ status: 'PAID', heldKobo: 500_000 });
      expect(cover.coveredUntil).toEqual(
        addTwelveMonths(addTwelveMonths(lagos('2026-12-01'))),
      );
    });

    it('carries part of a fee toward the next one, rather than starting a second cover', () => {
      const cover = membershipCover({
        firstDueOn: approved,
        payments: [part(lagos('2026-12-01'), FEE + 500_000)],
        amountAt: fee,
        now: lagos('2027-01-01'),
      });
      expect(cover).toMatchObject({ status: 'PAID', heldKobo: 500_000 });
      expect(cover.coveredUntil).toEqual(addTwelveMonths(lagos('2026-12-01')));
    });

    it('pays a link at the fee it was started at, even if the fee rose before it was paid', () => {
      const rise = lagos('2027-01-01');
      const amountAt = (at: Date) =>
        at.getTime() >= rise.getTime() ? 3_500_000 : FEE;
      const cover = membershipCover({
        firstDueOn: approved,
        payments: [
          {
            paidOn: lagos('2027-01-01', '00:05:00'),
            pricedOn: lagos('2026-12-31'),
            kobo: FEE,
          },
        ],
        amountAt,
        now: lagos('2027-01-02'),
      });
      expect(cover.status).toBe('PAID');
    });

    it('ignores a payment the ledger no longer holds', () => {
      const cover = membershipCover({
        firstDueOn: approved,
        payments: [part(lagos('2026-12-01'), 0)],
        amountAt: fee,
        now: lagos('2026-12-05'),
      });
      expect(cover).toMatchObject({
        status: 'OWED',
        heldKobo: 0,
        outstandingKobo: FEE,
      });
    });
  });
});

describe('date helpers', () => {
  it('labels an instant with its Lagos month', () => {
    expect(lagosMonthLabel(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01');
    expect(lagosMonthLabel(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12');
  });

  it('adds twelve months to the day, and ends a 29 February cover on 28 February', () => {
    expect(addTwelveMonths(lagos('2027-05-17', '08:15:00'))).toEqual(
      lagos('2028-05-17', '08:15:00'),
    );
    expect(addTwelveMonths(lagos('2028-02-29'))).toEqual(lagos('2029-02-28'));
  });
});

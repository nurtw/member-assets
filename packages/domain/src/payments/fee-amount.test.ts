import { describe, expect, it } from 'vitest';

import { resolveFeeAmountKobo } from './fee-amount.js';

describe('resolveFeeAmountKobo (Requirement 27.1, PAY-14)', () => {
  const prices = [
    { routeTypeId: 'interstate', amountKobo: 900_000 },
    { routeTypeId: 'town-service', amountKobo: 700_000 },
  ];

  it("charges the route type's own amount when it has one", () => {
    expect(
      resolveFeeAmountKobo({
        defaultAmountKobo: 700_000,
        prices,
        routeTypeId: 'interstate',
      }),
    ).toBe(900_000);
  });

  it('falls back to the default for a route type without its own amount', () => {
    expect(
      resolveFeeAmountKobo({
        defaultAmountKobo: 700_000,
        prices,
        routeTypeId: 'intercity',
      }),
    ).toBe(700_000);
  });

  it('falls back to the default for a vehicle with no route type', () => {
    // A legacy vehicle before declaration or onboarding (VEH-26).
    expect(
      resolveFeeAmountKobo({ defaultAmountKobo: 700_000, prices, routeTypeId: null }),
    ).toBe(700_000);
  });
});

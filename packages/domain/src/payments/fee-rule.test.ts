import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEE_SCHEDULES,
  calculateContractorFee,
  calculateFees,
} from './fee-rule.js';

/**
 * ARCHITECTURE.md Decision 13.1 / PRD acceptance criterion 17: the
 * processing-fee rule must reproduce the owner's six worked figures from
 * `QUESTIONS.md` PAY-10 exactly.
 */
describe('calculateFees', () => {
  const cases: Array<{
    due: number;
    totalCharged: number;
    contractorFee: number;
    paystackFee: number;
  }> = [
    { due: 1000, totalCharged: 1021, contractorFee: 5, paystackFee: 15.31 },
    { due: 5000, totalCharged: 5204, contractorFee: 25, paystackFee: 178.06 },
    {
      due: 10000,
      totalCharged: 10305,
      contractorFee: 50,
      paystackFee: 254.57,
    },
    {
      due: 50000,
      totalCharged: 51066,
      contractorFee: 200,
      paystackFee: 865.99,
    },
    {
      due: 100000,
      totalCharged: 101828,
      contractorFee: 200,
      paystackFee: 1627.42,
    },
    {
      due: 500000,
      totalCharged: 502200,
      contractorFee: 200,
      paystackFee: 2000,
    },
  ];

  it.each(cases)(
    'reproduces the PAY-10 figures for a due of ₦$due',
    ({ due, totalCharged, contractorFee, paystackFee }) => {
      const result = calculateFees({
        due,
        contractorFee: DEFAULT_FEE_SCHEDULES.contractorFee,
        paystackFee: DEFAULT_FEE_SCHEDULES.paystackFee,
      });

      expect(result.totalCharged).toBe(totalCharged);
      expect(result.contractorFee).toBe(contractorFee);
      expect(result.paystackFee).toBe(paystackFee);

      const contractorKeeps =
        result.totalCharged - result.paystackFee - result.due;
      expect(contractorKeeps).toBeGreaterThanOrEqual(contractorFee - 0.01);
    },
  );

  it('caps the contractor fee at ₦200', () => {
    expect(
      calculateContractorFee(1_000_000, DEFAULT_FEE_SCHEDULES.contractorFee),
    ).toBe(200);
  });

  it('rejects a non-positive due', () => {
    expect(() =>
      calculateFees({
        due: 0,
        contractorFee: DEFAULT_FEE_SCHEDULES.contractorFee,
        paystackFee: DEFAULT_FEE_SCHEDULES.paystackFee,
      }),
    ).toThrow(RangeError);
  });
});

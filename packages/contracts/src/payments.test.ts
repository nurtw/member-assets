import { describe, expect, it } from 'vitest';

import {
  resolveSettlementAccountSchema,
  setDedicatedPercentageSchema,
  setSettlementAccountSchema,
} from './index.js';

const ACCOUNT = {
  bankCode: '058',
  bankName: 'Guaranty Trust Bank',
  accountNumber: '0123456789',
  password: 'the-administrators-password',
  reason: 'The Union changed its bank',
};

describe('the NURTW settlement account (Requirement 27.12, item 30)', () => {
  it('takes a ten-digit account number, trimmed', () => {
    expect(
      setSettlementAccountSchema.parse({
        ...ACCOUNT,
        accountNumber: ' 0123456789 ',
      }).accountNumber,
    ).toBe('0123456789');
  });

  it('refuses an account number that is not ten digits', () => {
    for (const accountNumber of [
      '012345678',
      '01234567890',
      '01234-6789',
      'abcdefghij',
    ]) {
      expect(
        setSettlementAccountSchema.safeParse({ ...ACCOUNT, accountNumber })
          .success,
      ).toBe(false);
    }
  });

  it('never accepts an account name from the caller', () => {
    const parsed = setSettlementAccountSchema.parse({
      ...ACCOUNT,
      accountName: 'Somebody Else',
    });
    expect(parsed).not.toHaveProperty('accountName');
  });

  it('needs the password and a reason', () => {
    expect(
      setSettlementAccountSchema.safeParse({ ...ACCOUNT, password: '' })
        .success,
    ).toBe(false);
    expect(
      setSettlementAccountSchema.safeParse({ ...ACCOUNT, reason: ' ' }).success,
    ).toBe(false);
  });
});

describe('looking up an account before saving it', () => {
  it('takes the bank and the number, and nothing else', () => {
    const parsed = resolveSettlementAccountSchema.parse({
      bankCode: '058',
      accountNumber: '0123456789',
      password: 'not needed to look up',
    });
    expect(parsed).toEqual({ bankCode: '058', accountNumber: '0123456789' });
  });

  it('applies the same ten-digit rule', () => {
    expect(
      resolveSettlementAccountSchema.safeParse({
        bankCode: '058',
        accountNumber: '12345',
      }).success,
    ).toBe(false);
    expect(
      resolveSettlementAccountSchema.safeParse({
        bankCode: '',
        accountNumber: '0123456789',
      }).success,
    ).toBe(false);
  });
});

describe("the contractor's percentage of dedicated-account money (PAY-11)", () => {
  const VALID = {
    percentage: 1.75,
    password: 'pw',
    reason: 'Pricing confirmed',
  };

  it('takes up to two decimal places, below 100', () => {
    expect(setDedicatedPercentageSchema.safeParse(VALID).success).toBe(true);
    expect(
      setDedicatedPercentageSchema.safeParse({ ...VALID, percentage: 0 })
        .success,
    ).toBe(true);
    expect(
      setDedicatedPercentageSchema.safeParse({ ...VALID, percentage: 1.234 })
        .success,
    ).toBe(false);
    expect(
      setDedicatedPercentageSchema.safeParse({ ...VALID, percentage: 100 })
        .success,
    ).toBe(false);
    expect(
      setDedicatedPercentageSchema.safeParse({ ...VALID, percentage: -1 })
        .success,
    ).toBe(false);
  });
});

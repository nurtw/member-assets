import { describe, expect, it } from 'vitest';

import {
  amountToSendKobo,
  dedicatedCreditKobo,
  percentageToBasisPoints,
} from './dedicated-amount.js';

describe('dedicatedCreditKobo (PRD Requirement 27.7, PAY-11)', () => {
  it('credits NURTW the amount sent less the contractor percentage', () => {
    // 2 per cent of 10,000 is 200.
    expect(dedicatedCreditKobo(1_000_000, 2)).toBe(980_000);
  });

  it('rounds the contractor share up, so a member is never credited more than NURTW receives', () => {
    // 1.5 per cent of 333.33 is 4.99995 naira: the share is 500 kobo, not 499.
    expect(dedicatedCreditKobo(33_333, 1.5)).toBe(32_833);
  });

  it('credits the whole amount at a zero percentage', () => {
    expect(dedicatedCreditKobo(700_000, 0)).toBe(700_000);
  });
});

describe('amountToSendKobo', () => {
  it('is the smallest whole-naira amount whose NURTW share covers the due', () => {
    for (const [due, percentage] of [
      [700_000, 1.5],
      [3_000_000, 2],
      [700_000, 0.75],
      [123_456, 3.33],
      [700_000, 0],
    ] as const) {
      const send = amountToSendKobo(due, percentage);
      expect(send % 100).toBe(0);
      expect(dedicatedCreditKobo(send, percentage)).toBeGreaterThanOrEqual(due);
      expect(dedicatedCreditKobo(send - 100, percentage)).toBeLessThan(due);
    }
  });

  it('asks for nothing when nothing is owed', () => {
    expect(amountToSendKobo(0, 1.5)).toBe(0);
  });
});

describe('percentageToBasisPoints', () => {
  it('accepts up to two decimal places, from 0 to below 100', () => {
    expect(percentageToBasisPoints(1.5)).toBe(150);
    expect(percentageToBasisPoints(0)).toBe(0);
    expect(percentageToBasisPoints(99.99)).toBe(9_999);
  });

  it('refuses a percentage Paystack could not apply', () => {
    for (const bad of [-1, 100, 1.234, Number.NaN]) {
      expect(() => percentageToBasisPoints(bad)).toThrow(RangeError);
    }
  });
});

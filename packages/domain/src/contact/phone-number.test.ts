import { describe, expect, it } from 'vitest';

import {
  InvalidPhoneNumberError,
  formatNigerianPhone,
  isNigerianPhone,
  normalizeNigerianPhone,
  tryNormalizeNigerianPhone,
} from './phone-number.js';

describe('normalizeNigerianPhone', () => {
  it('reduces every way one number is written to a single value', () => {
    // The whole point: the same person entered three times by three officers
    // must be recognisably the same person.
    const forms = [
      '08031234567',
      '0803 123 4567',
      '0803-123-4567',
      '+2348031234567',
      '+234 803 123 4567',
      '234 803 123 4567',
      '(0803) 123.4567',
    ];
    for (const form of forms) {
      expect(normalizeNigerianPhone(form), form).toBe('+2348031234567');
    }
  });

  it('repairs a country code pasted in front of the national form', () => {
    // +234 0803… is what people produce by prefixing what they already had. It
    // is unambiguous, because no significant number begins with zero.
    expect(normalizeNigerianPhone('+23408031234567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('23408031234567')).toBe('+2348031234567');
  });

  it('accepts the range of Nigerian mobile prefixes', () => {
    for (const prefix of ['0703', '0803', '0813', '0906', '0915']) {
      expect(normalizeNigerianPhone(`${prefix}1234567`)).toMatch(/^\+234\d{10}$/);
    }
  });

  it('rejects a number of the wrong length', () => {
    expect(() => normalizeNigerianPhone('0803123456')).toThrow(
      InvalidPhoneNumberError,
    );
    expect(() => normalizeNigerianPhone('080312345678')).toThrow(
      InvalidPhoneNumberError,
    );
  });

  it('rejects an empty or punctuation-only value', () => {
    expect(() => normalizeNigerianPhone('')).toThrow(InvalidPhoneNumberError);
    expect(() => normalizeNigerianPhone('---')).toThrow(InvalidPhoneNumberError);
  });

  it('rejects a significant number beginning with zero', () => {
    expect(() => normalizeNigerianPhone('+2340123456789')).toThrow(
      /does not begin with zero/,
    );
  });

  it('is idempotent', () => {
    const once = normalizeNigerianPhone('0803 123 4567');
    expect(normalizeNigerianPhone(once)).toBe(once);
  });
});

describe('tryNormalizeNigerianPhone', () => {
  it('answers null rather than throwing, for use as a predicate', () => {
    expect(tryNormalizeNigerianPhone('nonsense')).toBeNull();
    expect(tryNormalizeNigerianPhone('08031234567')).toBe('+2348031234567');
    expect(isNigerianPhone('08031234567')).toBe(true);
    expect(isNigerianPhone('123')).toBe(false);
  });
});

describe('formatNigerianPhone', () => {
  it('renders the national form, which is how a number is read aloud here', () => {
    expect(formatNigerianPhone('+2348031234567')).toBe('0803 123 4567');
  });

  it('returns anything unrecognised unchanged rather than mangling it', () => {
    expect(formatNigerianPhone('+15551234567')).toBe('+15551234567');
  });
});

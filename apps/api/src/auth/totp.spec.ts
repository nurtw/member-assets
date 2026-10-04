import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  otpauthUri,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp.js';

/** RFC 6238 Appendix B: the ASCII secret `12345678901234567890`, SHA-1. */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const at = (seconds: number) => new Date(seconds * 1000);

describe('time-based codes (RFC 6238)', () => {
  it('reproduce the RFC’s own test vectors, to six digits', () => {
    // The RFC lists eight digits; six is their last six.
    for (const [seconds, code] of [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ] as const) {
      expect(totpCode(RFC_SECRET, totpStep(at(seconds)))).toBe(code);
    }
  });

  it('accept the current code, and one step either side', () => {
    const now = at(1111111109);
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, '081804', now, null)).toBe(step);
    expect(
      verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, null),
    ).toBe(step - 1);
    expect(
      verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, null),
    ).toBe(step + 1);
    expect(
      verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now, null),
    ).toBeNull();
  });

  it('accept a code typed with a space', () => {
    expect(
      verifyTotp(RFC_SECRET, '081 804', at(1111111109), null),
    ).not.toBeNull();
  });

  it('refuse a wrong code, and anything that is not six digits', () => {
    const now = at(1111111109);
    for (const code of ['000000', '08180', '0818044', 'abcdef', '']) {
      expect(verifyTotp(RFC_SECRET, code, now, null)).toBeNull();
    }
  });

  it('refuse a code already used', () => {
    const now = at(1111111109);
    const step = verifyTotp(RFC_SECRET, '081804', now, null)!;
    expect(verifyTotp(RFC_SECRET, '081804', now, step)).toBeNull();
    // The next step's code still works.
    expect(
      verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, step),
    ).toBe(step + 1);
  });

  it('use a fresh 160-bit secret each time', () => {
    const first = generateTotpSecret();
    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(first);
    expect(base32Decode(first)).toHaveLength(20);
  });

  it('describe the account to an authenticator app', () => {
    expect(otpauthUri('ABCDEFGH', 'ada@nurtw.test')).toBe(
      'otpauth://totp/NURTW%3Aada%40nurtw.test?secret=ABCDEFGH&issuer=NURTW&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('recovery codes', () => {
  it('are ten, each different, in a form that can be read aloud', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
      expect(looksLikeRecoveryCode(code)).toBe(true);
    }
  });

  it('hash the same however they are typed', () => {
    const [code] = generateRecoveryCodes();
    expect(hashRecoveryCode(code!.toLowerCase().replace(/-/g, ' '))).toBe(
      hashRecoveryCode(code!),
    );
    expect(hashRecoveryCode(code!)).not.toContain(code!.replace(/-/g, ''));
  });

  it('are told apart from an authenticator code', () => {
    expect(looksLikeRecoveryCode('081804')).toBe(false);
    expect(looksLikeRecoveryCode('ABCD-EFGH')).toBe(false);
  });
});

describe('the secret at rest', () => {
  it('is encrypted, differently each time, and recoverable with the key', () => {
    const secret = generateTotpSecret();
    const first = encryptSecret(secret, 'key-material');
    const second = encryptSecret(secret, 'key-material');
    expect(first).not.toContain(secret);
    expect(first).not.toBe(second);
    expect(decryptSecret(first, 'key-material')).toBe(secret);
    expect(decryptSecret(second, 'key-material')).toBe(secret);
  });

  it('cannot be read with another key, or after tampering', () => {
    const sealed = encryptSecret(generateTotpSecret(), 'key-material');
    expect(() => decryptSecret(sealed, 'another-key')).toThrow();
    const parts = sealed.split(':');
    parts[3] = `${parts[3]!.slice(0, -2)}AA`;
    expect(() => decryptSecret(parts.join(':'), 'key-material')).toThrow();
    expect(() => decryptSecret('plain-secret', 'key-material')).toThrow();
  });
});

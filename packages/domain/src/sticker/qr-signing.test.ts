import { describe, expect, it } from 'vitest';

import { decodeAndVerifyQrPayload, encodeQrPayload } from './qr-signing.js';

/** A deterministic, insecure "HMAC" for tests — real signing uses crypto's. */
const fakeSign = (secret: string, message: string): string => {
  let hash = 0;
  for (const char of `${secret}:${message}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(16, '0');
};

describe('sticker QR payload (PRD §26.1–26.2)', () => {
  const secret = 'test-signing-secret';
  const resolveSecret = (keyId: string) => (keyId === 'v1' ? secret : undefined);

  it('round-trips a payload it signed itself', () => {
    const encoded = encodeQrPayload(
      { stickerQrId: 'ABC123XYZ', keyId: 'v1' },
      secret,
      fakeSign,
    );

    const result = decodeAndVerifyQrPayload(encoded, resolveSecret, fakeSign);

    expect(result).toEqual({
      valid: true,
      stickerQrId: 'ABC123XYZ',
      keyId: 'v1',
    });
  });

  it('carries no field but the identifier, key id, and signature', () => {
    const encoded = encodeQrPayload(
      { stickerQrId: 'ABC123XYZ', keyId: 'v1' },
      secret,
      fakeSign,
    );
    expect(encoded.split('.')).toHaveLength(3);
  });

  it('refuses a tampered identifier — this is what a forged sticker looks like', () => {
    const encoded = encodeQrPayload(
      { stickerQrId: 'ABC123XYZ', keyId: 'v1' },
      secret,
      fakeSign,
    );
    const tampered = encoded.replace('ABC123XYZ', 'ZZZ999999');

    expect(decodeAndVerifyQrPayload(tampered, resolveSecret, fakeSign)).toEqual({
      valid: false,
    });
  });

  it('refuses an unresolvable key id, without throwing', () => {
    const encoded = encodeQrPayload(
      { stickerQrId: 'ABC123XYZ', keyId: 'unknown-key' },
      secret,
      fakeSign,
    );
    expect(decodeAndVerifyQrPayload(encoded, resolveSecret, fakeSign)).toEqual({
      valid: false,
    });
  });

  it('refuses a malformed payload', () => {
    for (const malformed of ['', 'not-a-payload', 'a.b', 'a.b.c.d']) {
      expect(
        decodeAndVerifyQrPayload(malformed, resolveSecret, fakeSign),
      ).toEqual({ valid: false });
    }
  });

  it('supports key rotation: an old key still verifies its own stickers', () => {
    const secondSecret = 'rotated-signing-secret';
    const resolveEither = (keyId: string) =>
      keyId === 'v1' ? secret : keyId === 'v2' ? secondSecret : undefined;

    const mintedUnderV1 = encodeQrPayload(
      { stickerQrId: 'OLD111', keyId: 'v1' },
      secret,
      fakeSign,
    );
    const mintedUnderV2 = encodeQrPayload(
      { stickerQrId: 'NEW222', keyId: 'v2' },
      secondSecret,
      fakeSign,
    );

    expect(decodeAndVerifyQrPayload(mintedUnderV1, resolveEither, fakeSign)).toEqual(
      { valid: true, stickerQrId: 'OLD111', keyId: 'v1' },
    );
    expect(decodeAndVerifyQrPayload(mintedUnderV2, resolveEither, fakeSign)).toEqual(
      { valid: true, stickerQrId: 'NEW222', keyId: 'v2' },
    );
  });

  it('uses the injected comparator, so a caller can plug in a timing-safe one', () => {
    const encoded = encodeQrPayload(
      { stickerQrId: 'ABC123XYZ', keyId: 'v1' },
      secret,
      fakeSign,
    );
    let comparisonsRun = 0;
    const countingCompare = (a: string, b: string) => {
      comparisonsRun += 1;
      return a === b;
    };

    decodeAndVerifyQrPayload(encoded, resolveSecret, fakeSign, countingCompare);
    expect(comparisonsRun).toBe(1);
  });
});

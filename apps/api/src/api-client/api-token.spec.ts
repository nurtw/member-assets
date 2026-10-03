import { describe, expect, it } from 'vitest';

import {
  bearerToken,
  generateApiToken,
  hashApiToken,
  isWellFormedApiToken,
} from './api-token.js';

describe('API tokens (PRD Requirements 12.1–12.2)', () => {
  it('generates a token in the documented form', () => {
    const { token, prefix } = generateApiToken();
    expect(token).toMatch(/^nurtw_[a-hjkmnp-z2-9]{8}_[A-Za-z0-9_-]{43}$/);
    expect(token.startsWith(`${prefix}_`)).toBe(true);
    expect(prefix).toMatch(/^nurtw_[a-hjkmnp-z2-9]{8}$/);
    expect(isWellFormedApiToken(token)).toBe(true);
  });

  it('never repeats a token or a prefix', () => {
    const generated = Array.from({ length: 500 }, generateApiToken);
    expect(new Set(generated.map((entry) => entry.token)).size).toBe(500);
    expect(new Set(generated.map((entry) => entry.prefix)).size).toBe(500);
  });

  it('stores a hash from which neither the token nor its secret can be read', () => {
    const { token, prefix, hash } = generateApiToken();
    const secret = token.slice(prefix.length + 1);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiToken(token));
    expect(hash).not.toContain(secret);
    expect(prefix).not.toContain(secret);
  });

  it('hashes two tokens differing by one character differently', () => {
    const { token } = generateApiToken();
    const last = token.at(-1) === 'A' ? 'B' : 'A';
    expect(hashApiToken(`${token.slice(0, -1)}${last}`)).not.toBe(
      hashApiToken(token),
    );
  });

  it.each([
    '',
    'nurtw_',
    'nurtw_abcdefgh',
    'nurtw_abcdefgh_short',
    'NURTW_abcdefgh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'nurtw_abcdefgi_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'other_abcdefgh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'nurtw_abcdefgh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ',
    "nurtw_abcdefgh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' OR",
  ])('does not take %j for a token', (candidate) => {
    expect(isWellFormedApiToken(candidate)).toBe(false);
  });

  it('reads a token from a Bearer header and from nowhere else', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('abc')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('bearer abc')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken('Bearer abc def')).toBeNull();
    expect(bearerToken('Bearer  abc')).toBeNull();
  });
});

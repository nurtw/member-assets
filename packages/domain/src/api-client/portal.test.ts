import { describe, expect, it } from 'vitest';

import {
  applicationExpiresAt,
  emptyUsageTally,
  isApplicationExpired,
  PORTAL_USAGE_CLASSES,
  portalUsageClass,
} from './portal.js';

const answered = (resultClass: string, statusCode = 200) => ({
  resultClass,
  statusCode,
  rateLimited: false,
});

describe('what the portal calls a request (item 29)', () => {
  it('counts a match and a non-match as the API answered them', () => {
    expect(portalUsageClass(answered('MATCH'))).toBe('MATCH');
    expect(portalUsageClass(answered('NO_MATCH'))).toBe('NO_MATCH');
  });

  it('never separates a forged code from any other non-match (Requirement 14.3)', () => {
    expect(portalUsageClass(answered('INVALID_SIGNATURE'))).toBe('NO_MATCH');
  });

  it('counts a suppressed total with the totals', () => {
    for (const logged of ['TOTAL', 'SUPPRESSED', 'METADATA']) {
      expect(portalUsageClass(answered(logged))).toBe('TOTALS');
    }
  });

  it('makes every credential failure one refusal, whatever the log says of it', () => {
    for (const logged of [
      'UNKNOWN_TOKEN',
      'TOKEN_EXPIRED',
      'TOKEN_REVOKED',
      'CLIENT_NOT_ACTIVE',
      'ADDRESS_NOT_ALLOWED',
    ]) {
      expect(portalUsageClass(answered(logged, 401))).toBe('REFUSED');
    }
    expect(portalUsageClass(answered('SCOPE_DENIED', 403))).toBe('REFUSED');
  });

  it('counts a limit or a pause as limited, without saying which', () => {
    expect(portalUsageClass(answered('RATE_LIMITED', 429))).toBe('LIMITED');
    expect(portalUsageClass(answered('PAUSED', 429))).toBe('LIMITED');
    expect(
      portalUsageClass({
        resultClass: 'MATCH',
        statusCode: 200,
        rateLimited: true,
      }),
    ).toBe('LIMITED');
  });

  it('counts a malformed request as that', () => {
    expect(portalUsageClass(answered('NO_REQUEST_ID', 400))).toBe(
      'INVALID_REQUEST',
    );
    expect(portalUsageClass(answered('BAD_REQUEST', 400))).toBe(
      'INVALID_REQUEST',
    );
  });

  it('lets the status the caller saw decide before the logged class', () => {
    expect(portalUsageClass(answered('INVALID_SIGNATURE', 401))).toBe(
      'REFUSED',
    );
  });

  it('has a tally for every class', () => {
    expect(Object.keys(emptyUsageTally()).sort()).toEqual(
      [...PORTAL_USAGE_CLASSES].sort(),
    );
  });
});

describe('an application nobody approved', () => {
  const applied = new Date('2026-10-05T09:00:00Z');

  it('lapses after the set number of days', () => {
    expect(applicationExpiresAt(applied, 30).toISOString()).toBe(
      '2026-11-04T09:00:00.000Z',
    );
    expect(
      isApplicationExpired(applied, new Date('2026-11-04T08:59:59Z'), 30),
    ).toBe(false);
    expect(
      isApplicationExpired(applied, new Date('2026-11-04T09:00:00Z'), 30),
    ).toBe(true);
  });
});

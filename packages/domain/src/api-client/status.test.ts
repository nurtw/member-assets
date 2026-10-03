import { describe, expect, it } from 'vitest';

import {
  API_CLIENT_STATUSES,
  InvalidApiClientTransitionError,
  STORED_API_CLIENT_STATUSES,
  TOKEN_ROTATION_OVERLAP_CODES,
  apiClientStanding,
  apiTokenState,
  assertApiClientTransition,
  canApiClientAuthenticate,
  canTransitionApiClient,
  isApiClientFinal,
  isApiTokenUsable,
  isTokenExpiringSoon,
  retirementFor,
  type ApiTokenFacts,
} from './status.js';

const NOW = new Date('2026-10-03T12:00:00Z');
const at = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const token = (overrides: Partial<ApiTokenFacts> = {}): ApiTokenFacts => ({
  expiresAt: new Date(NOW.getTime() + 90 * DAY),
  revokedAt: null,
  retiresAt: null,
  ...overrides,
});

describe('the client lifecycle', () => {
  it('has the five statuses of PRD §12.1, four of them stored', () => {
    expect(API_CLIENT_STATUSES).toEqual([
      'PENDING',
      'ACTIVE',
      'SUSPENDED',
      'EXPIRED',
      'REVOKED',
    ]);
    expect(STORED_API_CLIENT_STATUSES).not.toContain('EXPIRED');
  });

  it('approves or refuses a pending client, and nothing else', () => {
    expect(canTransitionApiClient('PENDING', 'ACTIVE')).toBe(true);
    expect(canTransitionApiClient('PENDING', 'REVOKED')).toBe(true);
    expect(canTransitionApiClient('PENDING', 'SUSPENDED')).toBe(false);
  });

  it('suspends and reinstates', () => {
    expect(canTransitionApiClient('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionApiClient('SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('never brings a revoked client back', () => {
    expect(isApiClientFinal('REVOKED')).toBe(true);
    for (const status of STORED_API_CLIENT_STATUSES) {
      expect(canTransitionApiClient('REVOKED', status)).toBe(false);
    }
    expect(() => assertApiClientTransition('REVOKED', 'ACTIVE')).toThrow(
      InvalidApiClientTransitionError,
    );
  });

  it('never returns a client to pending', () => {
    for (const status of STORED_API_CLIENT_STATUSES) {
      expect(canTransitionApiClient(status, 'PENDING')).toBe(false);
    }
  });

  it('authenticates an active client only', () => {
    expect(STORED_API_CLIENT_STATUSES.filter(canApiClientAuthenticate)).toEqual(
      ['ACTIVE'],
    );
  });
});

describe('the state of a token', () => {
  it('is current until something ends it', () => {
    expect(apiTokenState(token(), NOW)).toBe('CURRENT');
  });

  it('expires at its expiry, to the instant', () => {
    expect(apiTokenState(token({ expiresAt: NOW }), NOW)).toBe('EXPIRED');
    expect(
      apiTokenState(token({ expiresAt: new Date(NOW.getTime() + 1) }), NOW),
    ).toBe('CURRENT');
  });

  it('is retiring while its overlap runs, and replaced once it is over', () => {
    const retiring = token({ retiresAt: new Date(NOW.getTime() + HOUR) });
    expect(apiTokenState(retiring, NOW)).toBe('RETIRING');
    expect(apiTokenState(retiring, new Date(NOW.getTime() + HOUR))).toBe(
      'REPLACED',
    );
  });

  it('reads revoked whatever else is true of it', () => {
    expect(apiTokenState(token({ revokedAt: NOW }), NOW)).toBe('REVOKED');
    expect(
      apiTokenState(
        token({ revokedAt: NOW, retiresAt: new Date(NOW.getTime() + HOUR) }),
        NOW,
      ),
    ).toBe('REVOKED');
    expect(
      apiTokenState(
        token({ revokedAt: NOW, expiresAt: at('2026-01-01T00:00:00Z') }),
        NOW,
      ),
    ).toBe('REVOKED');
  });

  it('authenticates only while current or retiring', () => {
    expect(isApiTokenUsable('CURRENT')).toBe(true);
    expect(isApiTokenUsable('RETIRING')).toBe(true);
    expect(isApiTokenUsable('REPLACED')).toBe(false);
    expect(isApiTokenUsable('EXPIRED')).toBe(false);
    expect(isApiTokenUsable('REVOKED')).toBe(false);
  });
});

describe('rotation', () => {
  it('offers the four overlaps the owner chose', () => {
    expect(TOKEN_ROTATION_OVERLAP_CODES).toEqual([
      'NONE',
      'ONE_HOUR',
      'ONE_DAY',
      'SEVEN_DAYS',
    ]);
  });

  it('retires the old token after the overlap', () => {
    const expiresAt = new Date(NOW.getTime() + 60 * DAY);
    expect(retirementFor('NONE', NOW, expiresAt)).toEqual(NOW);
    expect(retirementFor('ONE_HOUR', NOW, expiresAt)).toEqual(
      new Date(NOW.getTime() + HOUR),
    );
    expect(retirementFor('SEVEN_DAYS', NOW, expiresAt)).toEqual(
      new Date(NOW.getTime() + 7 * DAY),
    );
  });

  it('stops a token replaced at once from working at once', () => {
    const retired = token({
      retiresAt: retirementFor('NONE', NOW, token().expiresAt),
    });
    expect(apiTokenState(retired, NOW)).toBe('REPLACED');
  });

  it('never lets a rotation outlive the old token’s own expiry', () => {
    const expiresAt = new Date(NOW.getTime() + 2 * DAY);
    expect(retirementFor('SEVEN_DAYS', NOW, expiresAt)).toEqual(expiresAt);
  });
});

describe('the reminder', () => {
  it('flags a current token inside the window', () => {
    const soon = token({ expiresAt: new Date(NOW.getTime() + 10 * DAY) });
    expect(isTokenExpiringSoon(soon, NOW, 14)).toBe(true);
    expect(isTokenExpiringSoon(token(), NOW, 14)).toBe(false);
  });

  it('counts the last day of the window', () => {
    const edge = token({ expiresAt: new Date(NOW.getTime() + 14 * DAY) });
    expect(isTokenExpiringSoon(edge, NOW, 14)).toBe(true);
    expect(
      isTokenExpiringSoon(
        token({ expiresAt: new Date(NOW.getTime() + 14 * DAY + 1) }),
        NOW,
        14,
      ),
    ).toBe(false);
  });

  it('does not flag a token that is being replaced or has stopped', () => {
    const soon = new Date(NOW.getTime() + DAY);
    expect(
      isTokenExpiringSoon(
        token({ expiresAt: soon, retiresAt: new Date(NOW.getTime() + HOUR) }),
        NOW,
        14,
      ),
    ).toBe(false);
    expect(
      isTokenExpiringSoon(token({ expiresAt: soon, revokedAt: NOW }), NOW, 14),
    ).toBe(false);
    expect(isTokenExpiringSoon(token({ expiresAt: NOW }), NOW, 14)).toBe(false);
  });
});

describe('the status a client is shown with', () => {
  const issued = (
    createdAt: string,
    overrides: Partial<ApiTokenFacts> = {},
  ) => ({
    ...token(overrides),
    createdAt: at(createdAt),
  });

  it('is the stored status for anything but an active client', () => {
    const expired = [issued('2026-01-01T00:00:00Z', { expiresAt: NOW })];
    expect(apiClientStanding('PENDING', [], NOW)).toBe('PENDING');
    expect(apiClientStanding('SUSPENDED', expired, NOW)).toBe('SUSPENDED');
    expect(apiClientStanding('REVOKED', expired, NOW)).toBe('REVOKED');
  });

  it('is active with a token in use, or with none ever issued', () => {
    expect(apiClientStanding('ACTIVE', [], NOW)).toBe('ACTIVE');
    expect(
      apiClientStanding('ACTIVE', [issued('2026-09-01T00:00:00Z')], NOW),
    ).toBe('ACTIVE');
  });

  it('is expired once the newest token has run out', () => {
    expect(
      apiClientStanding(
        'ACTIVE',
        [
          issued('2026-06-01T00:00:00Z', {
            expiresAt: at('2026-09-01T00:00:00Z'),
          }),
        ],
        NOW,
      ),
    ).toBe('EXPIRED');
  });

  it('is active again as soon as a new token is issued', () => {
    expect(
      apiClientStanding(
        'ACTIVE',
        [
          issued('2026-06-01T00:00:00Z', {
            expiresAt: at('2026-09-01T00:00:00Z'),
          }),
          issued('2026-10-01T00:00:00Z'),
        ],
        NOW,
      ),
    ).toBe('ACTIVE');
  });

  it('stays active when the newest token was revoked, since nothing expired', () => {
    expect(
      apiClientStanding(
        'ACTIVE',
        [
          issued('2026-06-01T00:00:00Z', {
            expiresAt: at('2026-09-01T00:00:00Z'),
          }),
          issued('2026-09-15T00:00:00Z', {
            revokedAt: at('2026-09-20T00:00:00Z'),
          }),
        ],
        NOW,
      ),
    ).toBe('ACTIVE');
  });
});

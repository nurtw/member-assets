import { describe, expect, it } from 'vitest';

import {
  bucketRetryAfterSeconds,
  dailyRetryAfterSeconds,
  effectiveDailyQuota,
  hourStart,
  hourlyRetryAfterSeconds,
  lagosDayStart,
  ratePerMinute,
  routeClassForScope,
  secondsUntil,
  windowStart,
  type RateLimitQuotas,
} from './limits.js';

const at = (iso: string) => new Date(iso);

const STANDARD: RateLimitQuotas = {
  verificationPerMinute: 30,
  aggregatePerMinute: 2,
  burst: 5,
  hourlyQuota: null,
  dailyQuota: 1000,
};

describe('the rate a route is held to', () => {
  it('gives only an aggregate scope the aggregate rate', () => {
    expect(routeClassForScope('aggregate:vehicles:total')).toBe('AGGREGATE');
    expect(routeClassForScope('aggregate:vehicles:read')).toBe('AGGREGATE');
    for (const scope of [
      'vehicle:verify:plate',
      'sticker:verify:qr',
      'vehicle:verify:combined',
      'member:verify:membership',
      'organization:metadata:read',
      'audit:client:read',
    ]) {
      expect(routeClassForScope(scope)).toBe('VERIFICATION');
    }
  });

  it('reads the rate for that class from the profile', () => {
    expect(ratePerMinute(STANDARD, 'VERIFICATION')).toBe(30);
    expect(ratePerMinute(STANDARD, 'AGGREGATE')).toBe(2);
  });
});

describe('the daily quota', () => {
  it('is the organisation’s own where one is set, else the profile’s', () => {
    expect(effectiveDailyQuota(1000, null)).toBe(1000);
    expect(effectiveDailyQuota(1000, 250)).toBe(250);
    expect(effectiveDailyQuota(1000, 20000)).toBe(20000);
  });

  it('runs over the day in Lagos, which starts at 23:00 UTC', () => {
    expect(lagosDayStart(at('2026-10-03T12:00:00Z'))).toEqual(
      at('2026-10-02T23:00:00Z'),
    );
    expect(lagosDayStart(at('2026-10-03T22:59:59.999Z'))).toEqual(
      at('2026-10-02T23:00:00Z'),
    );
    // 23:30 UTC is half past midnight in Awka: the next day has begun.
    expect(lagosDayStart(at('2026-10-03T23:30:00Z'))).toEqual(
      at('2026-10-03T23:00:00Z'),
    );
    expect(lagosDayStart(at('2026-10-03T23:00:00Z'))).toEqual(
      at('2026-10-03T23:00:00Z'),
    );
  });

  it('starts again at the next midnight in Lagos', () => {
    expect(dailyRetryAfterSeconds(at('2026-10-03T22:59:00Z'))).toBe(60);
    expect(dailyRetryAfterSeconds(at('2026-10-03T23:00:00Z'))).toBe(86_400);
    expect(dailyRetryAfterSeconds(at('2026-10-03T12:00:00Z'))).toBe(39_600);
  });
});

describe('the hourly quota', () => {
  it('runs over the clock hour', () => {
    expect(hourStart(at('2026-10-03T12:34:56.789Z'))).toEqual(
      at('2026-10-03T12:00:00Z'),
    );
    expect(hourlyRetryAfterSeconds(at('2026-10-03T12:59:30Z'))).toBe(30);
    expect(hourlyRetryAfterSeconds(at('2026-10-03T12:00:00Z'))).toBe(3600);
  });
});

describe('fixed windows', () => {
  it('start on a multiple of their length', () => {
    expect(windowStart(at('2026-10-03T12:07:45Z'), 10)).toEqual(
      at('2026-10-03T12:00:00Z'),
    );
    expect(windowStart(at('2026-10-03T12:10:00Z'), 10)).toEqual(
      at('2026-10-03T12:10:00Z'),
    );
    expect(windowStart(at('2026-10-03T12:07:45.500Z'), 1)).toEqual(
      at('2026-10-03T12:07:00Z'),
    );
  });
});

describe('Retry-After', () => {
  it('is how long the bucket needs to hold a whole token', () => {
    // 30 a minute is one token every two seconds.
    expect(bucketRetryAfterSeconds(0, 30)).toBe(2);
    expect(bucketRetryAfterSeconds(0.5, 30)).toBe(1);
    // 2 a minute is one every thirty seconds.
    expect(bucketRetryAfterSeconds(0, 2)).toBe(30);
    expect(bucketRetryAfterSeconds(0.9, 2)).toBe(3);
  });

  it('is never less than a second', () => {
    expect(bucketRetryAfterSeconds(0.999, 6000)).toBe(1);
    expect(bucketRetryAfterSeconds(1, 30)).toBe(1);
    expect(
      secondsUntil(at('2026-10-03T12:00:00Z'), at('2026-10-03T12:00:05Z')),
    ).toBe(1);
  });

  it('rounds up, so a caller never returns early', () => {
    expect(
      secondsUntil(at('2026-10-03T12:00:01.001Z'), at('2026-10-03T12:00:00Z')),
    ).toBe(2);
  });
});

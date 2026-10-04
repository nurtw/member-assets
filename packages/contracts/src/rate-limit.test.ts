import { ABUSE_SIGNALS } from '@nurtw/domain';
import { describe, expect, it } from 'vitest';

import {
  ABUSE_SIGNAL_LABELS,
  DEFAULT_RATE_LIMIT_PROFILE,
  SYSTEM_RATE_LIMIT_PROFILES,
  createRateLimitProfileSchema,
  liftApiClientPauseSchema,
  setApiClientLimitsSchema,
  updateRateLimitProfileSchema,
} from './index.js';

const [STANDARD, TRUSTED] = SYSTEM_RATE_LIMIT_PROFILES;

const values = {
  verificationPerMinute: 30,
  aggregatePerMinute: 2,
  burst: 5,
  hourlyQuota: null,
  dailyQuota: 1000,
  windowMinutes: 10,
  forgeryThreshold: 5,
  missThreshold: 30,
  missPercent: 80,
  sequenceThreshold: 5,
  sequenceReach: 3,
  pauseMinutes: 60,
};

describe('the seeded limit profiles (item 13)', () => {
  it('carry the rates and bursts of proposal §14.2', () => {
    expect(STANDARD).toMatchObject({
      code: 'STANDARD',
      verificationPerMinute: 30,
      aggregatePerMinute: 2,
      burst: 5,
    });
    expect(TRUSTED).toMatchObject({
      code: 'TRUSTED',
      verificationPerMinute: 120,
      aggregatePerMinute: 5,
      burst: 20,
    });
  });

  it('carry the daily quotas the owner chose, and an hour’s pause', () => {
    expect(STANDARD.dailyQuota).toBe(1000);
    expect(TRUSTED.dailyQuota).toBe(5000);
    expect(STANDARD.pauseMinutes).toBe(60);
    expect(TRUSTED.pauseMinutes).toBe(60);
  });

  it('are themselves acceptable to the schema that amends them', () => {
    for (const profile of SYSTEM_RATE_LIMIT_PROFILES) {
      const { code: _code, ...rest } = profile;
      expect(
        updateRateLimitProfileSchema.safeParse({
          ...rest,
          reason: 'Seed check',
        }).success,
      ).toBe(true);
    }
  });

  it('include the profile an organisation starts with', () => {
    expect(SYSTEM_RATE_LIMIT_PROFILES.map((profile) => profile.code)).toContain(
      DEFAULT_RATE_LIMIT_PROFILE,
    );
  });
});

describe('limit profile requests', () => {
  it('take whole numbers within bounds, and nothing else', () => {
    const create = (overrides: object) =>
      createRateLimitProfileSchema.safeParse({
        code: 'INSURER_BATCH',
        label: 'Insurer batch',
        ...values,
        ...overrides,
      }).success;

    expect(create({})).toBe(true);
    expect(create({ hourlyQuota: 500 })).toBe(true);
    expect(create({ verificationPerMinute: 0 })).toBe(false);
    expect(create({ burst: 2.5 })).toBe(false);
    expect(create({ dailyQuota: null })).toBe(false);
    expect(create({ missPercent: 101 })).toBe(false);
    expect(create({ sequenceThreshold: 1 })).toBe(false);
    expect(create({ pauseMinutes: 10_081 })).toBe(false);
    expect(create({ dailyQuota: '1000' })).toBe(false);
    expect(create({ code: 'lowercase' })).toBe(false);
  });

  it('need every number and a reason to amend a profile', () => {
    expect(
      updateRateLimitProfileSchema.safeParse({
        label: 'Approved external client',
        ...values,
      }).success,
    ).toBe(false);
    const { burst: _burst, ...withoutBurst } = values;
    expect(
      updateRateLimitProfileSchema.safeParse({
        label: 'Approved external client',
        ...withoutBurst,
        reason: 'Raised after review',
      }).success,
    ).toBe(false);
    expect(
      updateRateLimitProfileSchema.safeParse({
        label: 'Approved external client',
        ...values,
        reason: 'Raised after review',
      }).success,
    ).toBe(true);
  });

  it('cannot rename a profile’s code when amending it', () => {
    const parsed = updateRateLimitProfileSchema.parse({
      code: 'RENAMED',
      label: 'Approved external client',
      ...values,
      reason: 'Raised after review',
    });
    expect(parsed).not.toHaveProperty('code');
  });
});

describe('an organisation’s limits', () => {
  it('take a profile, and a daily quota of its own or none', () => {
    const set = (overrides: object) =>
      setApiClientLimitsSchema.safeParse({
        rateLimitProfile: 'TRUSTED',
        dailyQuota: null,
        reason: 'Approved for roadside checks',
        ...overrides,
      }).success;

    expect(set({})).toBe(true);
    expect(set({ dailyQuota: 2500 })).toBe(true);
    expect(set({ dailyQuota: 0 })).toBe(false);
    expect(set({ dailyQuota: undefined })).toBe(false);
    expect(set({ rateLimitProfile: '' })).toBe(false);
    expect(set({ reason: ' ' })).toBe(false);
  });

  it('need a reason to lift a pause', () => {
    expect(liftApiClientPauseSchema.safeParse({}).success).toBe(false);
    expect(
      liftApiClientPauseSchema.safeParse({ reason: 'Integration fault fixed' })
        .success,
    ).toBe(true);
  });
});

describe('the reasons for a pause', () => {
  it('each have wording an officer can read', () => {
    for (const signal of ABUSE_SIGNALS) {
      expect(ABUSE_SIGNAL_LABELS[signal].label.length).toBeGreaterThan(3);
      expect(ABUSE_SIGNAL_LABELS[signal].description.length).toBeGreaterThan(
        20,
      );
    }
  });
});

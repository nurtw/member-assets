import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from './settings.service.js';

/**
 * Settings are remembered briefly (so one request does not pay a round trip per
 * setting), and forgotten the moment this process writes one.
 */
describe('SettingsService cache', () => {
  let findUnique: ReturnType<typeof vi.fn>;
  let upsert: ReturnType<typeof vi.fn>;
  let service: SettingsService;

  beforeEach(() => {
    // Under `test` the cache is off, which suites rely on. Turn it on here.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgresql://example.test/none');
    vi.useFakeTimers();
    findUnique = vi.fn().mockResolvedValue({ value: 'true' });
    upsert = vi.fn().mockResolvedValue(undefined);
    service = new SettingsService({
      systemSetting: { findUnique, upsert },
    } as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('reads the database once for repeated reads of one key', async () => {
    await service.isEnabled('a.switch');
    await service.isEnabled('a.switch');
    await service.getString('a.switch');

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('remembers that a row is absent, and answers the fallback', async () => {
    findUnique.mockResolvedValue(null);

    expect(await service.isEnabled('missing', true)).toBe(true);
    expect(await service.isEnabled('missing', true)).toBe(true);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('looks again once five seconds have passed', async () => {
    await service.isEnabled('a.switch');
    vi.advanceTimersByTime(5_001);
    await service.isEnabled('a.switch');

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('applies a change made through it at once', async () => {
    expect(await service.isEnabled('a.switch')).toBe(true);

    findUnique.mockResolvedValue({ value: 'false' });
    await service.set('a.switch', 'false', 'user-1');

    expect(await service.isEnabled('a.switch')).toBe(false);
  });

  it('is not overwritten by a read that began before a write', async () => {
    let release!: (row: { value: string }) => void;
    findUnique.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const slow = service.isEnabled('a.switch'); // sees the old value, late
    service.invalidate('a.switch'); // a write lands meanwhile
    release({ value: 'true' });
    await slow;

    findUnique.mockResolvedValue({ value: 'false' });
    expect(await service.isEnabled('a.switch')).toBe(false);
  });

  it('does not remember anything under test', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const uncached = new SettingsService({
      systemSetting: { findUnique },
    } as unknown as PrismaService);

    await uncached.isEnabled('a.switch');
    await uncached.isEnabled('a.switch');

    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

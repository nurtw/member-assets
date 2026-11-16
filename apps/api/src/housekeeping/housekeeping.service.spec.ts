import { describe, expect, it, vi } from 'vitest';

import { HousekeepingService } from './housekeeping.service.js';

describe('HousekeepingService', () => {
  it('runs every registered job, in order', async () => {
    const order: string[] = [];
    const service = new HousekeepingService();
    service.register('first', async () => {
      order.push('first');
    });
    service.register('second', async () => {
      order.push('second');
    });

    expect(await service.runOnce()).toEqual([]);
    expect(order).toEqual(['first', 'second']);
  });

  it('does not let one failure hold up the rest, and names it', async () => {
    const after = vi.fn().mockResolvedValue(undefined);
    const service = new HousekeepingService();
    service.register('broken', () => Promise.reject(new Error('boom')));
    service.register('after', after);

    expect(await service.runOnce()).toEqual(['broken']);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('does not start a second run while one is running', async () => {
    let release!: () => void;
    const job = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const service = new HousekeepingService();
    service.register('slow', job);

    const first = service.runOnce();
    await service.runOnce();
    release();
    await first;

    expect(job).toHaveBeenCalledTimes(1);
  });

  it('replaces a job registered twice under one name', async () => {
    const old = vi.fn().mockResolvedValue(undefined);
    const current = vi.fn().mockResolvedValue(undefined);
    const service = new HousekeepingService();
    service.register('job', old);
    service.register('job', current);

    await service.runOnce();

    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });
});

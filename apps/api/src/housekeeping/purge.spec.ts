import { describe, expect, it, vi } from 'vitest';

import { purgeInBatches } from './purge.js';

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }));

describe('purgeInBatches', () => {
  it('removes everything, a batch at a time', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce(rows(3))
      .mockResolvedValueOnce(rows(3))
      .mockResolvedValueOnce(rows(1));
    const remove = vi.fn().mockResolvedValue(undefined);

    const removed = await purgeInBatches(find, remove, { batchSize: 3 });

    expect(removed).toBe(7);
    expect(remove).toHaveBeenCalledTimes(3);
    expect(find).toHaveBeenCalledWith(3);
  });

  it('stops at once when nothing is old enough', async () => {
    const find = vi.fn().mockResolvedValue([]);
    const remove = vi.fn();

    expect(await purgeInBatches(find, remove)).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('stops at the cap, leaving the rest for the next run', async () => {
    const find = vi.fn().mockResolvedValue(rows(2));
    const remove = vi.fn().mockResolvedValue(undefined);

    const removed = await purgeInBatches(find, remove, {
      batchSize: 2,
      maxBatches: 4,
    });

    expect(removed).toBe(8);
    expect(find).toHaveBeenCalledTimes(4);
  });
});

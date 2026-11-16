/**
 * Deletes rows a few thousand at a time, until none are left or the cap is hit.
 *
 * One `DELETE` over a large backlog holds locks and writes one large change to
 * the database's history, which it bills for. In batches, each is small and
 * commits on its own, and a run that is cut short resumes at the next one.
 * Returns how many rows were removed.
 */
export async function purgeInBatches(
  find: (take: number) => Promise<{ id: string }[]>,
  remove: (ids: string[]) => Promise<unknown>,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<number> {
  const batchSize = options.batchSize ?? 2_000;
  const maxBatches = options.maxBatches ?? 50;
  let removed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await find(batchSize);
    if (rows.length === 0) {
      break;
    }
    await remove(rows.map((row) => row.id));
    removed += rows.length;
    if (rows.length < batchSize) {
      break;
    }
  }
  return removed;
}

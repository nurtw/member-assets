import { readFileSync } from 'node:fs';

import { parse } from 'csv-parse/sync';

/**
 * Reads one legacy export file into header-keyed rows.
 *
 * `data/` is a production export outside version control (CLAUDE.md) — this
 * is the only place its bytes are read; every downstream step works with
 * already-parsed rows, never the file again.
 */
export function readLegacyCsv(path: string): Record<string, string>[] {
  const raw = readFileSync(path, 'utf-8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

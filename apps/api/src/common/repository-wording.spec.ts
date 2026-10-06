import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The company that ran the previous system and printed the earlier stickers is
 * never named in this repository (the owner's direction of 5 October 2026):
 * not in code, a comment, a test, a document, a plan, a file's name, or a
 * screen's wording. Its stickers are "legacy stickers", its codes "legacy
 * barcodes", and the company itself "the previous operator".
 *
 * This test reads every file git tracks, and every new file git would track,
 * and fails on the name. The name is assembled below from two parts so that
 * this file passes its own test.
 */
const NAME = ['trans', 'pay'].join('');
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function repositoryFiles(): string[] | null {
  try {
    return execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
      .split('\0')
      .filter(Boolean);
  } catch {
    // No git here (an image build, say): there is nothing to list.
    return null;
  }
}

describe('the previous operator is never named', () => {
  const files = repositoryFiles();

  it.skipIf(files === null)('lists the repository', () => {
    expect(files).toContain('CLAUDE.md');
  });

  it.skipIf(files === null)('in no file name', () => {
    const named = (files ?? []).filter((name) =>
      name.toLowerCase().includes(NAME),
    );
    expect(named).toEqual([]);
  });

  it.skipIf(files === null)('in no file', () => {
    const named = (files ?? []).filter((name) => {
      try {
        return readFileSync(join(ROOT, name), 'latin1')
          .toLowerCase()
          .includes(NAME);
      } catch {
        // Listed but gone from disk: removed and not yet staged.
        return false;
      }
    });
    expect(named).toEqual([]);
    // Every file is read, which is slow on a cold disk.
  }, 60_000);
});

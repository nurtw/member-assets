import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lookupHash } from './member-identity.service.js';

/**
 * A member's NIN is sealed, and one class may open it (item 44; PRD
 * Requirement 7.4). Any other source file that names the sealed column fails
 * here, as the verification module's read-only test fails on a write. The
 * end-to-end suite checks that no response carries a NIN.
 */
const SEALED_COLUMN = /ninCiphertext|nin_ciphertext/;

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return sourcesUnder(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('the sealed NIN', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('is named by the identity service and by nothing else', () => {
    const naming = sourcesUnder(root)
      .filter((path) => SEALED_COLUMN.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path).split(sep).join('/'));
    expect(naming).toEqual(['membership/member-identity.service.ts']);
  });
});

describe('the keyed hash a NIN is matched by', () => {
  const nin = '12345678901';

  it('is the same for the same NIN under the same key', () => {
    expect(lookupHash(nin, 'key-one')).toBe(lookupHash(nin, 'key-one'));
    expect(lookupHash(nin, 'key-one')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs under another key, and for another NIN', () => {
    expect(lookupHash(nin, 'key-two')).not.toBe(lookupHash(nin, 'key-one'));
    expect(lookupHash('12345678902', 'key-one')).not.toBe(
      lookupHash(nin, 'key-one'),
    );
  });

  it('never contains the NIN', () => {
    expect(lookupHash(nin, 'key-one')).not.toContain(nin);
  });
});

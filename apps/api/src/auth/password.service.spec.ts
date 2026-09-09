import { describe, expect, it } from 'vitest';

import { PasswordService } from './password.service.js';

/**
 * Synthetic credentials only. No value here resembles a real one, per PRD §25.2.
 */
describe('PasswordService', () => {
  const service = new PasswordService();

  it('verifies a correct password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(
      service.verify('correct horse battery staple', hash),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(
      service.verify('Correct horse battery staple', hash),
    ).resolves.toBe(false);
  });

  it('produces a different hash each time for the same password', async () => {
    // A per-hash salt. Without it, two officers choosing the same password would
    // be visibly identical in the table, and one cracked hash would yield both.
    const [a, b] = await Promise.all([
      service.hash('same'),
      service.hash('same'),
    ]);
    expect(a).not.toBe(b);
  });

  it('records its parameters inside the hash', async () => {
    // This is what allows the cost to be raised later without forcing a
    // password reset on every user.
    const hash = await service.hash('whatever');
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
  });

  it('normalises unicode so a password types the same on any keyboard', async () => {
    // "é" composed vs decomposed are different byte sequences but the same
    // character to the person typing it.
    const composed = 'passé';
    const decomposed = 'passé';
    expect(composed).not.toBe(decomposed);

    const hash = await service.hash(composed);
    await expect(service.verify(decomposed, hash)).resolves.toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['not our format', 'plaintext-password'],
    ['wrong algorithm', 'bcrypt$10$abc$def$ghi$jkl'],
    ['truncated', 'scrypt$32768$8$1$abc'],
    ['non-numeric cost', 'scrypt$abc$8$1$c2FsdA$aGFzaA'],
  ])('returns false for a malformed hash (%s)', async (_label, encoded) => {
    // Denying access beats throwing: a 500 here would distinguish a corrupted
    // row from a wrong password, which is itself information.
    await expect(service.verify('anything', encoded)).resolves.toBe(false);
  });

  it('rejects a legacy bcrypt hash rather than mis-verifying it', async () => {
    // The legacy export contains bcrypt hashes. If those are ever imported they
    // must fail closed here, not be silently treated as valid.
    const bcryptShaped =
      '$2b$10$N4Qf76nb7yUz5EpaEkBzROasmolu1LH7hO8gdrM0PCW5.QmdlasbK';
    await expect(service.verify('anything', bcryptShaped)).resolves.toBe(false);
  });

  it('flags a weaker hash for upgrade', async () => {
    expect(service.needsRehash('scrypt$1024$8$1$c2FsdA$aGFzaA')).toBe(true);
  });

  it('does not flag a current hash for upgrade', async () => {
    const hash = await service.hash('current');
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('flags an unrecognised format for upgrade', async () => {
    expect(service.needsRehash('$2b$10$something')).toBe(true);
  });
});

import { Injectable } from '@nestjs/common';

import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from './password-hashing.js';

/**
 * Injectable wrapper over `password-hashing.ts`.
 *
 * The algorithm lives in a decorator-free module so the seed script can import
 * it under `--experimental-strip-types`, which cannot strip decorators. Keeping
 * the crypto in one place matters more than the indirection costs: two
 * implementations of password hashing is exactly how a system ends up with an
 * account whose password verifies against the wrong scheme.
 */
@Injectable()
export class PasswordService {
  hash(plaintext: string): Promise<string> {
    return hashPassword(plaintext);
  }

  verify(plaintext: string, encoded: string): Promise<boolean> {
    return verifyPassword(plaintext, encoded);
  }

  needsRehash(encoded: string): boolean {
    return passwordNeedsRehash(encoded);
  }
}

export { InvalidPasswordHashError } from './password-hashing.js';

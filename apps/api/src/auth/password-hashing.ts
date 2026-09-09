import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * `promisify` collapses scrypt's overloads and drops the one taking options, so
 * the cost parameters cannot be passed through it. Wrapped explicitly instead.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

/**
 * Password hashing.
 *
 * Uses Node's built-in scrypt — a memory-hard key-derivation function — rather
 * than adding argon2 or bcrypt. Both of those are native modules, which
 * complicate the container build for no security gain at these parameters;
 * scrypt is in the standard library, has no build step, and is a sound choice
 * for password storage.
 *
 * The cost parameters are stored *inside* the encoded hash. That is what allows
 * them to be raised later without invalidating existing passwords: an old hash
 * still verifies against its own recorded parameters, and can be re-hashed at
 * next successful login. A scheme that hard-codes cost cannot be strengthened
 * without forcing a password reset on everyone.
 *
 * PRD §17 — a password hash must never appear in a response or a log. Nothing
 * here logs, and the encoded form is only ever written to `user.password_hash`.
 *
 * Deliberately free of NestJS decorators so the seed script can import it under
 * `--experimental-strip-types`, which cannot strip decorators. `PasswordService`
 * is a thin injectable wrapper over these functions.
 */

/** CPU/memory cost. 2^15 ≈ 32 MB per hash. */
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const ALGORITHM = 'scrypt';

export class InvalidPasswordHashError extends Error {
  override readonly name = 'InvalidPasswordHashError';
}

/** Encodes as `scrypt$N$r$p$salt$key`, all base64url. */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(plaintext.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISATION,
    // Node's default maxmem is too small for N=32768; raise it deliberately
    // rather than silently lowering the cost to fit.
    maxmem: 256 * COST * BLOCK_SIZE,
  });

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Constant-time verification against the parameters recorded in the hash.
 *
 * Returns false for a malformed hash rather than throwing, so a corrupted row
 * denies access instead of producing a 500 that distinguishes it from a wrong
 * password.
 */
export async function verifyPassword(
  plaintext: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return false;
  }

  const [, costRaw, blockRaw, parallelRaw, saltRaw, keyRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelisation = Number(parallelRaw);

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelisation) ||
    cost <= 1
  ) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(keyRaw, 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0) {
    return false;
  }

  const salt = Buffer.from(saltRaw, 'base64url');
  const actual = await scrypt(
    plaintext.normalize('NFKC'),
    salt,
    expected.length,
    {
      N: cost,
      r: blockSize,
      p: parallelisation,
      maxmem: 256 * cost * blockSize,
    },
  );

  return timingSafeEqual(actual, expected);
}

/**
 * True when a stored hash was produced with weaker parameters than current
 * policy, so it can be transparently upgraded on next successful login.
 */
export function passwordNeedsRehash(encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return true;
  }
  return Number(parts[1]) < COST;
}

/**
 * Typed environment configuration.
 *
 * ARCHITECTURE.md Decision 12.1 — domain code never calls a DigitalOcean, Vercel,
 * or Neon API. Everything platform-specific arrives here, as environment
 * configuration, so that relocating the deployment is a provisioning exercise.
 *
 * Validation happens once at boot and fails loudly. A service that starts with a
 * missing secret and only discovers it on the first request is harder to diagnose
 * than one that refuses to start.
 */

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface Environment {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  /** Origins permitted to call the API from a browser. Empty in production means same-origin only. */
  readonly corsOrigins: readonly string[];
  /** Maximum accepted request body. PRD §14.3 requires an enforced ceiling. */
  readonly maxRequestBodyBytes: number;
  /**
   * PostgreSQL connection string. Supplied to the Prisma driver adapter at
   * runtime; Prisma 7 no longer reads it from the schema.
   */
  readonly databaseUrl: string;
  /**
   * Paystack secret key (PRD Requirement 27.10). Held only by the API, read
   * from the environment, and never logged. `undefined` when payments are
   * not configured for this deployment — `PaystackClient` fails loudly on
   * first use rather than at boot, since not every environment runs the
   * payments module.
   */
  readonly paystackSecretKey: string | undefined;
  readonly paystackBaseUrl: string;
  /**
   * The sticker QR HMAC secret (PRD §26.2, ARCHITECTURE.md Decision 6.2.2).
   * Held only by the issuing and verification services, never the web app.
   * Keyed by `stickerSigningKeyId` so a future rotation adds a second entry
   * rather than replacing this one — old stickers keep verifying under the
   * key that minted them.
   */
  readonly stickerSigningSecret: string | undefined;
  readonly stickerSigningKeyId: string;
}

class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError';
}

function readEnum(
  key: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  if (!allowed.includes(raw)) {
    throw new EnvironmentError(
      `${key} must be one of ${allowed.join(', ')}; received "${raw}".`,
    );
  }
  return raw;
}

function readPort(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new EnvironmentError(
      `${key} must be an integer between 1 and 65535; received "${raw}".`,
    );
  }
  return parsed;
}

function readList(key: string): readonly string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function loadEnvironment(): Environment {
  const nodeEnv = readEnum(
    'NODE_ENV',
    ['development', 'test', 'production'],
    'development',
  ) as NodeEnvironment;

  return {
    nodeEnv,
    port: readPort('PORT', 3001),
    corsOrigins: readList('CORS_ORIGINS'),
    maxRequestBodyBytes: 1_000_000,
    databaseUrl: readRequired('DATABASE_URL'),
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY?.trim() || undefined,
    paystackBaseUrl:
      process.env.PAYSTACK_BASE_URL?.trim() || 'https://api.paystack.co',
    stickerSigningSecret:
      process.env.STICKER_SIGNING_SECRET?.trim() || undefined,
    stickerSigningKeyId:
      // Matches .env.example's documented default (roadmap item 08).
      process.env.STICKER_SIGNING_KEY_ID?.trim() || 'k1',
  };
}

function readRequired(key: string): string {
  const raw = process.env[key]?.trim();
  if (!raw) {
    throw new EnvironmentError(
      `${key} is required. Copy .env.example to .env and set it. For local ` +
        'development run `docker compose up -d` first.',
    );
  }
  return raw;
}

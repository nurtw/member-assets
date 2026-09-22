import type { Prisma } from '@prisma/client';

/**
 * The four launch fee types (PRD Requirement 27.2 / `QUESTIONS.md` PAY-02).
 * These are **not placeholders** — the owner set them for live charging.
 *
 * No Nest decorators here, deliberately: `prisma/seed.ts` imports this file
 * under `--experimental-strip-types`, which cannot strip decorators (the
 * same reason `password-hashing.ts` carries none).
 */
export const LAUNCH_FEE_TYPES = [
  {
    code: 'STICKER_REATTACHMENT',
    label: 'Sticker reattachment',
    amountKobo: 200_000,
    recurrence: 'ONE_OFF',
    chargedAgainst: 'VEHICLE',
    settlement: 'CONTRACTOR_ONLY',
  },
  {
    code: 'STICKER_NEW',
    label: 'New sticker',
    amountKobo: 200_000,
    recurrence: 'ONE_OFF',
    chargedAgainst: 'VEHICLE',
    settlement: 'CONTRACTOR_ONLY',
  },
  {
    code: 'LEVY',
    label: 'Monthly levy',
    amountKobo: 500_000,
    recurrence: 'MONTHLY',
    chargedAgainst: 'VEHICLE',
    settlement: 'SPLIT_WITH_NURTW',
  },
  {
    code: 'MEMBERSHIP',
    label: 'Yearly membership fee',
    amountKobo: 3_000_000,
    recurrence: 'YEARLY',
    chargedAgainst: 'MEMBER',
    settlement: 'SPLIT_WITH_NURTW',
  },
] as const satisfies readonly Prisma.FeeTypeCreateInput[];

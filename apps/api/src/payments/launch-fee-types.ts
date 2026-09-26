import type { Prisma } from '@prisma/client';

/**
 * The four launch fee types (PRD Requirement 27.2 / `QUESTIONS.md` PAY-02).
 * These are **not placeholders** — the owner set them for live charging.
 *
 * The levy is ₦7,000 (PAY-02, revised 26 September 2026), and is priced per
 * route type from the same figure (PAY-14) — see `LAUNCH_LEVY_ROUTE_PRICES`.
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
    amountKobo: 700_000,
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

/**
 * PAY-14 — the levy's launch amount for each route type: ₦7,000 for all
 * three until the Union sets different figures. Seeded on first run only; the
 * migration that introduced route-type pricing applies the same figures, with
 * audit events, to a database seeded before it.
 */
export const LAUNCH_LEVY_ROUTE_PRICES = [
  { routeTypeCode: 'INTERSTATE', amountKobo: 700_000 },
  { routeTypeCode: 'INTERCITY', amountKobo: 700_000 },
  { routeTypeCode: 'TOWN_SERVICE', amountKobo: 700_000 },
] as const;

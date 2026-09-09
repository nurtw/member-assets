/**
 * Record lifecycles.
 *
 * CLAUDE.md convention: status fields are enums with explicit lifecycles, never
 * booleans. A boolean cannot express the difference between a sticker that was
 * never issued, one that was replaced, and one reported lost — yet those three
 * must produce different verification outcomes.
 *
 * These are closed sets fixed by the PRD. They are deliberately NOT master data:
 * see `./master-data.ts` for the values the Union administers at runtime.
 */

/** PRD §8 — membership card lifecycle. */
export const CARD_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'ISSUED',
  'ACTIVE',
  'SUSPENDED',
  'LOST',
  'REPLACED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

/** PRD §10 — vehicle sticker lifecycle. Note DAMAGED, absent from the card set. */
export const STICKER_STATUSES = [
  'DRAFT',
  'ISSUED',
  'ACTIVE',
  'SUSPENDED',
  'LOST',
  'REPLACED',
  'DAMAGED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type StickerStatus = (typeof STICKER_STATUSES)[number];

/** PRD §9 — vehicle declaration lifecycle. */
export const DECLARATION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
  'DISPUTED',
  'ARCHIVED',
] as const;

export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

/**
 * Statuses that permit a positive verification result.
 *
 * PRD §26.3, Requirement 26.3: a valid signature is necessary but never
 * sufficient. Every positive verification additionally requires an active record
 * of good status. This list is that second condition — keep it narrow, and never
 * widen it to "not cancelled", which would admit LOST and REPLACED stickers.
 */
export const VERIFIABLE_STICKER_STATUSES: readonly StickerStatus[] = ['ACTIVE'];

export const VERIFIABLE_DECLARATION_STATUSES: readonly DeclarationStatus[] = [
  'ACTIVE',
];

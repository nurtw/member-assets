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

/**
 * PRD §8 — membership card lifecycle, and PRD §9 — vehicle declaration
 * lifecycle, as of item 07.
 *
 * Both re-exported from `@nurtw/domain` rather than restated here. The
 * domain package owns each list because it owns the transition table built
 * over it, and two copies of a status set is how one of them quietly gains a
 * state the other's transitions do not cover.
 *
 * The sticker set (PRD §10) joined them at item 10, when verification began
 * to depend on its lifecycle.
 */
export { CARD_STATUSES, type CardStatus } from '@nurtw/domain';
export {
  DECLARATION_STATUSES,
  isDeclarationLive,
  type DeclarationStatus,
} from '@nurtw/domain';
export { STICKER_STATUSES, type StickerStatus } from '@nurtw/domain';

import {
  DECLARATION_STATUSES,
  STICKER_STATUSES,
  isDeclarationLive,
  isStickerVerifiable,
} from '@nurtw/domain';
import type { DeclarationStatus, StickerStatus } from '@nurtw/domain';

/**
 * Statuses that permit a positive verification result.
 *
 * PRD §26.3, Requirement 26.3: a valid signature is necessary but never
 * sufficient. Every positive verification additionally requires an active record
 * of good status. Derived from `isStickerVerifiable`, which item 10's verdict
 * applies — keep it narrow, and never widen it to "not cancelled", which would
 * admit LOST and REPLACED stickers.
 */
export const VERIFIABLE_STICKER_STATUSES: readonly StickerStatus[] =
  STICKER_STATUSES.filter(isStickerVerifiable);

/**
 * Derived from `isDeclarationLive`, not restated — the same reason
 * `VERIFIABLE_STICKER_STATUSES` above is not.
 */
export const VERIFIABLE_DECLARATION_STATUSES: readonly DeclarationStatus[] =
  DECLARATION_STATUSES.filter(isDeclarationLive);

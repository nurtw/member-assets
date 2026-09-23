/**
 * The vehicle-sticker lifecycle.
 *
 * PRD §10 — nine states: Draft, Issued, Active, Suspended, Lost, Replaced,
 * Damaged, Expired, Cancelled. `DRAFT`/`ISSUED` are printed but not yet
 * attached (Requirement 10.3 — a sticker may exist unattached); `ACTIVE`
 * means attached and currently valid. Mirrors `vehicle/status.ts` and
 * `card/status.ts`: the legal-transition table lives here, once, rather
 * than being re-implemented slightly differently in a service.
 */

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

export class InvalidStickerTransitionError extends Error {
  override readonly name = 'InvalidStickerTransitionError';
}

/**
 * `DRAFT -> ISSUED` is printing; `ISSUED -> ACTIVE` is attachment
 * (Requirement 9A.2/10.3) — the only transition item 08's `attach()`
 * produces, and only once it passes `canAttach` below. `SUSPENDED` reverses
 * to `ACTIVE` (an administrative hold on an attached sticker, not a
 * physical change), matching the card lifecycle's `LOST`/`EXPIRED` ->
 * `REPLACED`-or-`CANCELLED`-only rule: once a sticker has left service by
 * damage, loss, or expiry, the only way forward is a replacement or
 * cancellation, never a silent return to `ACTIVE`.
 */
const STICKER_TRANSITIONS: Readonly<
  Record<StickerStatus, readonly StickerStatus[]>
> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['ACTIVE', 'LOST', 'DAMAGED', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'LOST', 'DAMAGED', 'EXPIRED', 'REPLACED'],
  SUSPENDED: ['ACTIVE', 'REPLACED', 'CANCELLED'],
  LOST: ['REPLACED', 'CANCELLED'],
  DAMAGED: ['REPLACED', 'CANCELLED'],
  EXPIRED: ['REPLACED', 'CANCELLED'],
  REPLACED: [],
  CANCELLED: [],
};

export function canTransitionSticker(
  from: StickerStatus,
  to: StickerStatus,
): boolean {
  return (STICKER_TRANSITIONS[from] ?? []).includes(to);
}

export function assertStickerTransition(
  from: StickerStatus,
  to: StickerStatus,
): void {
  if (canTransitionSticker(from, to)) {
    return;
  }
  const allowed = STICKER_TRANSITIONS[from] ?? [];
  throw new InvalidStickerTransitionError(
    allowed.length === 0
      ? `A sticker in ${from} is final and cannot move to ${to}.`
      : `A sticker cannot move from ${from} to ${to}. Permitted: ${allowed.join(', ')}.`,
  );
}

export function isStickerFinal(status: StickerStatus): boolean {
  return STICKER_TRANSITIONS[status].length === 0;
}

/**
 * Whether a sticker in this status is attached and occupies the
 * one-attached-sticker-per-vehicle slot. `SUSPENDED` counts, the same
 * reasoning `card/status.ts` gives for `ISSUED`/`ACTIVE`: an administrative
 * hold does not remove the physical article from the vehicle.
 */
export function isStickerAttached(status: StickerStatus): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED';
}

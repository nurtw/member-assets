/**
 * Shortening an address to fit a membership card.
 *
 * The proposal (§8) specifies the card's Address as "derived from an approved
 * card-display address, which may be shorter than the full residential address".
 * This derives the *suggestion* an officer starts from; what is printed is
 * whatever they confirm, and the API requires it to be sent explicitly.
 *
 * **This does not make the card module read `member_contact`.** Decision 10.1
 * keeps the residential address away from card-display data, and it still is:
 * the officer sees the address on the registration screen, where they are
 * already authorised to, and the shortened value travels to the API as an
 * ordinary field. The card module has no route to the sensitive tables.
 */

/**
 * How much address the card holds.
 *
 * The physical field is roughly 51 mm wide over two lines at the size the
 * template draws it. Thirty characters is what fits comfortably without the
 * renderer having to shrink the line — see `LAYOUT.fields` in
 * `apps/api/src/card/templates/v1-provisional.ts`.
 */
export const CARD_ADDRESS_LENGTH = 30;

/**
 * The suggested card address for a residential address.
 *
 * Cut at a **boundary, never mid-word**. A hard slice of "512 Road, Festac Town,
 * Amuwo-Odofin" gives "512 Road, Festac Town, Amuwo-Od", which looks like a
 * defect on a printed card and which an officer would correct every single time
 * — so the default would cost more than it saved. Preferring the last comma, then
 * the last space, yields "512 Road, Festac Town" instead.
 *
 * No ellipsis. This is an address in its own right, not a truncated quotation of
 * one, and a card reading "512 Road, Festac Town…" states that something is
 * missing rather than simply being shorter.
 *
 * A single word longer than the limit is cut at the limit, because there is no
 * boundary to prefer and a blank suggestion helps nobody.
 */
export function suggestCardAddress(
  residentialAddress: string | null | undefined,
  limit: number = CARD_ADDRESS_LENGTH,
): string {
  const source = residentialAddress?.trim().replace(/\s+/g, ' ') ?? '';
  if (source.length === 0) {
    return '';
  }
  if (source.length <= limit) {
    return source;
  }

  const head = source.slice(0, limit + 1);

  // The last comma inside the limit, preferred because an address's own
  // punctuation marks where one part ends and the next begins.
  const comma = head.lastIndexOf(',');
  if (comma > 0) {
    return head.slice(0, comma).trim();
  }

  const space = head.lastIndexOf(' ');
  if (space > 0) {
    return head.slice(0, space).trim();
  }

  return source.slice(0, limit).trim();
}

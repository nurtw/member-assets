/**
 * What a sticker's code holds once a camera has read it (PRD Requirement
 * 9A.7, revision 1.12; `QUESTIONS.md` VEH-13 and VEH-31).
 *
 * A legacy sticker's QR code does not hold its barcode alone. It holds a web
 * address on the previous operator's own site that ends in the barcode, so a
 * camera reads an address where an officer would type a number.
 * `stickerCodeFromScan` reduces either to the code the System looks up.
 *
 * It does not look at whose address it is. A barcode proves nothing by itself
 * (PRD §26.4): the register and the stock decide whether it is held, never
 * the address around the digits.
 */

const WEB_ADDRESS = /^https?:\/\//i;
const TRAILING_DIGITS = /(\d{10,})\/?$/;

/**
 * The code to look up: the digits a legacy sticker's address ends in, or the
 * text as it stands (a typed number, or a signed sticker's payload).
 */
export function stickerCodeFromScan(scanned: string): string {
  const text = scanned.trim();
  if (!WEB_ADDRESS.test(text)) {
    return text;
  }
  const path = text.split(/[?#]/, 1)[0] ?? text;
  return TRAILING_DIGITS.exec(path)?.[1] ?? text;
}

/**
 * The shape of a legacy barcode: the digits of a millisecond timestamp. Those
 * on the imported register run from 11 to 14 digits; a digit of room is left
 * either side. Shape is all this says. Whether a barcode is held is the
 * register's and the stock's to answer.
 */
const LEGACY_BARCODE = /^\d{10,15}$/;

export function isLegacyBarcode(code: string): boolean {
  return LEGACY_BARCODE.test(code);
}

/** Three parts with a separator between: an identifier, a key, a signature. */
const SIGNED_PAYLOAD = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[0-9a-f]+$/i;

/**
 * Whether what was scanned could be a sticker's code at all. A camera pointed
 * at some other QR code reads a menu or a payment address; saying so on the
 * spot keeps it from being sent, and recorded, as a forged sticker.
 */
export function looksLikeStickerCode(code: string): boolean {
  return isLegacyBarcode(code) || SIGNED_PAYLOAD.test(code);
}

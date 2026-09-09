/**
 * Units and geometry for the print pipeline.
 *
 * PDF's native unit is the *point*, 1/72 inch. Every physical specification the
 * Union works from is in millimetres — a card is 85.60 × 53.98 mm by
 * ISO/IEC 7810 ID-1, not 242.6 × 153.0 pt. Converting at the boundary and
 * writing templates in millimetres keeps the code comparable to a ruler held
 * against the artifact, which is how a misplaced field actually gets found.
 */

/** Points per millimetre: 72 points per inch, 25.4 mm per inch. */
const POINTS_PER_MM = 72 / 25.4;

export function mm(millimetres: number): number {
  return millimetres * POINTS_PER_MM;
}

/** ISO/IEC 7810 ID-1 — the dimensions of a bank card, in millimetres. */
export const ID1_WIDTH_MM = 85.6;
export const ID1_HEIGHT_MM = 53.98;

/** ISO 216 A4, in millimetres. */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/**
 * A rectangle in millimetres, measured from the **top-left** corner.
 *
 * PDF's own origin is bottom-left, which is a persistent source of vertically
 * mirrored layouts. Templates are written top-down because that is how the card
 * is described, read, and photographed; {@link toPdfRect} performs the one
 * conversion, in one place.
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Converts a top-left box in millimetres to PDF points with a bottom-left origin. */
export function toPdfRect(
  box: Box,
  pageHeightMm: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: mm(box.x),
    y: mm(pageHeightMm - box.y - box.height),
    width: mm(box.width),
    height: mm(box.height),
  };
}

/**
 * The baseline for text placed at a top-left point.
 *
 * A PDF draws text from its baseline, not from the top of the glyph box. Placing
 * a label at "y = 12 mm" and passing that straight to `drawText` puts the
 * *bottom* of the text where its top was meant to be — a whole line-height out,
 * which looks like a rounding error and is not.
 */
export function baselineY(
  topMm: number,
  fontSizePt: number,
  pageHeightMm: number,
): number {
  return mm(pageHeightMm - topMm) - fontSizePt;
}

/** A colour as pdf-lib wants it: three components in 0…1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parses `#rrggbb`.
 *
 * Templates carry the hex values from `DESIGN.md` §2 verbatim so they can be
 * compared against that document by eye. A silently mis-parsed colour would
 * print, and printing is the step that cannot be undone — hence the throw.
 */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    throw new Error(`Not a six-digit hex colour: ${hex}`);
  }
  const value = Number.parseInt(match[1] as string, 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

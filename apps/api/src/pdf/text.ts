/**
 * Text measurement, fitting, and wrapping.
 *
 * `pdf-lib` draws text; it does not lay it out. That is the accepted cost of
 * keeping a browser out of the container (see
 * `plans/06-membership-card-issuance.md`, decision 1), and this module is where
 * the cost is paid — once, rather than in every template.
 */

import type { PDFFont } from 'pdf-lib';

/** The width of `text` at `size`, in points. */
export function widthOf(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

/**
 * The largest size at or below `preferred` at which `text` fits `maxWidth`.
 *
 * The proposal specifies card values are "formatted for card space". Shrinking
 * to fit is preferred to truncating: a name rendered a point smaller is still
 * the member's name, whereas `ONYEKACHUKWU ADAEZ…` on a membership card is a
 * defect somebody has to reissue.
 *
 * Below `minimum` the text is genuinely too long for the space, and the caller
 * is told rather than handed something illegible.
 */
export function fitSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferred: number,
  minimum = 5,
): number | null {
  for (let size = preferred; size >= minimum; size -= 0.25) {
    if (widthOf(font, text, size) <= maxWidth) {
      return size;
    }
  }
  return null;
}

/**
 * Shrinks to fit, and falls back to an ellipsis only when nothing fits.
 *
 * Returns the size actually used alongside the text actually drawn, so a caller
 * that cares — an audit note, a warning to the officer — can see that the value
 * was altered.
 */
export function fitOrTruncate(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferred: number,
  minimum = 5,
): { text: string; size: number; truncated: boolean } {
  const size = fitSize(font, text, maxWidth, preferred, minimum);
  if (size !== null) {
    return { text, size, truncated: false };
  }

  // Nothing fits even at the floor. Cut to what does, with an ellipsis so the
  // reader can see the value is incomplete rather than believing it is short.
  let cut = text;
  while (cut.length > 1 && widthOf(font, `${cut}…`, minimum) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return { text: `${cut}…`, size: minimum, truncated: true };
}

/**
 * Greedy word wrap.
 *
 * A word longer than the line is broken mid-word rather than allowed to
 * overflow — long unbroken strings do occur in addresses and reference numbers,
 * and overflowing text on a printed form silently overlaps whatever is beside it.
 */
export function wrap(
  font: PDFFont,
  text: string,
  maxWidth: number,
  size: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (widthOf(font, candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line.length > 0) {
        lines.push(line);
        line = '';
      }

      if (widthOf(font, word, size) <= maxWidth) {
        line = word;
        continue;
      }

      // The word alone is wider than the line. Break it.
      let remainder = word;
      while (widthOf(font, remainder, size) > maxWidth && remainder.length > 1) {
        let take = remainder.length;
        while (take > 1 && widthOf(font, remainder.slice(0, take), size) > maxWidth) {
          take -= 1;
        }
        lines.push(remainder.slice(0, take));
        remainder = remainder.slice(take);
      }
      line = remainder;
    }

    if (line.length > 0) {
      lines.push(line);
    }
  }

  return lines;
}

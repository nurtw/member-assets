import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ID1_HEIGHT_MM,
  baselineY,
  hexToRgb,
  mm,
  toPdfRect,
} from './geometry.js';
import { fitOrTruncate, fitSize, widthOf, wrap } from './text.js';

describe('mm', () => {
  it('converts millimetres to points at 72 per inch', () => {
    expect(mm(25.4)).toBeCloseTo(72, 6);
    expect(mm(0)).toBe(0);
  });

  it('gives the ID-1 card its documented size in points', () => {
    // 85.60 × 53.98 mm — the dimensions of a bank card.
    expect(mm(85.6)).toBeCloseTo(242.65, 1);
    expect(mm(53.98)).toBeCloseTo(153.01, 1);
  });
});

describe('toPdfRect', () => {
  it('flips a top-left box onto PDF’s bottom-left origin', () => {
    // The persistent source of vertically mirrored layouts: templates are
    // written top-down because that is how a card is described and read.
    const rect = toPdfRect({ x: 10, y: 10, width: 20, height: 5 }, 100);

    expect(rect.x).toBeCloseTo(mm(10), 6);
    // 100 - 10 - 5 = 85 mm from the bottom.
    expect(rect.y).toBeCloseTo(mm(85), 6);
    expect(rect.width).toBeCloseTo(mm(20), 6);
    expect(rect.height).toBeCloseTo(mm(5), 6);
  });

  it('puts a box at the top of the page just below the top edge', () => {
    const rect = toPdfRect({ x: 0, y: 0, width: 10, height: 10 }, 100);
    expect(rect.y).toBeCloseTo(mm(90), 6);
  });
});

describe('baselineY', () => {
  it('places the baseline a full font size below the requested top', () => {
    // A PDF draws text from its baseline, not the top of the glyph box.
    // Passing the top straight to drawText puts the text a line-height out.
    const top = baselineY(10, 12, ID1_HEIGHT_MM);
    expect(top).toBeCloseTo(mm(ID1_HEIGHT_MM - 10) - 12, 6);
  });
});

describe('hexToRgb', () => {
  it('parses the palette values from DESIGN.md §2', () => {
    expect(hexToRgb('#008751')).toEqual({
      r: 0,
      g: 0x87 / 255,
      b: 0x51 / 255,
    });
  });

  it('accepts the value with or without a leading hash', () => {
    expect(hexToRgb('C1121F')).toEqual(hexToRgb('#C1121F'));
  });

  it('throws rather than silently mis-parsing', () => {
    // A mis-parsed colour would print, and printing is the step that cannot be
    // undone.
    for (const bad of ['#fff', 'rgb(0,0,0)', '', '#12345g']) {
      expect(() => hexToRgb(bad), bad).toThrow(/hex colour/);
    }
  });
});

describe('text fitting', () => {
  let font: Awaited<ReturnType<PDFDocument['embedFont']>>;

  beforeAll(async () => {
    const document = await PDFDocument.create();
    font = await document.embedFont(StandardFonts.Helvetica);
  });

  it('returns the preferred size when the text already fits', () => {
    expect(fitSize(font, 'CHIDI OKEKE', 500, 10)).toBe(10);
  });

  it('shrinks until the text fits', () => {
    const name = 'A REASONABLY LONG MEMBER NAME';
    expect(widthOf(font, name, 12)).toBeGreaterThan(120);

    const size = fitSize(font, name, 120, 12);
    expect(size).not.toBeNull();
    expect(size!).toBeLessThan(12);
    expect(widthOf(font, name, size!)).toBeLessThanOrEqual(120);
  });

  it('reports failure rather than returning an illegible size', () => {
    expect(fitSize(font, 'A VERY LONG NAME INDEED', 4, 12)).toBeNull();
  });

  it('prefers shrinking to truncating', () => {
    // A name rendered a point smaller is still the member's name. A truncated
    // one on a membership card is a defect somebody has to reissue.
    const result = fitOrTruncate(font, 'ONYEKACHUKWU ADAEZE', 70, 12);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('ONYEKACHUKWU ADAEZE');
  });

  it('marks a value it had to cut, and shows the reader it is incomplete', () => {
    const result = fitOrTruncate(font, 'ONYEKACHUKWU ADAEZE', 14, 12, 5);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith('…')).toBe(true);
    expect(widthOf(font, result.text, result.size)).toBeLessThanOrEqual(14);
  });
});

describe('wrap', () => {
  let font: Awaited<ReturnType<PDFDocument['embedFont']>>;

  beforeAll(async () => {
    const document = await PDFDocument.create();
    font = await document.embedFont(StandardFonts.Helvetica);
  });

  const fits = (lines: string[], width: number, size: number) =>
    lines.every((line) => widthOf(font, line, size) <= width);

  it('keeps a short line on one line', () => {
    expect(wrap(font, 'Awka, Anambra', 200, 9)).toEqual(['Awka, Anambra']);
  });

  it('breaks on words and never exceeds the width', () => {
    const lines = wrap(
      font,
      '14 Zik Avenue, Ifite Awka, Awka South Local Government Area, Anambra State',
      80,
      9,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(fits(lines, 80, 9)).toBe(true);
  });

  it('breaks a word that is itself wider than the line', () => {
    // Long unbroken strings occur in addresses and reference numbers, and
    // overflowing text on a printed form silently overlaps whatever is beside it.
    const lines = wrap(font, 'A'.repeat(200), 40, 9);
    expect(lines.length).toBeGreaterThan(1);
    expect(fits(lines, 40, 9)).toBe(true);
    expect(lines.join('')).toBe('A'.repeat(200));
  });

  it('preserves explicit line breaks', () => {
    expect(wrap(font, 'One\nTwo', 200, 9)).toEqual(['One', 'Two']);
  });

  it('loses no words', () => {
    const source =
      'Chukwuemeka Okonkwo, 14 Zik Avenue, Ifite Awka, Anambra State, Nigeria';
    const lines = wrap(font, source, 70, 9);
    expect(lines.join(' ').split(/\s+/)).toEqual(source.split(/\s+/));
  });
});

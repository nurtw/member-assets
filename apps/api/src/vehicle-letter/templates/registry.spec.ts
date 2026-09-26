import { NotFoundException } from '@nestjs/common';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { EMBLEM_PNG } from '../../pdf/emblem.js';
import { A4_HEIGHT_MM, A4_WIDTH_MM, mm } from '../../pdf/geometry.js';
import {
  CURRENT_LETTER_TEMPLATE_VERSION,
  letterTemplateFor,
} from './registry.js';
import type { LetterRenderInput } from './template.js';
import { LETTER_TITLE, NOT_RECORDED } from './v1.js';

/**
 * Every letter template version ever issued against. **Add to this list when a
 * template is added. Never remove from it** — a letter records its version, and
 * without the module it can never be downloaded again.
 */
const VERSIONS_EVER_ISSUED = ['v1'] as const;

// Synthetic values only (CLAUDE.md): never rows from data/.
const BASE: LetterRenderInput = {
  letterReference: 'ABCD-EFGH-JKLM-N',
  issuedAt: new Date('2026-10-01T09:00:00Z'),
  plate: 'AWK-123-XY',
  category: 'Shuttle bus',
  make: 'Toyota',
  model: 'Hiace',
  colour: 'White',
  stickerNumber: '1600000000000',
  memberName: 'Chidi Okeke',
  membershipNumber: 'PQRS-TUVW-XYZA-B',
  unit: 'Awka Unit',
  branch: 'Awka Branch',
  chairman: null,
  secretary: null,
};

/** The text drawn on the first page, decoded from its content stream. */
async function drawnText(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes);
  const contents = document.getPage(0).node.Contents();
  const streams =
    contents instanceof PDFRawStream
      ? [contents]
      : ((contents as unknown as { asArray(): unknown[] })?.asArray?.() ?? []).map((ref) =>
          document.context.lookup(ref as never),
        );
  const raw = streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'))
    .join('\n');
  // Standard fonts are drawn as hex strings: <48656C6C6F> Tj.
  return [...raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map((match) => Buffer.from(match[1]!, 'hex').toString('latin1'))
    .join('\n');
}

/** How many images the first page draws. */
async function imageCount(bytes: Uint8Array): Promise<number> {
  const document = await PDFDocument.load(bytes);
  const resources = document.getPage(0).node.Resources();
  const xObjects = resources?.lookup(PDFName.of('XObject'), PDFDict);
  return xObjects ? xObjects.keys().length : 0;
}

describe('the letter template registry', () => {
  it('still registers every version ever issued against', () => {
    for (const version of VERSIONS_EVER_ISSUED) {
      expect(() => letterTemplateFor(version), version).not.toThrow();
    }
  });

  it('refuses an unknown version rather than falling back to the current one', () => {
    expect(() => letterTemplateFor('v99-nonexistent')).toThrow(NotFoundException);
  });

  it('issues new letters against a registered version', () => {
    expect(VERSIONS_EVER_ISSUED).toContain(CURRENT_LETTER_TEMPLATE_VERSION);
  });
});

describe('letter template v1 (Requirement 9A.6)', () => {
  const template = letterTemplateFor('v1');

  it('is one A4 page', async () => {
    const document = await PDFDocument.load(await template.render(BASE));
    expect(document.getPageCount()).toBe(1);
    const page = document.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mm(A4_WIDTH_MM), 1);
    expect(page.getHeight()).toBeCloseTo(mm(A4_HEIGHT_MM), 1);
  });

  it('prints the settled content and the not-evidence statement', async () => {
    const drawn = await drawnText(await template.render(BASE));
    for (const expected of [
      'NATIONAL UNION OF ROAD TRANSPORT WORKERS',
      'Anambra State Council',
      LETTER_TITLE,
      'ABCD-EFGH-JKLM-N',
      '1 October 2026',
      'AWK-123-XY',
      'Shuttle bus',
      'Toyota',
      'Hiace',
      'White',
      '1600000000000',
      'Chidi Okeke',
      'PQRS-TUVW-XYZA-B',
      'Awka Unit',
      'Awka Branch',
      'State Chairman',
      'Secretary',
    ]) {
      expect(drawn, expected).toContain(expected);
    }
    // Requirement 11.1, whichever line the wrap breaks it onto.
    const flat = drawn.replace(/\n/g, ' ');
    expect(flat).toContain('not evidence of legal ownership, roadworthiness, licensing, or');
    expect(flat).toContain('insurance');
    expect(flat.toLowerCase()).not.toContain('certif');
  });

  it('prints "Not recorded" for a missing value, never a guess', async () => {
    const drawn = await drawnText(
      await template.render({ ...BASE, memberName: null, membershipNumber: null, unit: null }),
    );
    expect(drawn.split('\n').filter((line) => line === NOT_RECORDED)).toHaveLength(3);
    expect(drawn).not.toContain('Chidi Okeke');
  });

  it('carries no QR code: the emblem is its only image while no signature is registered', async () => {
    expect(await imageCount(await template.render(BASE))).toBe(1);
  });

  it('draws a registered signature above its line, and names the officer', async () => {
    const bytes = await template.render({
      ...BASE,
      chairman: {
        officerName: 'A. Officer',
        officerTitle: 'State Chairman',
        image: { bytes: EMBLEM_PNG, contentType: 'image/png' },
      },
    });
    expect(await imageCount(bytes)).toBe(2);
    expect(await drawnText(bytes)).toContain('A. Officer');
  });

  it('survives characters the standard font cannot encode', async () => {
    const drawn = await drawnText(
      await template.render({ ...BASE, memberName: 'Ọnwụ Chịnedụ' }),
    );
    expect(drawn).toContain('Onwu Chinedu');
  });

  it('carries no member or plate in the document metadata', async () => {
    const document = await PDFDocument.load(await template.render(BASE));
    expect(document.getTitle()).toBe('NURTW vehicle letter');
    expect(document.getAuthor()).toBeUndefined();
  });
});

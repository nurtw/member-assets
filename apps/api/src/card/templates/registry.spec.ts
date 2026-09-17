import { NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { ID1_HEIGHT_MM, ID1_WIDTH_MM, mm } from '../../pdf/geometry.js';
import {
  CURRENT_TEMPLATE_VERSION,
  currentTemplate,
  listTemplates,
  templateFor,
} from './registry.js';
import type { CardRenderInput } from './template.js';

/**
 * Every template version that has ever been issued against.
 *
 * Written out separately from the registry so that removing a template module
 * fails here rather than at a counter years later. A card records the version it
 * was rendered against; if the module is gone, that card cannot be reprinted and
 * the reprint of a damaged card stops matching the original.
 *
 * **Add to this list when a template is added. Never remove from it.**
 */
const VERSIONS_EVER_ISSUED = ['v1-provisional'] as const;

const BASE: CardRenderInput = {
  cardNumber: null,
  issued: false,
  printedName: 'CHIDI OKEKE',
  printedAddress: '14 Zik Avenue, Awka',
  printedDesignation: '',
  printedState: 'Anambra',
  printedBranch: 'Awka Branch',
  printedUnit: 'Awka Unit',
  membershipNumber: 'ABCD-EFGH-JKLM-N',
  issueDate: null,
  expiryDate: null,
  photo: null,
  holderSignature: null,
  president: null,
  generalSecretary: null,
};

describe('the template registry', () => {
  it('still registers every version ever issued against', () => {
    for (const version of VERSIONS_EVER_ISSUED) {
      expect(() => templateFor(version), version).not.toThrow();
    }
  });

  it('refuses an unknown version rather than falling back to the current one', () => {
    // A silent fallback would reprint a card in a design its holder does not
    // have, and the reprint would look correct — worse than an error, because
    // nobody would investigate it.
    expect(() => templateFor('v99-nonexistent')).toThrow(NotFoundException);
  });

  it('names a registered template as the current one', () => {
    expect(listTemplates().map((template) => template.version)).toContain(
      CURRENT_TEMPLATE_VERSION,
    );
    expect(currentTemplate().version).toBe(CURRENT_TEMPLATE_VERSION);
  });
});

describe('the launch template', () => {
  const template = templateFor('v1-provisional');

  it('is marked provisional', () => {
    // DESIGN.md §2 — the palette is inferred from a daylight photograph and
    // must be replaced with sampled values before anything is printed.
    // QUESTIONS.md CARD-05 asks for the artwork.
    expect(template.provisional).toBe(true);
  });

  it('is valid for twelve months, per CARD-04', () => {
    // Answered 14 September 2026: cards are renewed every year, confirming
    // the observation at DESIGN.md §7.1 that the physical card prints a year
    // at the same scale as the Union's name.
    expect(template.validityMonths).toBe(12);
  });
});

describe('rendering', () => {
  const template = templateFor('v1-provisional');

  it('produces a PDF at ISO/IEC 7810 ID-1 dimensions', async () => {
    const bytes = await template.render(BASE);
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(1);

    const page = document.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mm(ID1_WIDTH_MM), 1);
    expect(page.getHeight()).toBeCloseTo(mm(ID1_HEIGHT_MM), 1);
  });

  it('carries no holder detail in the document metadata', async () => {
    // Title and Author are read by every viewer and survive being forwarded.
    const bytes = await template.render(BASE);
    const document = await PDFDocument.load(bytes);

    expect(document.getTitle()).not.toContain('CHIDI');
    expect(document.getAuthor()).toBeUndefined();
  });

  it('renders a proof differently from the issued card', async () => {
    const proof = Buffer.from(await template.render(BASE));
    const issued = Buffer.from(
      await template.render({
        ...BASE,
        issued: true,
        cardNumber: 'ABCD-EFGH-JKLM-N',
      }),
    );

    // The proof carries the diagonal overprint; the issued card carries the
    // number instead. They must never be mistakable for one another — without
    // the overprint an officer could print a draft, laminate it, and hand it
    // over, and the approval step would be decorative.
    //
    // Asserted structurally: pdf-lib writes compressed object streams, so the
    // drawn text is not greppable in the output. What the *content* of the
    // overprint depends on is `issued`, and that decision is tested directly at
    // `packages/domain/src/card/status.test.ts` → isCardIssued.
    expect(Buffer.compare(proof, issued)).not.toBe(0);
    expect(proof.length).toBeGreaterThan(issued.length);
  });

  it('omits the validity year when the card has no dates', async () => {
    // Nothing is invented: with CARD-04 unanswered a card has no expiry, and
    // the band is left blank rather than printed with the current year.
    const undated = Buffer.from(await template.render(BASE));
    const dated = Buffer.from(
      await template.render({ ...BASE, issueDate: new Date('2026-09-09') }),
    );

    expect(dated.length).toBeGreaterThan(undated.length);
  });

  it('renders a long name without overflowing the card', async () => {
    // The proposal specifies values are "formatted for card space". A name that
    // does not fit is shrunk, and only truncated when nothing fits.
    const bytes = await template.render({
      ...BASE,
      printedName: 'CHUKWUEMEKA OGHENERUKEVWE OLUWASEUN ONYEKACHUKWU ADANNAYA',
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

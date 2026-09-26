/**
 * Vehicle letter, template v1 (PRD Requirement 9A.6, `QUESTIONS.md` VEH-19).
 *
 * One A4 page: the Union's name and emblem, the reference and date, the
 * vehicle's details, the Requirement 11.1 statement, and two signature lines.
 *
 * What it must not be, as much as what it is:
 *
 * - **Not a certificate.** It confirms the vehicle is recorded with the Union
 *   and says in terms that it is not evidence of ownership, roadworthiness,
 *   licensing, or insurance (PRD §4, Requirement 11.1).
 * - **No QR code.** A QR carrying the sticker's payload on paper could be
 *   photocopied onto a counterfeit sticker, defeating the substrate control of
 *   PRD §26.4. The reference is looked up internally instead.
 * - **No guess.** A value the record lacks prints "Not recorded".
 *
 * Laid out in millimetres from the top-left, like every template here;
 * `pdf/geometry.ts` does the one conversion to PDF points.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { RENDERABLE_IMAGE_TYPES, type EmbeddableImage } from '../../card/templates/template.js';
import { EMBLEM_PNG } from '../../pdf/emblem.js';
import { A4_HEIGHT_MM, A4_WIDTH_MM, baselineY, hexToRgb, mm } from '../../pdf/geometry.js';
import { encodable, fitOrTruncate, wrap } from '../../pdf/text.js';
import type { LetterRenderInput, LetterSignatory, LetterTemplate } from './template.js';

const INK = hexToRgb('#111111');
const MUTED = hexToRgb('#5B6470');
const GREEN = hexToRgb('#008751');
const RULE = hexToRgb('#B7BDC6');

const MARGIN = 20;
const CONTENT_WIDTH = A4_WIDTH_MM - 2 * MARGIN;
const LABEL_X = MARGIN + 4;
const VALUE_X = MARGIN + 58;

/** Copy fixed by VEH-19 and Requirement 11.1. Exported for the tests. */
export const LETTER_TITLE = 'CONFIRMATION OF VEHICLE RECORD';
export const NOT_EVIDENCE_STATEMENT =
  'This letter is not evidence of legal ownership, roadworthiness, licensing, or insurance. ' +
  'It confirms only that the vehicle described above is recorded with the Union.';
export const NOT_RECORDED = 'Not recorded';

/** The captions CARD-07 settled, used while no signature is registered. */
const DEFAULT_TITLES = { chairman: 'State Chairman', secretary: 'Secretary' } as const;

type Colour = { r: number; g: number; b: number };

function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
}

async function embedImage(document: PDFDocument, image: EmbeddableImage | null) {
  if (!image || !RENDERABLE_IMAGE_TYPES.includes(image.contentType)) {
    return null;
  }
  return image.contentType === 'image/png'
    ? document.embedPng(image.bytes)
    : document.embedJpg(image.bytes);
}

export const v1: LetterTemplate = {
  version: 'v1',
  label: 'Vehicle letter — first issue',

  async render(input: LetterRenderInput): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    // No member or plate in the metadata: a PDF's Title is read by every viewer
    // and survives being forwarded.
    document.setTitle('NURTW vehicle letter');
    document.setProducer('NURTW Membership and Vehicle Verification System');
    document.setCreator('NURTW Membership and Vehicle Verification System');

    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const italic = await document.embedFont(StandardFonts.HelveticaOblique);
    const page = document.addPage([mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)]);

    const text = (
      value: string,
      options: { x: number; top: number; size: number; font?: PDFFont; colour?: Colour },
    ) => {
      const font = options.font ?? regular;
      const colour = options.colour ?? INK;
      page.drawText(encodable(font, value), {
        x: mm(options.x),
        y: baselineY(options.top, options.size, A4_HEIGHT_MM),
        size: options.size,
        font,
        color: rgb(colour.r, colour.g, colour.b),
      });
    };

    const rule = (x: number, top: number, width: number, thickness = 0.4) => {
      page.drawLine({
        start: { x: mm(x), y: mm(A4_HEIGHT_MM - top) },
        end: { x: mm(x + width), y: mm(A4_HEIGHT_MM - top) },
        thickness,
        color: rgb(RULE.r, RULE.g, RULE.b),
      });
    };

    const paragraph = (value: string, top: number, size: number, font = regular): number => {
      let cursor = top;
      for (const line of wrap(font, encodable(font, value), mm(CONTENT_WIDTH), size)) {
        text(line, { x: MARGIN, top: cursor, size, font });
        cursor += size * 0.5;
      }
      return cursor;
    };

    // --- Masthead -------------------------------------------------------------
    const emblem = await document.embedPng(EMBLEM_PNG);
    const emblemBox = 24;
    const scale = Math.min(mm(emblemBox) / emblem.width, mm(emblemBox) / emblem.height);
    page.drawImage(emblem, {
      x: mm(MARGIN),
      y: mm(A4_HEIGHT_MM - 16) - emblem.height * scale,
      width: emblem.width * scale,
      height: emblem.height * scale,
    });
    text('NATIONAL UNION OF ROAD TRANSPORT WORKERS', {
      x: MARGIN + 30,
      top: 20,
      size: 13.5,
      font: bold,
      colour: GREEN,
    });
    text('Anambra State Council', { x: MARGIN + 30, top: 28, size: 11 });
    rule(MARGIN, 44, CONTENT_WIDTH, 0.8);

    // --- Reference and date ---------------------------------------------------
    text('Reference', { x: MARGIN, top: 50, size: 8, font: bold, colour: MUTED });
    text(input.letterReference, { x: MARGIN + 22, top: 50, size: 10, font: bold });
    text('Date', { x: MARGIN, top: 56, size: 8, font: bold, colour: MUTED });
    text(longDate(input.issuedAt), { x: MARGIN + 22, top: 56, size: 10 });

    // --- Title and body -------------------------------------------------------
    text(LETTER_TITLE, { x: MARGIN, top: 70, size: 13, font: bold, colour: GREEN });
    text('To whom it may concern,', { x: MARGIN, top: 81, size: 10.5 });
    let cursor = paragraph(
      'This is to confirm that the vehicle described below is recorded with the National Union ' +
        `of Road Transport Workers, Anambra State Council, and carries the Union sticker numbered ${input.stickerNumber}.`,
      89,
      10.5,
    );

    // --- Details --------------------------------------------------------------
    const details: [string, string | null][] = [
      ['Plate number', input.plate],
      ['Vehicle type', input.category],
      ['Make', input.make],
      ['Model', input.model],
      ['Colour', input.colour],
      ['Sticker number', input.stickerNumber],
      ['Member (driver)', input.memberName],
      ['Membership number', input.membershipNumber],
      ['Unit', input.unit],
      ['Branch', input.branch],
    ];
    cursor += 5;
    rule(MARGIN, cursor, CONTENT_WIDTH);
    for (const [label, value] of details) {
      cursor += 2.4;
      text(label, { x: LABEL_X, top: cursor + 0.6, size: 9, font: bold, colour: MUTED });
      const present = value !== null && value.trim().length > 0;
      const font = present ? regular : italic;
      const fitted = fitOrTruncate(
        font,
        encodable(font, present ? value.trim() : NOT_RECORDED),
        mm(A4_WIDTH_MM - MARGIN - VALUE_X),
        10.5,
        7,
      );
      text(fitted.text, {
        x: VALUE_X,
        top: cursor,
        size: fitted.size,
        font,
        colour: present ? INK : MUTED,
      });
      cursor += 5.4;
      rule(MARGIN, cursor, CONTENT_WIDTH, 0.25);
    }

    // --- The Requirement 11.1 statement ---------------------------------------
    cursor = paragraph(NOT_EVIDENCE_STATEMENT, cursor + 7, 10, bold);
    cursor = paragraph(
      'The reference above can be confirmed with the Union. This letter was produced from the ' +
        'record held in the NURTW Membership and Vehicle Verification System on the date shown.',
      cursor + 3,
      9.5,
    );

    // --- Signatures -----------------------------------------------------------
    //
    // Fixed near the foot of the page rather than following the text, so the
    // two lines sit in the same place on every letter.
    const signatureRuleTop = 252;
    const columnWidth = (CONTENT_WIDTH - 20) / 2;
    const signatories: [LetterSignatory | null, string][] = [
      [input.chairman, DEFAULT_TITLES.chairman],
      [input.secretary, DEFAULT_TITLES.secretary],
    ];
    for (const [index, [signatory, defaultTitle]] of signatories.entries()) {
      const x = MARGIN + index * (columnWidth + 20);
      await drawSignature(document, page, signatory, x, signatureRuleTop, columnWidth);
      rule(x, signatureRuleTop, columnWidth, 0.6);
      if (signatory) {
        text(signatory.officerName, {
          x,
          top: signatureRuleTop + 2,
          size: 9.5,
          font: bold,
        });
      }
      text(signatory?.officerTitle ?? defaultTitle, {
        x,
        top: signatureRuleTop + (signatory ? 6.5 : 2),
        size: 9,
        colour: MUTED,
      });
    }

    // --- Footer ---------------------------------------------------------------
    rule(MARGIN, 280, CONTENT_WIDTH);
    text(
      `NURTW Membership and Vehicle Verification System · Letter template ${v1.version} · Reference ${input.letterReference}`,
      { x: MARGIN, top: 282, size: 7, colour: MUTED },
    );

    return document.save();
  },
};

/** The signature image, fitted above its line, or nothing: the line prints blank. */
async function drawSignature(
  document: PDFDocument,
  page: PDFPage,
  signatory: LetterSignatory | null,
  x: number,
  ruleTop: number,
  width: number,
): Promise<void> {
  const image = await embedImage(document, signatory?.image ?? null);
  if (!image) {
    return;
  }
  const boxHeight = 14;
  const scale = Math.min(mm(width) / image.width, mm(boxHeight) / image.height);
  page.drawImage(image, {
    x: mm(x),
    y: mm(A4_HEIGHT_MM - ruleTop) + mm(0.5),
    width: image.width * scale,
    height: image.height * scale,
  });
}

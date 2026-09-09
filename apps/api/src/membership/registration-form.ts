/**
 * The print-ready registration form, for wet signature.
 *
 * PRD §23.16 determined a **hybrid**: data captured digitally, with a
 * print-ready form produced for physical signature where the Union's process
 * requires it. Item 05 built the digital capture and deferred this deliberately,
 * because it needs the PDF pipeline that item 06 builds for cards. One pipeline,
 * two documents.
 *
 * **This document carries registration data, not card-display data.** Next of
 * kin, guarantor, telephone, and residential address are all on it — that is
 * what the form is. It is therefore gated by `member_sensitive.read` rather than
 * `card.read`, and it is the one place in the print pipeline where Decision 10.1
 * data legitimately appears.
 *
 * The layout follows the Union's paper form
 * (`docs/National_Union_of_Road_Transport_Workers_(NURTW).md`) section by
 * section, so an officer holding both can check one against the other. Where a
 * field's printed wording is not yet confirmed — MEM-08, MEM-09, MEM-10 — the
 * form prints what the specification records and the question stays open.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  baselineY,
  hexToRgb,
  mm,
} from '../pdf/geometry.js';
import { wrap } from '../pdf/text.js';

const INK = hexToRgb('#111111');
const MUTED = hexToRgb('#5B6470');
const GREEN = hexToRgb('#008751');
const RULE = hexToRgb('#B7BDC6');

const MARGIN = 18;
const CONTENT_WIDTH = A4_WIDTH_MM - 2 * MARGIN;

/** One labelled value on the form. */
export interface FormField {
  label: string;
  value: string | null;
  /** Fields the applicant completes by hand, printed as a rule rather than text. */
  blank?: boolean;
  /** Half-width, so two sit side by side. */
  half?: boolean;
}

export interface FormSection {
  title: string;
  note?: string;
  fields: readonly FormField[];
}

export interface RegistrationFormInput {
  applicationNumber: string;
  membershipNumber: string | null;
  status: string;
  sections: readonly FormSection[];
  /** Captions for the wet-signature lines at the foot of the form. */
  signatureLines: readonly string[];
}

/**
 * Renders the form.
 *
 * Paginates rather than overflowing: a guarantor section pushed off the bottom
 * of a page is a section nobody signs.
 */
export async function renderRegistrationForm(
  input: RegistrationFormInput,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();

  // No holder name in the metadata. A PDF's Title and Author are read by every
  // viewer and survive being forwarded.
  document.setTitle('NURTW membership registration form');
  document.setProducer('NURTW Membership and Vehicle Verification System');
  document.setCreator('NURTW Membership and Vehicle Verification System');

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const colour = (c: { r: number; g: number; b: number }) => rgb(c.r, c.g, c.b);

  let page = document.addPage([mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)]);
  let cursor = MARGIN;

  const text = (
    value: string,
    options: {
      x: number;
      top: number;
      size: number;
      font?: typeof regular;
      colour?: { r: number; g: number; b: number };
    },
  ) => {
    page.drawText(value, {
      x: mm(options.x),
      y: baselineY(options.top, options.size, A4_HEIGHT_MM),
      size: options.size,
      font: options.font ?? regular,
      color: colour(options.colour ?? INK),
    });
  };

  const rule = (x: number, top: number, width: number) => {
    page.drawLine({
      start: { x: mm(x), y: mm(A4_HEIGHT_MM - top) },
      end: { x: mm(x + width), y: mm(A4_HEIGHT_MM - top) },
      thickness: 0.4,
      color: colour(RULE),
    });
  };

  /** Starts a new page when `needed` millimetres will not fit. */
  const ensure = (needed: number) => {
    if (cursor + needed <= A4_HEIGHT_MM - MARGIN) {
      return;
    }
    page = document.addPage([mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)]);
    cursor = MARGIN;
  };

  // --- Masthead -------------------------------------------------------------
  text('NATIONAL UNION OF ROAD TRANSPORT WORKERS', {
    x: MARGIN,
    top: cursor,
    size: 13,
    font: bold,
    colour: GREEN,
  });
  cursor += 6;
  text('Membership · Registration · Guarantorship Form', {
    x: MARGIN,
    top: cursor,
    size: 9.5,
    colour: MUTED,
  });
  cursor += 5;
  text(
    `Application ${input.applicationNumber}` +
      (input.membershipNumber ? `   ·   Member ${input.membershipNumber}` : '') +
      `   ·   ${input.status}`,
    { x: MARGIN, top: cursor, size: 8.5, font: bold, colour: MUTED },
  );
  cursor += 4;
  rule(MARGIN, cursor, CONTENT_WIDTH);
  cursor += 7;

  // --- Sections -------------------------------------------------------------
  for (const section of input.sections) {
    ensure(22);

    text(section.title.toUpperCase(), {
      x: MARGIN,
      top: cursor,
      size: 9,
      font: bold,
      colour: GREEN,
    });
    cursor += 5;

    if (section.note) {
      for (const line of wrap(regular, section.note, mm(CONTENT_WIDTH), 7.5)) {
        text(line, { x: MARGIN, top: cursor, size: 7.5, colour: MUTED });
        cursor += 3.4;
      }
      cursor += 1;
    }

    let column = 0;
    for (const field of section.fields) {
      const width = field.half ? CONTENT_WIDTH / 2 - 3 : CONTENT_WIDTH;
      const x = MARGIN + (field.half && column === 1 ? CONTENT_WIDTH / 2 + 3 : 0);

      if (!field.half || column === 0) {
        ensure(12);
      }

      text(field.label, { x, top: cursor, size: 7, font: bold, colour: MUTED });

      const value = field.value?.trim() ?? '';
      if (field.blank || value.length === 0) {
        // A rule, not an empty string: the officer or applicant writes here, and
        // a blank space with no line is a field people miss.
        rule(x, cursor + 7.5, width);
      } else {
        const lines = wrap(regular, value, mm(width), 9).slice(0, 2);
        lines.forEach((line, index) => {
          text(line, { x, top: cursor + 3.4 + index * 4, size: 9 });
        });
      }

      if (field.half && column === 0) {
        column = 1;
        continue;
      }
      column = 0;
      cursor += 11;
    }

    if (column === 1) {
      cursor += 11;
    }
    cursor += 3;
  }

  // --- Wet signatures -------------------------------------------------------
  //
  // The point of the document. Printed last and kept together on one page, so
  // that nobody signs a form whose declarations are on a sheet they did not see.
  ensure(34);
  cursor += 4;
  rule(MARGIN, cursor, CONTENT_WIDTH);
  cursor += 6;

  text('SIGNATURES', {
    x: MARGIN,
    top: cursor,
    size: 9,
    font: bold,
    colour: GREEN,
  });
  cursor += 8;

  const columns = Math.min(input.signatureLines.length, 3);
  const columnWidth = columns > 0 ? CONTENT_WIDTH / columns - 4 : CONTENT_WIDTH;

  input.signatureLines.forEach((caption, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN + column * (columnWidth + 6);
    const top = cursor + row * 20;

    rule(x, top + 10, columnWidth);
    text(caption, { x, top: top + 11.5, size: 7.5, colour: MUTED });
    text('Date', { x, top: top + 15.5, size: 7, font: bold, colour: MUTED });
    rule(x + 8, top + 18, columnWidth - 8);
  });

  cursor += Math.ceil(input.signatureLines.length / columns) * 20 + 6;

  ensure(10);
  for (const line of wrap(
    regular,
    'This printed form is produced from the record held in the NURTW Membership ' +
      'and Vehicle Verification System. Where the printed detail differs from what ' +
      'the applicant states, the System record is corrected — the form is not amended ' +
      'by hand.',
    mm(CONTENT_WIDTH),
    7,
  )) {
    text(line, { x: MARGIN, top: cursor, size: 7, colour: MUTED });
    cursor += 3.2;
  }

  return document.save();
}

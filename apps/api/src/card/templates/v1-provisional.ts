/**
 * Card template `v1-provisional`.
 *
 * The Union's card, reconstructed from the photograph supplied on 9 September
 * 2026 and described at `DESIGN.md` §7. Geometry is ISO/IEC 7810 ID-1, which is
 * the one thing here that is certain.
 *
 * **This template is provisional and says so on its face.** `DESIGN.md` §2:
 * the palette is inferred from a daylight photograph, which shifts colour
 * substantially, and must be replaced by values sampled from the Union's
 * official artwork before anything is printed. QUESTIONS.md **CARD-05** asks
 * for that artwork, **CARD-06** for the motto wording in each position, and
 * **CARD-07** for the officers' signature images.
 *
 * Removing the provisional mark is therefore a deliberate act taken when the
 * artwork arrives — as a new version, `v2`, so that anything printed in the
 * meantime remains explicable.
 *
 * **One thing is still absent rather than approximated:** the Nigerian coat of
 * arms. It is on the physical card, upper right. It cannot be reconstructed
 * from a photograph at print resolution, and a hand-drawn approximation is
 * worse than a reserved space, because it looks finished. The Union emblem
 * itself is no longer absent — see `EMBLEM_BYTES` below.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

import {
  ID1_HEIGHT_MM,
  ID1_WIDTH_MM,
  baselineY,
  hexToRgb,
  mm,
} from '../../pdf/geometry.js';
import { fitOrTruncate, widthOf, wrap } from '../../pdf/text.js';
import {
  RENDERABLE_IMAGE_TYPES,
  type CardRenderInput,
  type CardTemplate,
  type EmbeddableImage,
} from './template.js';

/**
 * The palette, verbatim from `DESIGN.md` §2 so the two can be compared by eye.
 *
 * Provisional. See the module comment.
 */
const PALETTE = {
  green: hexToRgb('#008751'),
  greenDeep: hexToRgb('#00603A'),
  red: hexToRgb('#C1121F'),
  navy: hexToRgb('#1B2A6B'),
  white: hexToRgb('#FFFFFF'),
  rule: hexToRgb('#9AA0A6'),
} as const;

/**
 * The strings printed on the card.
 *
 * Held here as configuration rather than inline in the drawing code.
 *
 * **CARD-06, answered 17 September 2026: "Safety and Unity."** The source
 * photograph showed the wording two ways on one physical card ("Safety &
 * Unity" on the emblem, "Unity & Safety" beneath it); the Union has now
 * confirmed the single official wording, printed consistently here in both
 * places.
 */
const STRINGS = {
  organisation: 'NATIONAL UNION OF ROAD TRANSPORT WORKERS',
  headquarters: 'NATIONAL HEADQUARTERS, ABUJA',
  mottoLabel: 'MOTTO:',
  mottoValue: 'SAFETY AND UNITY',
  banner: 'MEMBERSHIP CARD',
  bandWord: 'NURTW',
  provisional: 'PROVISIONAL TEMPLATE — ARTWORK PENDING',
  proof: 'PROOF — NOT ISSUED',
} as const;

/** Everything below is in millimetres from the top-left corner. */
const LAYOUT = {
  bandWidth: 6,
  contentLeft: 8,
  contentRight: 77.6,
  header: { organisation: 3.2, headquarters: 7.2, motto: 10.4 },
  banner: { top: 13, height: 4.6 },
  photo: { x: 61.5, y: 19.5, width: 15.5, height: 19 },
  fields: { top: 19.8, rowHeight: 4.1, labelWidth: 15, valueRight: 60 },
  signatures: { lineY: 47.4, width: 15.5, gap: 3, left: 8 },
  cardNumber: { y: 51.4 },
} as const;

/** The six fields confirmed against the artwork at `DESIGN.md` §7.4. */
type FieldRow = readonly [label: string, value: string];

/**
 * The Union emblem, supplied 17 September 2026 and bundled as a template
 * asset — not user-uploaded, not a member's document, so it is read once at
 * module load rather than fetched per render. `nest-cli.json` copies the
 * `assets/` folder alongside the compiled template so this path resolves the
 * same way in `ts-node` and in `dist`.
 *
 * Drawn as a faint watermark behind the field area (DESIGN.md's "faint
 * watermark" treatment), not as a sharp badge — its exact position and size
 * on the official card is still unconfirmed (CARD-05), and a faint mark is
 * forgiving of being wrong about that in a way a prominent one would not be.
 */
const EMBLEM_BYTES = readFileSync(
  fileURLToPath(new URL('./assets/nurtw-emblem.png', import.meta.url)),
);

async function embed(
  document: PDFDocument,
  image: EmbeddableImage | null,
): Promise<Awaited<ReturnType<PDFDocument['embedJpg']>> | null> {
  if (!image || !RENDERABLE_IMAGE_TYPES.includes(image.contentType)) {
    return null;
  }
  return image.contentType === 'image/png'
    ? document.embedPng(image.bytes)
    : document.embedJpg(image.bytes);
}

export const v1Provisional: CardTemplate = {
  version: 'v1-provisional',
  label: 'Provisional card — reconstructed from photograph',

  /**
   * Twelve months. **CARD-04**, answered 14 September 2026: cards are renewed
   * every year, confirming the observation at `DESIGN.md` §7.1 that the physical
   * card prints the year vertically at the same scale as the Union's name.
   */
  validityMonths: 12,

  provisional: true,

  async render(input: CardRenderInput): Promise<Uint8Array> {
    const document = await PDFDocument.create();

    // No metadata derived from the holder. A PDF's Title and Author fields are
    // read by every viewer and survive being emailed onward; a member's name
    // does not belong in them.
    document.setTitle('NURTW membership card');
    document.setProducer('NURTW Membership and Vehicle Verification System');
    document.setCreator('NURTW Membership and Vehicle Verification System');

    const page = document.addPage([mm(ID1_WIDTH_MM), mm(ID1_HEIGHT_MM)]);
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);

    const colour = (c: { r: number; g: number; b: number }) =>
      rgb(c.r, c.g, c.b);

    const drawText = (
      text: string,
      options: {
        x: number;
        top: number;
        size: number;
        font?: typeof regular;
        colour?: { r: number; g: number; b: number };
      },
    ) => {
      page.drawText(text, {
        x: mm(options.x),
        y: baselineY(options.top, options.size, ID1_HEIGHT_MM),
        size: options.size,
        font: options.font ?? regular,
        color: colour(options.colour ?? PALETTE.navy),
      });
    };

    const centred = (
      text: string,
      options: {
        top: number;
        size: number;
        font?: typeof regular;
        colour?: { r: number; g: number; b: number };
      },
    ) => {
      const font = options.font ?? regular;
      const width = widthOf(font, text, options.size);
      const centre = mm((LAYOUT.contentLeft + LAYOUT.contentRight) / 2);
      page.drawText(text, {
        x: centre - width / 2,
        y: baselineY(options.top, options.size, ID1_HEIGHT_MM),
        size: options.size,
        font,
        color: colour(options.colour ?? PALETTE.navy),
      });
    };

    // --- The two green bands ------------------------------------------------
    //
    // `DESIGN.md` §1: solid green, carrying "NURTW" and the validity year, both
    // set vertically. The year is at the same scale as the Union's own name on
    // the physical card, which is why it is drawn large rather than as fine
    // print (§7.1).
    for (const x of [0, ID1_WIDTH_MM - LAYOUT.bandWidth]) {
      page.drawRectangle({
        x: mm(x),
        y: 0,
        width: mm(LAYOUT.bandWidth),
        height: mm(ID1_HEIGHT_MM),
        color: colour(PALETTE.green),
      });
    }

    page.drawText(STRINGS.bandWord, {
      x: mm(LAYOUT.bandWidth / 2) + 4,
      y: mm(8),
      size: 8,
      font: bold,
      color: colour(PALETTE.white),
      rotate: degrees(90),
    });

    // The validity year, where the card has one. Omitted rather than guessed
    // when the template carries no validity (CARD-04).
    const year = input.expiryDate?.getUTCFullYear() ?? input.issueDate?.getUTCFullYear();
    if (year !== undefined) {
      page.drawText(String(year), {
        x: mm(ID1_WIDTH_MM - LAYOUT.bandWidth / 2) + 4,
        y: mm(14),
        size: 9,
        font: bold,
        color: colour(PALETTE.white),
        rotate: degrees(90),
      });
    }

    // --- Header -------------------------------------------------------------
    const organisation = fitOrTruncate(
      bold,
      STRINGS.organisation,
      mm(LAYOUT.contentRight - LAYOUT.contentLeft),
      6,
      4,
    );
    centred(organisation.text, {
      top: LAYOUT.header.organisation,
      size: organisation.size,
      font: bold,
      colour: PALETTE.green,
    });
    centred(STRINGS.headquarters, {
      top: LAYOUT.header.headquarters,
      size: 4.2,
      font: bold,
      colour: PALETTE.navy,
    });

    // "MOTTO:" in red, the motto itself in navy — as observed (`DESIGN.md` §1).
    const mottoSize = 4;
    const labelWidth = widthOf(bold, `${STRINGS.mottoLabel} `, mottoSize);
    const valueWidth = widthOf(regular, STRINGS.mottoValue, mottoSize);
    const mottoStart =
      mm((LAYOUT.contentLeft + LAYOUT.contentRight) / 2) -
      (labelWidth + valueWidth) / 2;
    page.drawText(STRINGS.mottoLabel, {
      x: mottoStart,
      y: baselineY(LAYOUT.header.motto, mottoSize, ID1_HEIGHT_MM),
      size: mottoSize,
      font: bold,
      color: colour(PALETTE.red),
    });
    page.drawText(STRINGS.mottoValue, {
      x: mottoStart + labelWidth,
      y: baselineY(LAYOUT.header.motto, mottoSize, ID1_HEIGHT_MM),
      size: mottoSize,
      font: regular,
      color: colour(PALETTE.navy),
    });

    // --- The red banner -----------------------------------------------------
    page.drawRectangle({
      x: mm(LAYOUT.bandWidth),
      y: mm(ID1_HEIGHT_MM - LAYOUT.banner.top - LAYOUT.banner.height),
      width: mm(ID1_WIDTH_MM - 2 * LAYOUT.bandWidth),
      height: mm(LAYOUT.banner.height),
      color: colour(PALETTE.red),
    });
    centred(STRINGS.banner, {
      top: LAYOUT.banner.top + 1.4,
      size: 6,
      font: bold,
      colour: PALETTE.white,
    });

    // --- Photograph ---------------------------------------------------------
    const photo = await embed(document, input.photo);
    page.drawRectangle({
      x: mm(LAYOUT.photo.x),
      y: mm(ID1_HEIGHT_MM - LAYOUT.photo.y - LAYOUT.photo.height),
      width: mm(LAYOUT.photo.width),
      height: mm(LAYOUT.photo.height),
      borderColor: colour(PALETTE.rule),
      borderWidth: 0.5,
    });
    if (photo) {
      page.drawImage(photo, {
        x: mm(LAYOUT.photo.x),
        y: mm(ID1_HEIGHT_MM - LAYOUT.photo.y - LAYOUT.photo.height),
        width: mm(LAYOUT.photo.width),
        height: mm(LAYOUT.photo.height),
      });
    }

    // --- Emblem watermark ----------------------------------------------------
    //
    // Faint, behind the field area, drawn before the field text so the text
    // stays legible on top of it. See `EMBLEM_BYTES` above for why a watermark
    // rather than a sharp badge.
    {
      const emblem = await document.embedPng(EMBLEM_BYTES);
      const maxWidth = mm(34);
      const maxHeight = mm(33);
      const scale = Math.min(maxWidth / emblem.width, maxHeight / emblem.height);
      const width = emblem.width * scale;
      const height = emblem.height * scale;
      const centreX = (LAYOUT.contentLeft + LAYOUT.fields.valueRight) / 2;
      const centreTop = (LAYOUT.fields.top + LAYOUT.signatures.lineY) / 2;
      page.drawImage(emblem, {
        x: mm(centreX) - width / 2,
        y: mm(ID1_HEIGHT_MM - centreTop) - height / 2,
        width,
        height,
        opacity: 0.12,
      });
    }

    // --- Fields -------------------------------------------------------------
    //
    // Name, Address, Designation, State, Branch, Unit — confirmed against the
    // artwork at `DESIGN.md` §7.4 and matching proposal §8 exactly.
    //
    // "Unit" is the code and administrative name; the Union's form and card say
    // "Unity Body" (PRD §23.3, ORG-02), so the card carries the Union's word.
    const rows: readonly FieldRow[] = [
      ['Name', input.printedName],
      ['Address', input.printedAddress],
      ['Designation', input.printedDesignation],
      ['State', input.printedState],
      ['Branch', input.printedBranch],
      ['Unity Body', input.printedUnit],
    ];

    const valueX = LAYOUT.contentLeft + LAYOUT.fields.labelWidth;
    const valueMaxWidth = mm(LAYOUT.fields.valueRight - valueX);

    rows.forEach(([label, value], index) => {
      const top = LAYOUT.fields.top + index * LAYOUT.fields.rowHeight;
      drawText(label, {
        x: LAYOUT.contentLeft,
        top,
        size: 3.6,
        font: bold,
        colour: PALETTE.navy,
      });

      const text = value.trim().length > 0 ? value : '—';
      // The address is the one field that routinely needs two lines; everything
      // else shrinks to fit rather than wrapping into its neighbour's row.
      if (label === 'Address') {
        const lines = wrap(regular, text, valueMaxWidth, 3.8).slice(0, 2);
        lines.forEach((line, lineIndex) => {
          drawText(line, {
            x: valueX,
            top: top + lineIndex * 1.7,
            size: 3.8,
            colour: PALETTE.navy,
          });
        });
        return;
      }

      const fitted = fitOrTruncate(regular, text, valueMaxWidth, 4.2, 3);
      drawText(fitted.text, {
        x: valueX,
        top,
        size: fitted.size,
        colour: PALETTE.navy,
      });
    });

    // --- Signature lines ----------------------------------------------------
    //
    // Three, per `DESIGN.md` §7.4: President, General Secretary, Holder. The
    // officer images come from stored signature assets composited at print
    // (PRD §23.7); the holder's comes from their member record.
    const signatures: readonly [string, EmbeddableImage | null][] = [
      [input.president?.officerTitle ?? 'President', input.president?.image ?? null],
      [
        input.generalSecretary?.officerTitle ?? 'General Secretary',
        input.generalSecretary?.image ?? null,
      ],
      ["Holder's Signature", input.holderSignature],
    ];

    for (const [index, [caption, image]] of signatures.entries()) {
      const x =
        LAYOUT.signatures.left +
        index * (LAYOUT.signatures.width + LAYOUT.signatures.gap);

      const embedded = await embed(document, image);
      if (embedded) {
        // Fitted into the space above the rule, preserving aspect ratio: a
        // stretched signature is a different signature.
        const maxWidth = mm(LAYOUT.signatures.width);
        const maxHeight = mm(4.2);
        const scale = Math.min(
          maxWidth / embedded.width,
          maxHeight / embedded.height,
        );
        page.drawImage(embedded, {
          x: mm(x) + (maxWidth - embedded.width * scale) / 2,
          y: mm(ID1_HEIGHT_MM - LAYOUT.signatures.lineY) + 1,
          width: embedded.width * scale,
          height: embedded.height * scale,
        });
      }

      page.drawLine({
        start: { x: mm(x), y: mm(ID1_HEIGHT_MM - LAYOUT.signatures.lineY) },
        end: {
          x: mm(x + LAYOUT.signatures.width),
          y: mm(ID1_HEIGHT_MM - LAYOUT.signatures.lineY),
        },
        thickness: 0.4,
        color: colour(PALETTE.rule),
      });

      const fitted = fitOrTruncate(
        regular,
        caption,
        mm(LAYOUT.signatures.width),
        3,
        2.2,
      );
      drawText(fitted.text, {
        x,
        top: LAYOUT.signatures.lineY + 0.6,
        size: fitted.size,
        colour: PALETTE.navy,
      });
    }

    // --- Numbers ------------------------------------------------------------
    //
    // The card number is absent before issuance, by construction: it is not
    // allocated until then (item plan, decision 3). The membership number is
    // present throughout, because the member has one from approval.
    if (input.cardNumber) {
      drawText(`Card ${input.cardNumber}`, {
        x: LAYOUT.contentLeft,
        top: LAYOUT.cardNumber.y,
        size: 3.4,
        font: bold,
        colour: PALETTE.greenDeep,
      });
    }
    if (input.membershipNumber) {
      const text = `Member ${input.membershipNumber}`;
      const width = widthOf(bold, text, 3.4);
      page.drawText(text, {
        x: mm(LAYOUT.contentRight) - width,
        y: baselineY(LAYOUT.cardNumber.y, 3.4, ID1_HEIGHT_MM),
        size: 3.4,
        font: bold,
        color: colour(PALETTE.greenDeep),
      });
    }

    // --- The provisional mark ----------------------------------------------
    //
    // Removed by publishing a v2 template against the Union's own artwork, not
    // by deleting this line.
    centred(STRINGS.provisional, {
      top: ID1_HEIGHT_MM - 2.6,
      size: 2.6,
      font: bold,
      colour: PALETTE.red,
    });

    // --- The proof overprint ------------------------------------------------
    //
    // A card that has not been issued must be unmistakable as a proof, or the
    // approval step is decorative: an officer would print the draft, laminate
    // it, and hand it over. Drawn last so nothing covers it.
    if (!input.issued) {
      const size = 16;
      const width = widthOf(bold, STRINGS.proof, size);
      const diagonal = Math.atan2(mm(ID1_HEIGHT_MM), mm(ID1_WIDTH_MM));
      page.drawText(STRINGS.proof, {
        x: mm(ID1_WIDTH_MM / 2) - (width / 2) * Math.cos(diagonal),
        y: mm(ID1_HEIGHT_MM / 2) - (width / 2) * Math.sin(diagonal),
        size,
        font: bold,
        color: colour(PALETTE.red),
        rotate: degrees((diagonal * 180) / Math.PI),
        opacity: 0.42,
      });
    }

    return document.save();
  },
};

/**
 * What a vehicle-letter template is (PRD Requirement 9A.6, item 18).
 *
 * The card's arrangement (`card/templates/template.ts`), for the card's reason:
 * a letter records the version it was rendered against, so the old renderer
 * must still exist when a letter issued under it is downloaded again. A
 * template is therefore a module registered under its version, never a row.
 */

import type { EmbeddableImage } from '../../card/templates/template.js';

export interface LetterSignatory {
  officerName: string;
  officerTitle: string;
  image: EmbeddableImage | null;
}

/**
 * Everything a template draws. Every printed value was **read off the letter
 * row**, the snapshot taken at onboarding, never resolved from the vehicle now.
 */
export interface LetterRenderInput {
  letterReference: string;
  issuedAt: Date;
  plate: string;
  category: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  stickerNumber: string;
  memberName: string | null;
  membershipNumber: string | null;
  unit: string | null;
  branch: string | null;
  /**
   * The `PRESIDENT` signature position, titled State Chairman (CARD-07). `null`
   * until a signature is registered, and the line prints blank.
   */
  chairman: LetterSignatory | null;
  /** The `GENERAL_SECRETARY` position, titled Secretary (CARD-07). */
  secretary: LetterSignatory | null;
}

export interface LetterTemplate {
  readonly version: string;
  readonly label: string;
  render(input: LetterRenderInput): Promise<Uint8Array>;
}

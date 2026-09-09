/**
 * What a card template is.
 *
 * `ARCHITECTURE.md` §12 promises that `template_version` lets the Union redesign
 * a card without invalidating cards already issued. That promise only holds if
 * the **old renderer still exists**, so a template is a module registered under
 * its version, and a card records which version it was rendered against.
 *
 * Deleting a template module therefore breaks every card issued under it. That
 * is not a theoretical concern: a reprint of a damaged card must match the
 * original, and a verification officer comparing the article in their hand
 * against the System needs the System to describe what was printed.
 *
 * This is deliberately **not** Decision 5.2's "profiles are rows, not code"
 * treatment. A disclosure profile changes when the Union onboards an
 * organisation and must not require a deploy; a card redesign is a print-shop
 * event with weeks of lead time and needs the artwork committed and reviewed.
 * Opposite change profiles, opposite mechanisms.
 */

export interface EmbeddableImage {
  bytes: Buffer;
  /** `image/jpeg` or `image/png`. See {@link RENDERABLE_IMAGE_TYPES}. */
  contentType: string;
}

/**
 * The image types a card can carry.
 *
 * Narrower than what the media module accepts, which also takes WebP. `pdf-lib`
 * embeds JPEG and PNG only, and converting would mean a native image library in
 * a container that currently has none. The issuance path refuses a WebP
 * photograph with an explanation rather than printing a card with a hole in it.
 */
export const RENDERABLE_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
];

export interface OfficerSignatureOnCard {
  officerName: string;
  officerTitle: string;
  image: EmbeddableImage | null;
}

/**
 * Everything a template needs to draw one card.
 *
 * Every printed value arrives as a string that was **read off the card row**,
 * not resolved from the member. Decision 5 of the item plan: the card is a
 * physical object, and re-deriving its contents would produce a different card
 * bearing the same number.
 */
export interface CardRenderInput {
  /** Null until the card is issued, which is what makes it a proof. */
  cardNumber: string | null;
  /**
   * Whether this is the issued article or a proof.
   *
   * A proof is overprinted. Without that, an officer could print the draft,
   * laminate it, and hand it over — and the approval step would be decorative.
   */
  issued: boolean;
  printedName: string;
  printedAddress: string;
  printedDesignation: string;
  printedState: string;
  printedBranch: string;
  printedUnit: string;
  membershipNumber: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  photo: EmbeddableImage | null;
  holderSignature: EmbeddableImage | null;
  president: OfficerSignatureOnCard | null;
  generalSecretary: OfficerSignatureOnCard | null;
}

export interface CardTemplate {
  readonly version: string;
  readonly label: string;

  /**
   * Validity in whole months, or `null` for a card that does not expire.
   *
   * PRD §23.5 — configurable per template, and "may be none". **QUESTIONS.md
   * CARD-04 is open**, so this stays `null`: the expiry path is built and
   * tested, and the Union's answer sets a number here. A guessed twelve months
   * would be indistinguishable from a period the Union asked for.
   */
  readonly validityMonths: number | null;

  /**
   * Whether the template is drawn from guessed artwork.
   *
   * `DESIGN.md` §2 is explicit that the palette is inferred from a daylight
   * photograph and must be replaced with sampled values before anything is
   * printed. A provisional template says so on its face, because a card handed
   * to a member is not a draft that can be revised.
   */
  readonly provisional: boolean;

  render(input: CardRenderInput): Promise<Uint8Array>;
}

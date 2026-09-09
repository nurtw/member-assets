/**
 * Membership cards — requests and responses.
 *
 * PRD §8, with the card fields at
 * `docs/Proposal_for_the_Development_and_Implementation_of.md` §8 and the visual
 * findings at `DESIGN.md` §7.
 *
 * **Five fields depend on open questions** (CARD-04 to CARD-08). As in
 * `./membership.ts`, they are built as specified and marked with the question
 * they wait on, so an answer is a configuration change rather than a migration.
 */

import { z } from 'zod';

// --- Officer signatures ------------------------------------------------------

/**
 * PRD §23.7 and `DESIGN.md` §7.4 — the card carries three signature lines, two
 * of which are Union officers. The third is the holder's own and comes from the
 * member record.
 */
export const OFFICER_SIGNATURE_POSITIONS = [
  'PRESIDENT',
  'GENERAL_SECRETARY',
] as const;

export type OfficerSignaturePosition =
  (typeof OFFICER_SIGNATURE_POSITIONS)[number];

export const officerSignaturePositionSchema = z.enum(
  OFFICER_SIGNATURE_POSITIONS,
);

const printedText = (max: number) => z.string().trim().min(1).max(max);

const uuid = z.uuid('A valid identifier is required.');

/**
 * Registering a signature asset against a position.
 *
 * **CARD-07** is open: the Union has not yet supplied the officers' names,
 * printed titles, or signature images. The mechanism is complete and the two
 * records are created the day the images arrive.
 */
export const createOfficerSignatureSchema = z.object({
  position: officerSignaturePositionSchema,
  /** As printed on the card, which need not match the user directory. */
  officerName: printedText(80),
  officerTitle: printedText(80),
  mediaAssetId: uuid,
});

export type CreateOfficerSignatureInput = z.infer<
  typeof createOfficerSignatureSchema
>;

// --- Card workflow -----------------------------------------------------------

/**
 * Preparing a card.
 *
 * The printed values are supplied here rather than derived at render time,
 * because a card is a physical object and must re-render years later exactly as
 * it was printed. See `plans/06-membership-card-issuance.md`, decision 5.
 *
 * Name, designation, state, branch, and unit are **defaulted from the member
 * record** by the API when omitted, so the ordinary path is to send only the
 * address. They are accepted explicitly because the card has finite space and
 * the proposal is explicit that values are "formatted for card space" — an
 * officer must be able to shorten a name that will not fit rather than have it
 * silently truncated at the millimetre.
 */
export const draftCardSchema = z.object({
  memberId: uuid,
  /**
   * The card-display address (proposal §8), which "may be shorter than the full
   * residential address". Required: it is the one printed field with no sensible
   * default, since the residential address lives in the sensitive table the card
   * module must not read.
   */
  printedAddress: z.string().trim().min(4).max(120),
  printedName: z.string().trim().min(1).max(60).optional(),
  printedDesignation: z.string().trim().max(60).optional(),
  printedBranch: z.string().trim().max(60).optional(),
  printedUnit: z.string().trim().max(60).optional(),
  /**
   * PRD Requirement 8.2 — the issuing council's state, never the member's state
   * of origin. Defaults to the council the member's organisation sits beneath.
   */
  printedState: z.string().trim().max(60).optional(),
  /** Defaults to the current template. */
  templateVersion: z.string().trim().max(40).optional(),
});

export type DraftCardInput = z.infer<typeof draftCardSchema>;

/** Amending a card that has not yet been approved. */
export const updateCardSchema = draftCardSchema
  .omit({ memberId: true })
  .partial();

export type UpdateCardInput = z.infer<typeof updateCardSchema>;

/**
 * The approver's decision on a card awaiting approval.
 *
 * `ISSUED` allocates the card number and stamps the issue date; `DRAFT` returns
 * it to the preparing officer with a reason. There is no `REJECTED` — PRD §8 has
 * no such state, and a card that should not exist is cancelled.
 */
export const decideCardSchema = z
  .object({
    decision: z.enum(['ISSUED', 'DRAFT']),
    reason: z.string().trim().min(4).max(1000).optional(),
  })
  .refine((value) => value.decision !== 'DRAFT' || value.reason !== undefined, {
    message: 'A reason is required when returning a card for amendment.',
    path: ['reason'],
  });

export type DecideCardInput = z.infer<typeof decideCardSchema>;

/**
 * Moving a card to a terminal or suspended state.
 *
 * Deliberately **not** the whole status set. `ISSUED` happens through approval
 * and `REPLACED` happens through replacement — both allocate or supersede, and
 * routing them through a general status setter would let a caller reach those
 * effects without the accompanying work.
 */
export const setCardStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'LOST', 'EXPIRED', 'CANCELLED']),
  reason: z.string().trim().min(4, 'A reason is required.').max(1000),
});

export type SetCardStatusInput = z.infer<typeof setCardStatusSchema>;

/**
 * Replacing a card.
 *
 * **CARD-08** is open — who authorises a replacement, and whether the original
 * is marked lost, void, or superseded. The mechanism implemented here is
 * superseding: the original moves to `REPLACED` and the new card points back at
 * it, in one transaction. If the Union's answer differs, it changes who may call
 * this, not what it does.
 */
export const replaceCardSchema = z.object({
  reason: z.string().trim().min(4, 'A reason is required.').max(1000),
  /** Carried over from the superseded card when omitted. */
  printedAddress: z.string().trim().min(4).max(120).optional(),
});

export type ReplaceCardInput = z.infer<typeof replaceCardSchema>;

// --- Responses ---------------------------------------------------------------

export interface OfficerSignatureRecord {
  id: string;
  position: OfficerSignaturePosition;
  officerName: string;
  officerTitle: string;
  mediaAssetId: string;
  isActive: boolean;
  activeFrom: string;
  activeTo: string | null;
}

/**
 * A card in a list.
 *
 * Card-display data only. Nothing here comes from `member_contact`, `next_of_kin`,
 * or `guarantor` — the printed address is the officer-composed one held on the
 * card itself, which is why the card module never joins the sensitive tables.
 */
export interface CardSummary {
  id: string;
  cardNumber: string | null;
  status: string;
  templateVersion: string;
  issueDate: string | null;
  expiryDate: string | null;
  member: {
    id: string;
    surname: string;
    firstName: string;
    middleName: string | null;
    status: string;
    membershipNumber: string | null;
    organisation: { id: string; name: string; level: string };
  };
}

/** One card, including the values printed upon it. */
export interface CardDetail extends CardSummary {
  printed: {
    name: string | null;
    address: string | null;
    designation: string | null;
    state: string | null;
    branch: string | null;
    unit: string | null;
    membershipNumber: string | null;
  };
  /** Both ends of the replacement chain (PRD Requirement 8.1). */
  replacementOfCardId: string | null;
  replacedByCardId: string | null;
  issuedByUserId: string | null;
  approvedByUserId: string | null;
  createdAt: string;
}

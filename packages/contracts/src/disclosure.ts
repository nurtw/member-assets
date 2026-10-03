/**
 * Disclosure profiles (PRD §15, ARCHITECTURE.md Decision 5.2 — item 11).
 *
 * A profile is a row naming the record fields an outside organisation's
 * verification response may carry. It names fields of the closed catalogue in
 * `@nurtw/domain` (`VERIFICATION_FIELDS`), and only its external-admissible
 * ones. A response is built by projecting through the profile (Decision 5.1),
 * so a field absent from it is never read into the response at all.
 */

import {
  EXTERNAL_VERIFICATION_FIELDS,
  isExternalVerificationField,
  type ExternalVerificationField,
} from '@nurtw/domain';
import { z } from 'zod';

/** Which kind of check a field can appear on. */
export type DisclosureFieldCheck = 'VEHICLE' | 'MEMBERSHIP' | 'BOTH';

/**
 * How each field reads on the settings screen. Typed over the external tier,
 * so a field added to the catalogue without a label here fails to compile.
 */
export const DISCLOSURE_FIELD_LABELS: Readonly<
  Record<
    ExternalVerificationField,
    { label: string; check: DisclosureFieldCheck; description: string }
  >
> = {
  plate_number: {
    label: 'Plate number',
    check: 'VEHICLE',
    description: 'The plate as the Union recorded it.',
  },
  vehicle_category: {
    label: 'Vehicle category',
    check: 'VEHICLE',
    description: 'The class of vehicle, such as shuttle bus or truck.',
  },
  sticker_status: {
    label: 'Sticker status',
    check: 'VEHICLE',
    description: 'The status of the sticker attached to the vehicle.',
  },
  organizational_unit: {
    label: 'Branch or unit',
    check: 'BOTH',
    description: 'The name of the branch or unit the record belongs to.',
  },
  attached_at: {
    label: 'Sticker issue date',
    check: 'VEHICLE',
    description: 'When the sticker was attached to the vehicle.',
  },
  plate_matches_sticker: {
    label: 'Plate matches sticker',
    check: 'VEHICLE',
    description:
      'On a check of a plate and a sticker together, whether the sticker belongs to that plate.',
  },
  membership_status: {
    label: 'Membership status',
    check: 'MEMBERSHIP',
    description: 'Whether the member is in good standing.',
  },
  card_status: {
    label: 'Card status',
    check: 'MEMBERSHIP',
    description: 'The status of the membership card.',
  },
  designation: {
    label: 'Designation',
    check: 'MEMBERSHIP',
    description: 'The member’s designation in the Union.',
  },
};

export interface SystemDisclosureProfile {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly ExternalVerificationField[];
}

/**
 * The profiles of PRD §15, seeded as system rows. They cannot be amended
 * through the interface, for the reason system roles cannot (Decision 9.5):
 * "Minimal verification" must go on meaning what the PRD says it means. The
 * Union composes further profiles from the same catalogue without a release
 * (Requirement 15.1).
 *
 * - **Minimal** and **Aggregate reporting** name no record field. The first
 *   confirms a match and nothing about it. The second is for an organisation
 *   that reads totals only, whose response shape is item 14's.
 * - **Operational** names the four fields proposal §15 lists.
 * - **Membership** names the two statuses. Proposal §15 gives the designation
 *   "if approved", so it is left to a profile the Union composes when it does
 *   approve it.
 *
 * PRD §15's fifth profile, Internal, is not a row and must never become one:
 * the internal channels are governed by permissions (item 10), and a row
 * could be assigned to an outside organisation.
 */
export const SYSTEM_DISCLOSURE_PROFILES = [
  {
    code: 'MINIMAL_VERIFICATION',
    label: 'Minimal verification',
    description:
      'Confirms that a matching NURTW record exists. Discloses nothing about it.',
    fields: [],
  },
  {
    code: 'OPERATIONAL_VERIFICATION',
    label: 'Operational verification',
    description:
      'For an approved operational process: the plate, the vehicle category, the sticker status, and the branch or unit.',
    fields: [
      'plate_number',
      'vehicle_category',
      'sticker_status',
      'organizational_unit',
    ],
  },
  {
    code: 'MEMBERSHIP_VERIFICATION',
    label: 'Membership verification',
    description:
      'Confirms a membership or card number, with the membership status and the card status.',
    fields: ['membership_status', 'card_status'],
  },
  {
    code: 'AGGREGATE_REPORTING',
    label: 'Aggregate reporting',
    description:
      'For an organisation that reads totals only. No record of any vehicle or member is disclosed.',
    fields: [],
  },
] as const satisfies readonly SystemDisclosureProfile[];

/**
 * One field a profile may name. Anything else is refused here, before a row
 * is written: an internal-only field such as the declaration status, and any
 * name the catalogue does not hold.
 */
const disclosureField = z
  .string()
  .refine(
    isExternalVerificationField,
    'That field cannot be disclosed to an outside organisation.',
  );

const disclosureFields = z
  .array(disclosureField)
  .max(EXTERNAL_VERIFICATION_FIELDS.length)
  .transform((fields) => [...new Set(fields)]);

/** A reason is mandatory, and audited with the before and after field sets. */
const reason = z
  .string()
  .trim()
  .min(4, 'A reason is required for this change.')
  .max(1000);

export const createDisclosureProfileSchema = z.object({
  /** Fixed once created: clients and the audit trail refer to it. */
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Z][A-Z0-9_]{2,49}$/,
      'Use capital letters, digits, and underscores, starting with a letter.',
    ),
  label: z.string().trim().min(2, 'A name is required.').max(120),
  description: z.string().trim().max(500).optional(),
  fields: disclosureFields,
});
export type CreateDisclosureProfileInput = z.infer<
  typeof createDisclosureProfileSchema
>;

/**
 * Amends a profile the Union composed. Changing its fields changes, from the
 * next request, what every organisation holding it is told.
 */
export const updateDisclosureProfileSchema = z
  .object({
    label: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    fields: disclosureFields.optional(),
    isActive: z.boolean().optional(),
    reason,
  })
  .refine(
    (value) =>
      value.label !== undefined ||
      value.description !== undefined ||
      value.fields !== undefined ||
      value.isActive !== undefined,
    {
      message:
        'Change at least one of the name, the description, the fields, or whether it is offered.',
    },
  );
export type UpdateDisclosureProfileInput = z.infer<
  typeof updateDisclosureProfileSchema
>;

/** A profile as the settings screen shows it. */
export interface DisclosureProfileSummary {
  id: string;
  code: string;
  label: string;
  description: string | null;
  /** Seeded from PRD §15, and not amendable. */
  isSystem: boolean;
  /** Whether it is offered when an organisation is approved or amended. */
  isActive: boolean;
  /** In catalogue order. */
  fields: string[];
  /** Organisations holding it whose access has not been revoked. */
  clientCount: number;
}

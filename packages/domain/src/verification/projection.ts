/**
 * The single projection function (ARCHITECTURE.md Decisions 5.1 and 5.3,
 * PRD Requirement 15.2 — item 10).
 *
 * Every verification response, internal or external, takes its record fields
 * from `projectVerification` and from nowhere else. The response is built by
 * walking the closed catalogue below and copying each field the caller is
 * permitted. Nothing is ever deleted from a fuller object. A field added to a
 * model later is therefore withheld until it is added here *and* permitted,
 * which is the failure mode Decision 5.1 asks for.
 *
 * Field names are the names a response carries (proposal §12.5), so a
 * disclosure profile names exactly what will appear.
 */

/**
 * Whether an external disclosure profile may ever admit a field.
 *
 * `EXTERNAL` fields are the ones PRD §15 and §23.14 allow beyond the match
 * itself: the plate, vehicle category, sticker status, branch or unit label,
 * the issue date, and (combined) whether the sticker belongs to the plate. For
 * a membership check, §15's Membership verification profile adds the
 * membership status, the card status, and the designation.
 *
 * `INTERNAL` fields reach the internal channels only, whatever a profile row
 * says. Declaration status is one by law of the PRD (Requirement 12.7), and
 * the Transpay register's plate another (Requirement 11.2).
 */
export type VerificationFieldTier = 'EXTERNAL' | 'INTERNAL';

export const VERIFICATION_FIELDS = {
  plate_number: 'EXTERNAL',
  vehicle_category: 'EXTERNAL',
  sticker_status: 'EXTERNAL',
  organizational_unit: 'EXTERNAL',
  /** When the sticker was attached to this vehicle: §23.14's issue date. */
  attached_at: 'EXTERNAL',
  /** Combined checks only. */
  plate_matches_sticker: 'EXTERNAL',
  /** Membership checks only. */
  membership_status: 'EXTERNAL',
  card_status: 'EXTERNAL',
  designation: 'EXTERNAL',

  declaration_status: 'INTERNAL',
  onboarded_at: 'INTERNAL',
  identifier_scheme: 'INTERNAL',
  /** An unattached Transpay barcode's plate on the register. */
  registered_plate: 'INTERNAL',
  /** The plate of the vehicle the presented sticker is attached to. */
  sticker_plate: 'INTERNAL',
  make: 'INTERNAL',
  model: 'INTERNAL',
  color: 'INTERNAL',
  route_type: 'INTERNAL',
  vehicle_id: 'INTERNAL',
  member_name: 'INTERNAL',
  membership_number: 'INTERNAL',
  /** The member a verified vehicle belongs to; `membership_status` is a check's own. */
  member_status: 'INTERNAL',
  card_number: 'INTERNAL',
  card_expiry_date: 'INTERNAL',
} as const satisfies Record<string, VerificationFieldTier>;

export type VerificationField = keyof typeof VERIFICATION_FIELDS;

export const VERIFICATION_FIELD_NAMES = Object.keys(
  VERIFICATION_FIELDS,
) as readonly VerificationField[];

/** The fields of the `EXTERNAL` tier. */
export type ExternalVerificationField = {
  [
    Field in VerificationField
  ]: (typeof VERIFICATION_FIELDS)[Field] extends 'EXTERNAL' ? Field : never;
}[VerificationField];

/**
 * The only fields a disclosure profile may name (item 11). A profile is
 * refused an `INTERNAL` field when it is saved, and the projection below drops
 * one anyway: the first check is a courtesy to the officer, the second is the
 * control.
 */
export const EXTERNAL_VERIFICATION_FIELDS = VERIFICATION_FIELD_NAMES.filter(
  (field) => VERIFICATION_FIELDS[field] === 'EXTERNAL',
) as readonly ExternalVerificationField[];

export function isExternalVerificationField(
  name: string,
): name is ExternalVerificationField {
  return (EXTERNAL_VERIFICATION_FIELDS as readonly string[]).includes(name);
}

/** The value of every catalogue field, `null` where there is none. */
export interface VerificationValues {
  plate_number: string | null;
  vehicle_category: string | null;
  sticker_status: string | null;
  organizational_unit: string | null;
  attached_at: string | null;
  plate_matches_sticker: boolean | null;
  membership_status: string | null;
  card_status: string | null;
  designation: string | null;
  declaration_status: string | null;
  onboarded_at: string | null;
  identifier_scheme: 'SIGNED' | 'LEGACY' | null;
  registered_plate: string | null;
  sticker_plate: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  route_type: string | null;
  vehicle_id: string | null;
  member_name: string | null;
  membership_number: string | null;
  member_status: string | null;
  card_number: string | null;
  card_expiry_date: string | null;
}

export type ProjectedVerification = Partial<VerificationValues>;

export type VerificationChannel = 'INTERNAL' | 'EXTERNAL';

/**
 * Builds the record part of a verification response.
 *
 * - The output holds exactly the catalogue fields named in `permitted`,
 *   `null` included, in catalogue order.
 * - A permitted name the catalogue does not know is ignored, as is any key of
 *   `values` the catalogue does not know.
 * - On the `EXTERNAL` channel an `INTERNAL` field is never output, even when a
 *   profile permits it: a misconfigured profile row cannot disclose a
 *   declaration status.
 */
export function projectVerification(
  values: VerificationValues,
  permitted: Iterable<string>,
  channel: VerificationChannel,
): ProjectedVerification {
  const allowed = new Set(permitted);
  const output: Record<string, unknown> = {};
  for (const field of VERIFICATION_FIELD_NAMES) {
    if (!allowed.has(field)) {
      continue;
    }
    if (channel === 'EXTERNAL' && VERIFICATION_FIELDS[field] !== 'EXTERNAL') {
      continue;
    }
    output[field] = values[field];
  }
  return output as ProjectedVerification;
}

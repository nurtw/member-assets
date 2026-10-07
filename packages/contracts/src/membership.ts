/**
 * The Union's Membership / Registration / Guarantorship form.
 *
 * PRD §7 incorporates `docs/National_Union_of_Road_Transport_Workers_(NURTW).md`
 * by reference; these schemas are that specification expressed once, validated by
 * the API and reused by the registration screens, so the two cannot disagree
 * about what the form asks for.
 *
 * Field identifiers from the specification (A1.1, C2.4, D4.2 …) are quoted in
 * comments, because they are the vocabulary the Union uses when discussing the
 * paper form and are how a query about a field will arrive.
 *
 * **Four fields depend on open questions.** They are built as the specification
 * describes them and marked with the question they wait on, so that an answer is
 * a label or validation change rather than a schema migration:
 *
 * - `signedOn` dates — MEM-09, the printed labels are not legible
 * - `hasCollateral` wording — MEM-08, the exact printed phrase
 * - guarantor LGA — MEM-10, whether the paper form has the field at all
 * - registration metadata — MEM-11, fields not visible in the photograph
 */

import {
  isNigerianPhone,
  MEMBER_STATUSES,
  normalizeNigerianPhone,
} from '@nurtw/domain';
import { z } from 'zod';

// --- Shared field types ------------------------------------------------------

const personName = z
  .string()
  .trim()
  .min(1, 'This name is required.')
  .max(80, 'A name may not exceed 80 characters.');

const optionalName = z.string().trim().max(80).optional().or(z.literal('')) ;

const address = z
  .string()
  .trim()
  .min(4, 'An address is required.')
  .max(400, 'An address may not exceed 400 characters.');

const optionalShortText = z.string().trim().max(120).optional();

/**
 * A whole name in one field, as the Union asks for a next of kin and a
 * guarantor since 6 October 2026 (`QUESTIONS.md` MEM-16). The member's own
 * name stays in three parts, because the card prints it.
 */
const fullName = z
  .string()
  .trim()
  .min(2, 'A full name is required.')
  .max(200, 'A name may not exceed 200 characters.');

/** An address that may be left out. A blank one is no address. */
const optionalAddress = z
  .string()
  .trim()
  .max(400, 'An address may not exceed 400 characters.')
  .optional();

const uuid = z.uuid('A valid identifier is required.');

/**
 * A Nigerian telephone number, normalised to `+234XXXXXXXXXX` on the way in.
 *
 * Transformed rather than merely validated, so what reaches the database is the
 * canonical form regardless of how it was typed. Storing what the officer typed
 * would make the same person entered twice look like two people.
 */
const phone = z
  .string()
  .trim()
  .refine(isNigerianPhone, 'A valid Nigerian telephone number is required.')
  .transform(normalizeNigerianPhone);

/**
 * A Nigerian state of origin.
 *
 * Free text with a length bound rather than an enumeration: members come from
 * every state, the list is not the Union's to own, and PRD §23.2 keeps state of
 * origin deliberately distinct from the council's state. A controlled list here
 * would be a second place to maintain Nigerian geography.
 */
const stateOfOrigin = z.string().trim().min(2).max(60).optional();

/**
 * A date the applicant, next of kin, or guarantor signed.
 *
 * **MEM-09** — the printed labels beneath the signature lines are not legible in
 * the photograph of the form and are believed to be dates. Optional until the
 * Union confirms; if they turn out to be something else, this becomes a
 * differently-named field rather than a lost one.
 */
const signedOn = z.iso.date().optional();

// --- Section A — Personal ----------------------------------------------------

export const applicantSchema = z.object({
  /** A1.1, A1.2, A1.3 */
  surname: personName,
  firstName: personName,
  middleName: optionalName,

  /**
   * A2.1 – A2.5. `area` is still accepted and stored, but the form no longer
   * asks for it: the Union could not say how an area differs from a town
   * (`QUESTIONS.md` MEM-17). What was recorded before is kept.
   */
  residentialAddress: address,
  area: optionalShortText,
  townCity: optionalShortText,
  residentialLgaId: uuid.optional(),
  stateOfOrigin,

  /** A3.1 */
  phone,

  /** A4.2 — see MEM-09 */
  signedOn,
});

export type ApplicantInput = z.infer<typeof applicantSchema>;

// --- Section B — Unity Body (organisational assignment) ----------------------

/**
 * Section B on paper asks for the unity's name, address, town, LGA, and zone.
 *
 * Digitally the unity **is** an organisation record, so the applicant supplies
 * only which one they belong to; the unity's own address is administered once,
 * against that record, rather than re-typed by every applicant who joins it.
 * That is the whole benefit of the hierarchy built in item 04.
 */
export const organisationalAssignmentSchema = z.object({
  /** B1 — the unit (PRD §23.3: *Unit* in code, *Unity Body* on the form). */
  organisationId: uuid,
  /**
   * The member's approved NURTW designation.
   *
   * Optional, because **ORG-06** is open: the legacy export supplies no
   * designation list and none has been invented. Members registered before the
   * Union supplies the list carry no designation and are amended afterwards.
   */
  designationId: uuid.optional(),
});

export type OrganisationalAssignmentInput = z.infer<
  typeof organisationalAssignmentSchema
>;

// --- Section C — Next of Kin -------------------------------------------------

/**
 * What the Union needs of a next of kin (`QUESTIONS.md` MEM-16, PRD revision
 * 1.14): **a full name and a telephone number.** An address may be given.
 *
 * The paper form's other fields (town, local government area, state of origin,
 * occupation) are no longer asked for. Their columns remain, so a registration
 * recorded before the change keeps everything it had.
 */
export const nextOfKinSchema = z.object({
  /** C1, as one field. */
  fullName,

  /** C3.1 */
  phone,

  /** C2.1, optional. */
  address: optionalAddress,

  /** C4.2 — see MEM-09 */
  signedOn,
});

export type NextOfKinInput = z.infer<typeof nextOfKinSchema>;

// --- Section D — Guarantor ---------------------------------------------------

/**
 * What the Union needs of a guarantor, where there is one (`QUESTIONS.md`
 * MEM-06, as added to on 6 and 7 October 2026; PRD revision 1.14): **a full
 * name, a telephone number, and an address.** The guarantor as a whole is
 * still optional.
 *
 * The relationship, the occupation, the town, and the collateral question are
 * no longer asked for. Their columns remain for registrations recorded before.
 */
export const guarantorSchema = z.object({
  /** D1, as one field. */
  fullName,

  /** D3.2 */
  phone,

  /** D2.1 */
  address,

  /** D4.1 signing date — see MEM-09 */
  signedOn,
});

export type GuarantorInput = z.infer<typeof guarantorSchema>;

// --- The application ---------------------------------------------------------

/**
 * A complete registration.
 *
 * All four groups of PRD §7 in one submission. The form is completed in one
 * sitting from a paper original, so splitting it across four endpoints would
 * create four ways for a registration to be half-recorded.
 */
export const createApplicationSchema = z.object({
  applicant: applicantSchema,
  assignment: organisationalAssignmentSchema,
  nextOfKin: nextOfKinSchema,
  // MEM-06: a guarantor is not compulsory.
  guarantor: guarantorSchema.optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Every group is optional on amendment; a draft is edited section by section. */
export const updateApplicationSchema = z
  .object({
    applicant: applicantSchema.optional(),
    assignment: organisationalAssignmentSchema.optional(),
    nextOfKin: nextOfKinSchema.optional(),
    guarantor: guarantorSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one section must be supplied.',
  });

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

/** Attaching a photograph or signature already uploaded to the media endpoint. */
export const attachMediaSchema = z.object({
  passportPhotoId: uuid.nullable().optional(),
  signatureId: uuid.nullable().optional(),
});

export type AttachMediaInput = z.infer<typeof attachMediaSchema>;

// --- Review ------------------------------------------------------------------

export const APPLICATION_DECISIONS = ['APPROVED', 'REJECTED'] as const;
export type ApplicationDecision = (typeof APPLICATION_DECISIONS)[number];

/**
 * A decision on an application.
 *
 * A refusal requires a reason and an approval does not. The asymmetry is
 * deliberate: a refusal is the decision an applicant may challenge and the one
 * an officer will later be asked to justify.
 */
export const reviewApplicationSchema = z
  .object({
    decision: z.enum(APPLICATION_DECISIONS),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      value.decision !== 'REJECTED' || (value.reason?.length ?? 0) >= 4,
    {
      message: 'A reason is required when refusing an application.',
      path: ['reason'],
    },
  );

export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;

export const withdrawApplicationSchema = z.object({
  reason: z.string().trim().min(4, 'A reason is required.').max(1000),
});

export type WithdrawApplicationInput = z.infer<
  typeof withdrawApplicationSchema
>;

/** Changing a member's status after approval (suspend, restore, cancel). */
export const setMemberStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']),
  reason: z.string().trim().min(4, 'A reason is required.').max(1000),
});

export type SetMemberStatusInput = z.infer<typeof setMemberStatusSchema>;

/** The most members one request may list. A picker asks for far fewer. */
export const MEMBER_LIST_MAXIMUM = 200;

/**
 * What `GET /members` may be asked (item 37).
 *
 * `status` is one status, or several separated by commas. The Members screen
 * asks for everybody who is or was a member and leaves pending applicants to
 * Applications; a picker sends none and finds applicants too.
 */
export const listMembersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  organisationId: uuid.optional(),
  status: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((status) => status.trim())
        .filter((status) => status.length > 0),
    )
    .pipe(z.array(z.enum(MEMBER_STATUSES)))
    .transform((statuses) => [...new Set(statuses)]),
  limit: z.coerce.number().int().min(1).max(MEMBER_LIST_MAXIMUM).default(20),
});

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

// --- Responses ---------------------------------------------------------------

/**
 * An application in a list.
 *
 * Carries **no** next-of-kin, guarantor, collateral, telephone, or address
 * data. PRD Requirement 7.1 keeps that separate from card-display data, and a
 * list is the place where an over-generous projection would disclose the most at
 * once.
 */
export interface ApplicationSummary {
  id: string;
  applicationNumber: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  member: {
    id: string;
    surname: string;
    firstName: string;
    middleName: string | null;
    status: string;
    membershipNumber: string | null;
    organisation: { id: string; name: string; level: string };
    designation: { id: string; code: string; label: string } | null;
  };
}

/** The full record, returned only from the registration endpoints. */
export interface ApplicationDetail extends ApplicationSummary {
  rejectionReason: string | null;
  contact: {
    phone: string;
    residentialAddress: string;
    area: string | null;
    townCity: string | null;
    lga: { id: string; name: string; stateName: string } | null;
    stateOfOrigin: string | null;
  } | null;
  nextOfKin: RegistrationNextOfKin | null;
  guarantor: RegistrationGuarantor | null;
  passportPhotoId: string | null;
  /**
   * A signed link to the photograph, good for a few minutes (item 41). For
   * showing it on the application's page; never stored, and never in a list.
   */
  passportPhotoUrl: string | null;
  signatureId: string | null;
}

/**
 * One row of a member search — the minimum needed to let an officer pick the
 * right person out of a name list, nothing more. Used by pickers elsewhere in
 * the System (vehicle declaration's owner field, for one) that need to find a
 * member without holding `application.read` or seeing next-of-kin, guarantor,
 * or contact data.
 */
export interface MemberSearchResult {
  id: string;
  surname: string;
  firstName: string;
  middleName: string | null;
  status: string;
  membershipNumber: string | null;
  organisation: { id: string; name: string; level: string };
}

/**
 * A person named on a registration: the next of kin, or the guarantor.
 *
 * `fullName`, `phone`, and `address` are what the form asks for. The rest was
 * asked for until 7 October 2026 (item 42) and is `null` on anything recorded
 * since; it is returned so that an earlier registration shows all it had. Each
 * field is named: no row identifier or timestamp rides along.
 */
export interface RegistrationPerson {
  fullName: string;
  phone: string;
  address: string | null;
  area: string | null;
  townCity: string | null;
  occupation: string | null;
}

export interface RegistrationNextOfKin extends RegistrationPerson {
  lga: { id: string; name: string; stateName: string } | null;
  stateOfOrigin: string | null;
}

export interface RegistrationGuarantor extends RegistrationPerson {
  /** Always given for a guarantor. */
  address: string;
  relationshipToApplicant: string | null;
  hasCollateral: boolean | null;
  collateralDetails: string | null;
}

/**
 * The part of a member's record that Requirement 7.1 keeps apart: contact, next
 * of kin, and guarantor. Returned only to a holder of `member_sensitive.read`
 * over the member.
 */
export interface MemberRecordSensitive {
  contact: {
    phone: string;
    residentialAddress: string;
    area: string | null;
    townCity: string | null;
    lga: { id: string; name: string; stateName: string } | null;
    stateOfOrigin: string | null;
  } | null;
  nextOfKin: RegistrationNextOfKin | null;
  guarantor: RegistrationGuarantor | null;
}

/**
 * One member's record (item 37), from `GET /members/:id`.
 *
 * The named fields are what a list already shows. The two optional parts are
 * left out, not sent empty, for a reader who may not have them:
 *
 * - `application` — for a reader of applications over this member. `null`
 *   means the member has none, as every migrated member has not.
 * - `sensitive` — for a holder of `member_sensitive.read` over this member.
 */
export interface MemberRecord extends MemberSearchResult {
  designation: { id: string; code: string; label: string } | null;
  application?: {
    id: string;
    applicationNumber: string;
    status: string;
  } | null;
  sensitive?: MemberRecordSensitive;
}

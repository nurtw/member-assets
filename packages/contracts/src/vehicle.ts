/**
 * Vehicle declaration (PRD §9).
 *
 * `plateNumberDisplay` is the only plate field ever accepted from a caller —
 * `plateNumberNormalized` is derived server-side by `@nurtw/domain`'s
 * `normalizePlateNumber`, never supplied directly, so there is exactly one
 * place that can produce it and admitting a second would defeat the
 * uniqueness constraint it exists to enforce (PRD Requirement 9.1).
 *
 * `chassisVinRestricted` is present on the detail response type but is
 * projected out server-side for a caller without `vehicle.read_restricted`
 * (PRD Requirement 9.4) — the type says "may be absent", the service decides
 * when.
 */

import { isNigerianPhone, normalizeNigerianPhone } from '@nurtw/domain';
import { z } from 'zod';

import type { VehicleOnboarding } from './sticker.js';

const uuid = z.uuid('A valid identifier is required.');

const optionalShortText = z.string().trim().max(120).optional();

const plateNumberDisplay = z
  .string()
  .trim()
  .min(1, 'A plate number is required.')
  .max(20, 'A plate number may not exceed 20 characters.');

/** Normalised to `+234XXXXXXXXXX`, the same rule as a member's phone (`membership.ts`). */
const phone = z
  .string()
  .trim()
  .refine(isNigerianPhone, 'A valid Nigerian telephone number is required.')
  .transform(normalizeNigerianPhone);

/**
 * The vehicle's owner (PRD Requirement 9.8, revision 1.3, `QUESTIONS.md`
 * VEH-25). Not necessarily a member — the driver is the member. Name and
 * phone are required; the address is optional. Sensitive under Requirement
 * 7.1: stored apart from the vehicle and never reachable through verification.
 */
export const vehicleOwnerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "The owner's name is required.")
    .max(120, "The owner's name may not exceed 120 characters."),
  phone,
  address: z.string().trim().max(400).optional(),
});

export type VehicleOwnerInput = z.infer<typeof vehicleOwnerSchema>;

/**
 * The fields a vehicle is recorded or declared with, shared by both routes.
 *
 * `organisationId` names the branch or unit the vehicle is scoped to — never a
 * council or zone, which carry no vehicles directly. The service resolves
 * whether it names a branch or a unit and stores both `Vehicle.branchId` and
 * `Vehicle.unitId` accordingly, mirroring how a membership application
 * resolves a single `organisationId` into the record it actually needs
 * (`membership.ts`).
 *
 * `routeTypeId` and `owner` are required from revision 1.3 (Requirements
 * 9.8–9.9). They are required HERE, at the API boundary, not by the column,
 * because legacy rows lawfully lack them (Decision 6.6).
 */
const vehicleFields = {
  plateNumberDisplay,
  organisationId: uuid,
  routeTypeId: uuid,
  vehicleCategoryId: uuid.optional(),
  make: optionalShortText,
  model: optionalShortText,
  color: optionalShortText,
  /** PRD Requirement 9.4 — restricted; never required. */
  chassisVinRestricted: optionalShortText,
  /**
   * PRD §23.8 — a member may hold any number of vehicles, without limit.
   * Optional: PRD §9 associates a vehicle with "a member or transport
   * unit", either being sufficient. Revision 1.3 (Requirement 9.10): may name
   * an applicant whose application is still pending.
   */
  declaredByMemberId: uuid.optional(),
  owner: vehicleOwnerSchema,
  /** Internal operational note — PRD §9.1, never exposed through verification. */
  notes: z.string().trim().max(1000).optional(),
};

/**
 * Declares a vehicle under a branch or unit (`vehicle.declare`, PRD §9.5).
 *
 * If a vehicle with this plate is already ON RECORD, that same record is
 * declared rather than a second one created (Decision 6.5), and the fields
 * supplied here update it.
 */
export const declareVehicleSchema = z.object(vehicleFields);

export type DeclareVehicleInput = z.infer<typeof declareVehicleSchema>;

/**
 * Records a vehicle ON RECORD (`vehicle.record`, PRD Requirement 9.7,
 * revision 1.3). The same fields as a declaration; the difference is entirely
 * in what the service does with them — nothing here is a declaration.
 */
export const recordVehicleSchema = z.object(vehicleFields);

export type RecordVehicleInput = z.infer<typeof recordVehicleSchema>;

/**
 * Declares a vehicle already on record, from its own page
 * (`POST /vehicles/:id/declare`, Decision 6.6).
 *
 * Everything is optional because the record may already carry it. Whatever the
 * record lacks must be supplied here — a legacy row has no route type and may
 * have no owner phone — and the service refuses the declaration until the
 * result satisfies Requirements 9.8–9.9. `organisationId`, when given, moves
 * the record as it is declared, checked at both ends.
 */
export const declareRecordedVehicleSchema = z.object({
  organisationId: uuid.optional(),
  routeTypeId: uuid.optional(),
  declaredByMemberId: uuid.optional(),
  owner: vehicleOwnerSchema.optional(),
});

export type DeclareRecordedVehicleInput = z.infer<
  typeof declareRecordedVehicleSchema
>;

/**
 * Amends a declaration's record-keeping fields, and optionally moves it to a
 * different branch or unit. Never changes `status` — see
 * `setDeclarationStatusSchema`, which requires a reason and is a distinct,
 * separately-audited act.
 */
export const updateVehicleSchema = z
  .object({
    plateNumberDisplay: plateNumberDisplay.optional(),
    organisationId: uuid.optional(),
    /** Set, not cleared: a vehicle that has a route type keeps one (Requirement 9.9). */
    routeTypeId: uuid.optional(),
    vehicleCategoryId: uuid.nullable().optional(),
    make: optionalShortText,
    model: optionalShortText,
    color: optionalShortText,
    chassisVinRestricted: optionalShortText,
    /**
     * Attaches, changes, or clears (`null`) the member this vehicle is
     * declared under — the route a migrated record (PRD §9.5's provenance
     * exception, item 09) is reconciled against its owner through, and how
     * any declaration's operator can be corrected later without a new
     * declaration.
     */
    declaredByMemberId: uuid.nullable().optional(),
    /**
     * Replaces the owner details as a whole. Name and phone stay required, so
     * a correction cannot leave a record short of Requirement 9.8; this is
     * also how a legacy record's gaps are filled in.
     */
    owner: vehicleOwnerSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied.',
  });

export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

/**
 * Every status a caller may reach through the general status route, gated by
 * `vehicle.suspend`. `PENDING` is absent — nothing creates one (see
 * `packages/domain/src/vehicle/status.ts`). `DISPUTED` is absent because
 * only `declare()` produces one, from a plate conflict, never a direct
 * status write. `ARCHIVED` is absent too: the only path into it is
 * dismissing a dispute, a separate, more narrowly permissioned route — see
 * `dismissDisputeSchema` — matching how this codebase splits a route
 * whenever "which permission applies" depends on the transition rather than
 * the resource (`card.issue` vs `card.approve` is the precedent).
 */
export const SETTABLE_DECLARATION_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
] as const;

/**
 * Moves a declaration among `ACTIVE`, `SUSPENDED`, and `RETIRED`. A reason is
 * always required — unlike membership's status change, every transition here
 * (including reactivation) is worth a recorded justification, since a
 * vehicle's declaration status is what a verification enquiry answers
 * against.
 */
export const setDeclarationStatusSchema = z.object({
  status: z.enum(SETTABLE_DECLARATION_STATUSES),
  reason: z.string().trim().min(4, 'A reason is required.').max(1000),
});

export type SetDeclarationStatusInput = z.infer<
  typeof setDeclarationStatusSchema
>;

/**
 * Dismisses a disputed declaration (`DISPUTED -> ARCHIVED`), gated by
 * `vehicle.resolve_dispute`. No `status` field: dismissal is the only
 * outcome this item builds — *upholding* a disputed claim would require
 * demoting whichever record currently holds `ACTIVE` for that plate, a
 * policy call QUESTIONS.md VEH-07 leaves open.
 */
export const dismissDisputeSchema = z.object({
  reason: z.string().trim().min(4, 'A reason is required.').max(1000),
});

export type DismissDisputeInput = z.infer<typeof dismissDisputeSchema>;

// --- Responses ---------------------------------------------------------------

/**
 * A declaration in a list. No `chassisVinRestricted` at all — the list
 * response type carries no field for it, so a route cannot leak it by
 * forgetting to strip one (PRD Requirement 9.4).
 */
export interface VehicleSummary {
  id: string;
  plateNumberDisplay: string;
  /**
   * The declaration status. **Present only for a caller holding
   * `vehicle.declare` over this vehicle** (`QUESTIONS.md` VEH-28); absent
   * for everyone else, never blanked or guessed.
   */
  status?: string;
  /**
   * `null` for an `ON_RECORD` vehicle — never declared (revision 1.2,
   * Decision 6.5). Present only when `status` is.
   */
  declaredAt?: string | null;
  isLegacyImport: boolean;
  vehicleCategory: { id: string; code: string; label: string } | null;
  /** `null` only for a legacy record not yet given one (Requirement 9.9). */
  routeType: { id: string; code: string; label: string } | null;
  organisation: { id: string; name: string; level: string };
  declaredByMember: { id: string; surname: string; firstName: string } | null;
}

/**
 * Owner details as stored. Every field nullable because a legacy record
 * carries whatever the export held (Requirement 25.4). Detail response only —
 * never in a list, never on a verification path (Decision 10.1.1).
 */
export interface VehicleOwnerDetail {
  name: string | null;
  phone: string | null;
  address: string | null;
}

/**
 * The full record. `chassisVinRestricted` is `undefined` when the caller
 * lacks `vehicle.read_restricted` — present in the type, decided by the
 * service, never guessed at by a consumer.
 */
export interface VehicleDetail extends VehicleSummary {
  make: string | null;
  model: string | null;
  color: string | null;
  notes: string | null;
  chassisVinRestricted?: string | null;
  /** `null` when no owner has been recorded (possible only on a legacy record). */
  owner: VehicleOwnerDetail | null;
  /**
   * `null` until a sticker has been attached (Requirement 9A.1). On record,
   * onboarded, and declared are read from three different places — `status`
   * holds only the first and last (Decision 6.5).
   */
  onboarding: VehicleOnboarding | null;
}

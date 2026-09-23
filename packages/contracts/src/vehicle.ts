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

import { z } from 'zod';

const uuid = z.uuid('A valid identifier is required.');

const optionalShortText = z.string().trim().max(120).optional();

const plateNumberDisplay = z
  .string()
  .trim()
  .min(1, 'A plate number is required.')
  .max(20, 'A plate number may not exceed 20 characters.');

/**
 * Declares a vehicle under a branch or unit.
 *
 * `organisationId` names the branch or unit the declaration is scoped
 * to — never a council or zone, which carry no vehicles directly. The
 * service resolves whether it names a branch or a unit and stores both
 * `Vehicle.branchId` and `Vehicle.unitId` accordingly, mirroring how a
 * membership application resolves a single `organisationId` into the
 * record it actually needs (`membership.ts`).
 */
export const declareVehicleSchema = z.object({
  plateNumberDisplay,
  organisationId: uuid,
  vehicleCategoryId: uuid.optional(),
  make: optionalShortText,
  model: optionalShortText,
  color: optionalShortText,
  /** PRD Requirement 9.4 — restricted; never required to declare. */
  chassisVinRestricted: optionalShortText,
  /**
   * PRD §23.8 — a member may hold any number of vehicles, without limit.
   * Optional: PRD §9 associates a declaration with "a member or transport
   * unit", either being sufficient, and a unit-only declaration (no named
   * operator yet) is a legitimate outcome, not a placeholder for one.
   */
  declaredByMemberId: uuid.optional(),
  /** Internal operational note — PRD §9.1, never exposed through verification. */
  notes: z.string().trim().max(1000).optional(),
});

export type DeclareVehicleInput = z.infer<typeof declareVehicleSchema>;

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
  status: string;
  /** `null` for an `ON_RECORD` vehicle — never declared (revision 1.2, Decision 6.5). */
  declaredAt: string | null;
  isLegacyImport: boolean;
  vehicleCategory: { id: string; code: string; label: string } | null;
  organisation: { id: string; name: string; level: string };
  declaredByMember: { id: string; surname: string; firstName: string } | null;
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
}

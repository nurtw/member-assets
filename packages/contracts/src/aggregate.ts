/**
 * Vehicle totals and organisation metadata for outside organisations (PRD §13,
 * proposal §13 — item 14).
 *
 * The query schemas are **strict**: a parameter that is not an approved filter
 * is refused as a request error, never ignored (Requirements 13.1, 13.2). A
 * caller who sent `unit_id` must be told it was not applied, or it would read
 * a branch total as a unit's.
 */

import { parseReportingPeriod } from '@nurtw/domain';
import { z } from 'zod';

/** `GET /aggregates/vehicles/total` takes nothing. */
export const aggregateTotalQuerySchema = z.strictObject({});

/**
 * `GET /aggregates/vehicles` — the approved filters, any combination, a zone
 * or a branch but not both (the owner's direction of 4 October 2026: no
 * total below a branch).
 */
export const aggregateVehicleQuerySchema = z
  .strictObject({
    zone_id: z.uuid('A zone is named by its id.').optional(),
    branch_id: z.uuid('A branch is named by its id.').optional(),
    vehicle_category: z
      .string()
      .trim()
      .regex(
        /^[A-Z][A-Z0-9_]{0,49}$/,
        'A vehicle category is named by its code.',
      )
      .optional(),
    period: z
      .string()
      .refine(
        (value) => parseReportingPeriod(value) !== null,
        'A period is a month (2026-09), a quarter (2026-Q3), or a year (2026).',
      )
      .optional(),
  })
  .refine((query) => !(query.zone_id && query.branch_id), {
    message: 'Name a zone or a branch, not both.',
    path: ['branch_id'],
  });
export type AggregateVehicleQuery = z.infer<typeof aggregateVehicleQuerySchema>;

/** The filters a total was computed under, echoed back. */
export interface AggregateFiltersApplied {
  zone_id?: string;
  branch_id?: string;
  vehicle_category?: string;
  period?: string;
}

/**
 * A vehicle total. `vehicle_count` counts vehicles both onboarded and
 * declared (Requirement 13.5); the response names no vehicle and says nothing
 * of declaration (Requirement 12.7).
 */
export interface AggregateVehicleResponse {
  request_id: string;
  result: 'AGGREGATE_ONLY';
  filters_applied: AggregateFiltersApplied;
  totals: {
    /** A filtered total below the floor is `SUPPRESSED`. */
    vehicle_count: number | 'SUPPRESSED';
  };
  /**
   * Present on a filtered total: the count is rounded to this, so that one
   * total cannot be subtracted from another to uncover a small one.
   */
  rounded_to_nearest?: number;
  statement: string;
  limitation: string;
  /** The instant counted at: a period's end, or the moment of the request. */
  data_as_of: string;
  verified_at: string;
}

/**
 * `GET /metadata/organisation` — what an organisation needs to name a filter
 * and read a response (proposal §12.2, `organization:metadata:read`). The
 * Union's structure and its category labels; never a member or a vehicle.
 */
export interface OrganisationMetadataResponse {
  request_id: string;
  zones: { id: string; name: string }[];
  branches: { id: string; name: string; zone_id: string | null }[];
  vehicle_categories: { code: string; label: string }[];
  verified_at: string;
}

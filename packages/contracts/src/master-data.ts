/**
 * Master data — administered by the Union at runtime, NOT enumerated in code.
 *
 * PRD §23.4 determined that designations, branches, units, vehicle categories, and
 * their status lists are held in an administrable table, seeded from the legacy
 * export and thereafter corrected and extended by the Union through the interface.
 *
 * The values below are therefore **seed constants for the initial migration only**.
 * They must not be turned into a union type, and application code must not branch
 * on them. Doing either would silently re-impose a code deployment on what the
 * Union was promised it could change itself.
 *
 * Correct usage:   category is a foreign key to a `vehicle_category` row.
 * Incorrect usage: `type VehicleCategory = 'TRICYCLE' | 'TRUCKS' | ...`
 */

/**
 * Vehicle categories observed in the legacy export, with their record counts at
 * the time of extraction. Counts are recorded to make the seed auditable against
 * the reconciliation report produced by roadmap item 09.
 *
 * PRD §23.17: this distribution reflects what the previous system held and is an
 * opening baseline, not a complete picture of the Union's fleet. Growth in any
 * category after go-live is expected and is not a data defect.
 */
export const LEGACY_VEHICLE_CATEGORY_SEED = [
  { code: 'BUS_INTRASTATE', label: 'Bus (intrastate)', legacyCount: 1075 },
  { code: 'SHUTTLE_BUS', label: 'Shuttle bus', legacyCount: 951 },
  { code: 'TRUCKS', label: 'Truck', legacyCount: 691 },
  { code: 'OTHERS', label: 'Other', legacyCount: 82 },
  { code: 'BUS_INTERSTATE', label: 'Bus (interstate)', legacyCount: 35 },
  { code: 'TRICYCLE', label: 'Tricycle', legacyCount: 7 },
] as const satisfies readonly MasterDataSeedEntry[];

export interface MasterDataSeedEntry {
  readonly code: string;
  readonly label: string;
  readonly legacyCount?: number;
}

/**
 * The Union's organisational hierarchy, determined at PRD §23.1.
 *
 * Ordered outermost first. Every level is present in the model even where the
 * Union does not presently operate one, so that an administrator's scope remains
 * expressible at any depth (PRD Requirement 6.1).
 */
export const ORGANISATION_LEVELS = [
  'COUNCIL',
  'ZONE',
  'BRANCH',
  'UNIT',
] as const;

export type OrganisationLevel = (typeof ORGANISATION_LEVELS)[number];

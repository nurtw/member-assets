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
 * Re-exported from `@nurtw/domain`, which owns it alongside the placement and
 * path rules that give the ordering meaning. Declaring the levels a second time
 * here would create a list that could drift out of step with the rules enforcing
 * it, and the drift would appear as an authorisation defect rather than a typo.
 */
export {
  ORGANISATION_LEVELS,
  type OrganisationLevel,
} from '@nurtw/domain';

/**
 * The local government areas of Anambra State.
 *
 * Public administrative geography, not personal data. The list was cross-checked
 * against the legacy export, which carries these same twenty-one areas across the
 * 933 vehicles that record one; the remaining 1,908 have none and are imported
 * blank by determination (PRD §23.18).
 *
 * Seeded because the registration form of PRD §7 cannot be completed without it,
 * and because item 09's reconciliation matches imported vehicles against it.
 * `stateName` is carried per row rather than assumed, so a second state council
 * can be onboarded without a migration (§23.2).
 */
export const ANAMBRA_LGA_SEED = [
  { code: 'AGUATA', name: 'Aguata' },
  { code: 'ANAMBRA_EAST', name: 'Anambra East' },
  { code: 'ANAMBRA_WEST', name: 'Anambra West' },
  { code: 'ANAOCHA', name: 'Anaocha' },
  { code: 'AWKA_NORTH', name: 'Awka North' },
  { code: 'AWKA_SOUTH', name: 'Awka South' },
  { code: 'AYAMELUM', name: 'Ayamelum' },
  { code: 'DUNUKOFIA', name: 'Dunukofia' },
  { code: 'EKWUSIGO', name: 'Ekwusigo' },
  { code: 'IDEMILI_NORTH', name: 'Idemili North' },
  { code: 'IDEMILI_SOUTH', name: 'Idemili South' },
  { code: 'IHIALA', name: 'Ihiala' },
  { code: 'NJIKOKA', name: 'Njikoka' },
  { code: 'NNEWI_NORTH', name: 'Nnewi North' },
  { code: 'NNEWI_SOUTH', name: 'Nnewi South' },
  { code: 'OGBARU', name: 'Ogbaru' },
  { code: 'ONITSHA_NORTH', name: 'Onitsha North' },
  { code: 'ONITSHA_SOUTH', name: 'Onitsha South' },
  { code: 'ORUMBA_NORTH', name: 'Orumba North' },
  { code: 'ORUMBA_SOUTH', name: 'Orumba South' },
  { code: 'OYI', name: 'Oyi' },
] as const satisfies readonly { code: string; name: string }[];

export const ANAMBRA_STATE_NAME = 'ANAMBRA';

/**
 * Member designations are seeded as **nothing**, deliberately.
 *
 * PRD §23.4 directs that master data be seeded from the legacy export. The export
 * carries no designation list: `owner_account_role` holds legacy *system account*
 * roles (`VEHICLE_OWNER`, `DIRECTOR`, `AIRS_ADMIN`), which describe the previous
 * software's users rather than a member's approved NURTW designation.
 *
 * Inventing a list would place values carrying the appearance of Union authority
 * in front of an administrator without it, and §23.4 states that this item is not
 * gated on the Union supplying lists in advance. The Union creates them through
 * the interface; an empty administrable list is the honest state.
 */
export const DESIGNATION_SEED: readonly MasterDataSeedEntry[] = [];

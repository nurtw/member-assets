/**
 * Who may amend an imported vehicle, and how often (roadmap item 62, PRD
 * revision 1.20, `QUESTIONS.md` VEH-40).
 *
 * A vehicle brought in with the legacy register is amended by an administrator
 * at any time. Anyone else who may amend vehicles gets one edit of it, shared:
 * the first save locks the vehicle to them. A vehicle recorded through the System
 * is not imported, and is amended as it always was, by `vehicle.update`.
 */
export type ImportedEditRight = 'ANYTIME' | 'ONCE' | 'NONE';

export function importedEditRight(input: {
  /** The vehicle came with the legacy register. */
  imported: boolean;
  /** Holds `vehicle.update_imported` over the vehicle. */
  senior: boolean;
  /** Holds `vehicle.update` over the vehicle. */
  canUpdate: boolean;
  /** Holds `vehicle.record` over the vehicle (a field enumerator). */
  canRecord: boolean;
  /** The one edit has been used. */
  editUsed: boolean;
}): ImportedEditRight {
  if (!input.imported) {
    return input.canUpdate ? 'ANYTIME' : 'NONE';
  }
  if (!input.canUpdate && !input.canRecord) {
    return 'NONE';
  }
  if (input.senior) {
    return 'ANYTIME';
  }
  return input.editUsed ? 'NONE' : 'ONCE';
}

/**
 * What one edit of an imported vehicle may not change: the plate, which every
 * check finds the vehicle by; where it sits in the Union; and who it is linked to.
 * Names the fields of `updateVehicleSchema`.
 */
export const FIELDS_LOCKED_TO_ONE_EDIT = [
  'plateNumberDisplay',
  'organisationId',
  'declaredByMemberId',
] as const;

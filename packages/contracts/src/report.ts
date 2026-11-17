import { z } from 'zod';

/**
 * Counts and lists for officers (roadmap items 64 to 67, `QUESTIONS.md` VEH-41,
 * VEH-42, GOV-25). Every figure is drawn from records the caller may already
 * read, inside the caller's own scope: a count never shows more than a list would.
 */

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD.')
  .refine((value) => {
    // A date parser rolls 30 February forward instead of refusing it.
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a real day.');

// --- Item 64: stickers by origin ---------------------------------------------

/**
 * One kind of sticker. `total` is every one the System holds of this kind and
 * `null` to an officer whose scope is less than the whole Union, because a
 * sticker not yet attached belongs to no branch.
 */
export interface StickerOriginCount {
  total: number | null;
  attached: number;
}

/**
 * Item 64 (`QUESTIONS.md` VEH-41): the dashboard says "imported register" and
 * "added through the System", and never a name or a scheme's code.
 */
export interface StickerOriginCounts {
  imported: StickerOriginCount;
  added: StickerOriginCount;
}

// --- Item 65: vehicles added through the System -------------------------------

export const addedVehiclesQuerySchema = z.object({
  from: day.optional(),
  to: day.optional(),
  q: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AddedVehiclesQuery = z.infer<typeof addedVehiclesQuerySchema>;

/**
 * A row of the new-vehicles list (`QUESTIONS.md` VEH-42). No telephone and no
 * address, ever. `owner` and `chassis` are present only for a holder of
 * `vehicle.read_restricted`, and `declared` only for a holder of `vehicle.declare`.
 */
export interface AddedVehicle {
  id: string;
  plate: string;
  category: string | null;
  organisation: { id: string; name: string };
  recordedBy: string | null;
  recordedAt: string;
  sticker: { attached: boolean; status: string | null };
  declared?: boolean;
  owner?: string | null;
  chassis?: string | null;
}

export interface AddedVehiclesResponse {
  vehicles: AddedVehicle[];
  /** Every vehicle in scope that matches, not only this page. */
  total: number;
}

// --- Item 66: the onboarding report -------------------------------------------

export const onboardingReportQuerySchema = z.object({
  from: day.optional(),
  to: day.optional(),
});

export type OnboardingReportQuery = z.infer<typeof onboardingReportQuerySchema>;

export interface OnboardingReportRow {
  /** A Lagos day, `YYYY-MM-DD`. */
  day: string;
  officer: { id: string; name: string };
  membersRegistered: number;
  vehiclesRecorded: number;
  vehiclesDeclared: number;
  stickersAttached: number;
}

export interface OnboardingReport {
  from: string;
  to: string;
  rows: OnboardingReportRow[];
  totals: {
    membersRegistered: number;
    vehiclesRecorded: number;
    vehiclesDeclared: number;
    stickersAttached: number;
  };
}

// --- Item 67: the counts on Home ------------------------------------------------

export interface MemberCounts {
  active: number;
  suspended: number;
  registeredToday: number;
  registeredLastSevenDays: number;
}

export interface VehicleCounts {
  total: number;
  addedThroughSystem: number;
  addedToday: number;
  /**
   * Vehicles with no sticker attached yet (GOV-25, the record officer's backlog). Every
   * vehicle in scope counts whatever its status, because leaving out the retired would
   * give a status away to an officer who may not see it (VEH-28).
   */
  withoutSticker: number;
  /**
   * Only for a holder of `vehicle.declare` (VEH-28, VEH-43), over the vehicles that holder
   * may see declared. `notDeclared` is the backlog: not declared, and not retired or archived.
   */
  declaration?: { notDeclared: number; declared: number };
}

/** What one officer did on one span of days, by their own hand (GOV-25). */
export interface OwnWorkCounts {
  membersRegistered: number;
  vehiclesRecorded: number;
  stickersAttached: number;
}

/**
 * An officer's own numbers, and no one else's (GOV-25, accepted 17 November 2026): the
 * field enumerator's dashboard. Counts only what the caller did, so it reads no record
 * and needs no scope.
 */
export interface OwnWork {
  today: OwnWorkCounts;
  lastSevenDays: OwnWorkCounts;
}

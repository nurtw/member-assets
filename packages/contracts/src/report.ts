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
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
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

// --- Onboarded vehicles (the owner's direction of 18 November 2026) ------------

/**
 * Vehicles onboarded: the total first, and beneath it how many came with the imported
 * register (`imported`, "legacy" on the screens) and how many were added through the
 * System (`added`, "new"). A vehicle is onboarded when its first sticker is attached,
 * and the officer who attached that sticker onboarded it. Declaring is not onboarding.
 */
export interface OnboardedVehicles {
  total: number;
  imported: number;
  added: number;
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
  vehiclesOnboarded: OnboardedVehicles;
  membersRegistered: number;
  /** Vehicles added through the System, whether or not a sticker followed. */
  vehiclesRecorded: number;
}

export interface OnboardingReport {
  from: string;
  to: string;
  rows: OnboardingReportRow[];
  totals: {
    vehiclesOnboarded: OnboardedVehicles;
    membersRegistered: number;
    vehiclesRecorded: number;
  };
}

// --- Item 67: the counts on Home ------------------------------------------------

export interface MemberCounts {
  /** Every member registered through the System, in scope. The imported are not. */
  registered: number;
  registeredToday: number;
  active: number;
  suspended: number;
}

export interface VehicleCounts {
  /** Every vehicle in scope that has had a sticker attached, whatever its status now. */
  onboarded: OnboardedVehicles;
  /** Those whose first sticker was attached today (Lagos). */
  onboardedToday: OnboardedVehicles;
  /** Onboarded vehicles with no member (driver) linked. */
  onboardedWithoutMember: number;
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

export const ownWorkQuerySchema = z.object({
  /** The day to show beside the totals. Today (Lagos) when absent. */
  day: day.optional(),
});

export type OwnWorkQuery = z.infer<typeof ownWorkQuerySchema>;

/** What one officer did, by their own hand. */
export interface OwnWorkCounts {
  vehiclesOnboarded: OnboardedVehicles;
  membersRegistered: number;
}

/**
 * An officer's own numbers, and no one else's (GOV-25; the owner's direction of
 * 18 November 2026): the field enumerator's dashboard. Counts only what the caller did,
 * so it reads no one else's record and needs no scope.
 */
export interface OwnWork {
  /** The Lagos day the officer's account was made: the totals run from it. */
  since: string;
  total: OwnWorkCounts;
  /** The day asked for, `YYYY-MM-DD`. */
  day: string;
  onDay: OwnWorkCounts;
  /** Vehicles the officer added that have no sticker yet, so are not onboarded. */
  awaitingSticker: number;
}

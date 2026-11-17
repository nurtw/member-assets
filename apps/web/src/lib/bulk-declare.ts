import type { BulkSkipReason, VehicleSummary } from "@nurtw/contracts";

/**
 * Bulk declaration (item 63, `QUESTIONS.md` VEH-38). Pure rules for the vehicle
 * list's ticks. The API decides; this only offers what it would accept.
 */

/**
 * A row may be ticked when its status is shown to the officer, it has not been
 * declared, and it has not left the register. A row whose status is absent (the
 * officer may not see it) is never offered: the screen never guesses.
 */
export function isTickable(
  vehicle: Pick<VehicleSummary, "status" | "declaredAt">,
): boolean {
  return (
    vehicle.status !== undefined &&
    vehicle.declaredAt === null &&
    vehicle.status !== "RETIRED" &&
    vehicle.status !== "ARCHIVED"
  );
}

/** Splits a selection into requests of at most `size`, keeping the order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

const SKIP_WORDS: Record<BulkSkipReason, string> = {
  ALREADY_DECLARED: "already declared",
  LEFT_REGISTER: "retired or archived",
  PLATE_ACTIVE_ELSEWHERE: "the plate already has an active declaration",
  NOT_FOUND: "not found, or outside your area",
  FAILED: "could not be declared; try it again on its own",
};

export function skipWords(reason: BulkSkipReason): string {
  return SKIP_WORDS[reason];
}

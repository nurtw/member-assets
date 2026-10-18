import { ninSchema } from "@nurtw/contracts";

/**
 * A member's NIN on the screens (item 44; `QUESTIONS.md` MEM-19; PRD
 * Requirement 7.4).
 *
 * The API seals a NIN and never sends one back, so a screen only ever says
 * whether one is recorded and, to an officer who may read the sensitive part
 * of a record, its last four digits. Nothing here can show more, because
 * nothing more arrives.
 */

/** Whether what was typed is a NIN, by the API's own rule. The API still decides. */
export function isNin(typed: string): boolean {
  return ninSchema.safeParse(typed).success;
}

/** How a recorded NIN is spoken of: never the number, at most its end. */
export function ninStatement(state: {
  ninRecorded: boolean;
  ninLastFour?: string | null;
}): string {
  if (!state.ninRecorded) {
    return "Not recorded";
  }
  return state.ninLastFour
    ? `Recorded, ending ${state.ninLastFour}`
    : "Recorded";
}

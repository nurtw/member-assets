/**
 * The vehicle declaration lifecycle.
 *
 * PRD §9 — six states: Pending, Active, Suspended, Retired, Disputed,
 * Archived. Domain rule 5 — history is preserved: nothing here deletes, and
 * a terminal state is reached rather than erased.
 *
 * Expressed as an explicit transition table, matching `membership/status.ts`
 * and `card/status.ts` — "which transitions are legal" is precisely the rule
 * that gets re-implemented slightly differently in a service six months
 * later.
 */

export const DECLARATION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
  'DISPUTED',
  'ARCHIVED',
] as const;

export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

export class InvalidDeclarationTransitionError extends Error {
  override readonly name = 'InvalidDeclarationTransitionError';
}

/**
 * `PENDING` is a reachable state in the enum but no code path in item 07
 * creates one: `declare()` resolves a new plate directly to `ACTIVE`, or to
 * `DISPUTED` when an `ACTIVE` declaration already exists for that plate
 * (PRD §23.9 — the competing claim is refused as active but recorded, not
 * dropped). Nothing in PRD §9 describes a review step between declaring and
 * being active, and `vehicle.declare` is already the tightly-held,
 * deliberate act Requirement 9.5 asks for — adding an unrequested second
 * confirmation step would be process ceremony nobody asked for. `PENDING`'s
 * transitions are defined anyway, matching what `declare()` would choose, so
 * the table stays coherent for any future in-place use (see HANDOFF.md).
 *
 * `DISPUTED -> ACTIVE` (upholding a disputed claim) is deliberately absent.
 * Doing so would require demoting whichever record currently holds `ACTIVE`
 * for that plate — a policy decision (who decides, on what evidence) that
 * QUESTIONS.md VEH-07 leaves open. `DISPUTED -> ARCHIVED` (dismissing a
 * claim) needs no such judgement about the other record and is the only
 * dispute-resolution path this item builds.
 *
 * `RETIRED` and `ARCHIVED` are terminal. A vehicle returning to service is a
 * new declaration, not a resurrected row — reusing one would corrupt the
 * timeline domain rule 5 exists to preserve.
 */
const DECLARATION_TRANSITIONS: Readonly<
  Record<DeclarationStatus, readonly DeclarationStatus[]>
> = {
  PENDING: ['ACTIVE', 'DISPUTED', 'ARCHIVED'],
  ACTIVE: ['SUSPENDED', 'RETIRED'],
  SUSPENDED: ['ACTIVE', 'RETIRED'],
  RETIRED: [],
  DISPUTED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionDeclaration(
  from: DeclarationStatus,
  to: DeclarationStatus,
): boolean {
  return (DECLARATION_TRANSITIONS[from] ?? []).includes(to);
}

export function assertDeclarationTransition(
  from: DeclarationStatus,
  to: DeclarationStatus,
): void {
  if (canTransitionDeclaration(from, to)) {
    return;
  }
  const allowed = DECLARATION_TRANSITIONS[from] ?? [];
  throw new InvalidDeclarationTransitionError(
    allowed.length === 0
      ? `A declaration in ${from} is final and cannot move to ${to}.`
      : `A declaration cannot move from ${from} to ${to}. Permitted: ${allowed.join(', ')}.`,
  );
}

/** Statuses from which no further transition is possible. */
export function isDeclarationFinal(status: DeclarationStatus): boolean {
  return DECLARATION_TRANSITIONS[status].length === 0;
}

/**
 * Whether a declaration in this status represents a live, currently-valid
 * association between the vehicle and the Union — consulted wherever a
 * caller needs to know "is this plate presently declared" rather than merely
 * "does a row exist for it" (item 08's sticker issuance, item 10's
 * verification).
 */
export function isDeclarationLive(status: DeclarationStatus): boolean {
  return status === 'ACTIVE';
}

/**
 * The vehicle declaration lifecycle.
 *
 * PRD §9 — six states: Pending, Active, Suspended, Retired, Disputed,
 * Archived. Domain rule 5 — history is preserved: nothing here deletes, and
 * a terminal state is reached rather than erased. Revision 1.2 (§9A) adds a
 * seventh, `ON_RECORD` — see the note below.
 *
 * Expressed as an explicit transition table, matching `membership/status.ts`
 * and `card/status.ts` — "which transitions are legal" is precisely the rule
 * that gets re-implemented slightly differently in a service six months
 * later.
 */

export const DECLARATION_STATUSES = [
  'ON_RECORD',
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
  // ARCHITECTURE.md Decision 6.5 — a migrated vehicle starts here, never at
  // ACTIVE. The only way out is `vehicle.declare` PROMOTING this same row
  // (stamping declaredAt/declaredByMemberId) to ACTIVE — not creating a
  // second row for the same physical vehicle. No path to DISPUTED: a
  // migrated record has no prior ACTIVE declaration to compete with by
  // definition, so a plate match here is always a promotion, never a
  // conflict.
  //
  // Item 57 (the owner's direction of 21 October 2026): a vehicle need not
  // be declared to be suspended or retired, now that an active sticker is
  // what makes it verify. Lifting a suspension returns it to what it was
  // (`statusOnLifting`): declaring stays the one way to ACTIVE.
  ON_RECORD: ['ACTIVE', 'SUSPENDED', 'RETIRED'],
  PENDING: ['ACTIVE', 'DISPUTED', 'ARCHIVED'],
  ACTIVE: ['SUSPENDED', 'RETIRED'],
  SUSPENDED: ['ACTIVE', 'ON_RECORD', 'RETIRED'],
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

/**
 * Item 57 — a vehicle in one of these does not verify, whatever its sticker:
 * an officer suspended it, it is retired, its claim is disputed, or it is
 * archived. Not being declared yet (`ON_RECORD`, `PENDING`) withholds
 * nothing: declaring only counts a vehicle in the external total.
 */
export const WITHHELD_STATUSES: readonly DeclarationStatus[] = [
  'SUSPENDED',
  'RETIRED',
  'DISPUTED',
  'ARCHIVED',
];

export function isWithheld(status: DeclarationStatus): boolean {
  return WITHHELD_STATUSES.includes(status);
}

/**
 * Where a suspended vehicle goes when its suspension is lifted (item 57):
 * back to `ACTIVE` if it was ever declared, otherwise back to `ON_RECORD`.
 * Lifting a suspension never declares a vehicle, so never counts it.
 */
export function statusOnLifting(
  declared: boolean,
): Extract<DeclarationStatus, 'ACTIVE' | 'ON_RECORD'> {
  return declared ? 'ACTIVE' : 'ON_RECORD';
}

/**
 * What an officer's status change lands on (item 57). Declaring is its own
 * act, with what it requires (`vehicle.declare`'s promotion), so a status
 * change never takes a vehicle from `ON_RECORD` to `ACTIVE`. Asking for
 * `ACTIVE` on a suspended vehicle lifts the suspension, back to what the
 * vehicle was (`statusOnLifting`). The transition table still decides the
 * rest.
 */
export function statusChangeTarget(
  from: DeclarationStatus,
  requested: Extract<DeclarationStatus, 'ACTIVE' | 'SUSPENDED' | 'RETIRED'>,
  declared: boolean,
): DeclarationStatus {
  if (requested === 'ACTIVE' && from === 'SUSPENDED') {
    return statusOnLifting(declared);
  }
  if (requested === 'ACTIVE' && from === 'ON_RECORD') {
    throw new InvalidDeclarationTransitionError(
      'A vehicle on record becomes ACTIVE only by being declared.',
    );
  }
  return requested;
}

/**
 * Statuses in which a row still stands for the physical vehicle, so that
 * recording the same plate again would create a second record for one vehicle
 * (PRD Requirement 9.7, ARCHITECTURE.md Decision 6.6).
 *
 * Wider than `isDeclarationLive` on purpose: that asks "is this plate presently
 * declared", this asks "does a record already stand for it". `RETIRED` and
 * `ARCHIVED` are history — a retired vehicle returning to service is recorded
 * afresh, the same reasoning that makes them terminal above.
 */
export const RECORD_BLOCKING_STATUSES: readonly DeclarationStatus[] = [
  'ON_RECORD',
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DISPUTED',
];

export function blocksNewRecord(status: DeclarationStatus): boolean {
  return RECORD_BLOCKING_STATUSES.includes(status);
}

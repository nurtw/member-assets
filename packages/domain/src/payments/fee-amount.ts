/**
 * Which amount a fee type charges (PRD Requirement 27.1, revision 1.3,
 * `QUESTIONS.md` PAY-14).
 *
 * The levy is priced per route type. A vehicle whose route type has its own
 * amount is charged that; otherwise — a route type the Union has not priced
 * separately, or a legacy vehicle with no route type yet — the fee type's
 * default amount applies. Never an error: a due must always resolve to exactly
 * one figure, or it cannot be charged, shown, or allocated against.
 *
 * Kobo in, kobo out (Requirement 27.2 — money is integer kobo, never a float).
 */
export function resolveFeeAmountKobo(input: {
  defaultAmountKobo: number;
  prices: readonly { routeTypeId: string; amountKobo: number }[];
  routeTypeId: string | null;
}): number {
  if (input.routeTypeId) {
    const price = input.prices.find(
      (candidate) => candidate.routeTypeId === input.routeTypeId,
    );
    if (price) {
      return price.amountKobo;
    }
  }
  return input.defaultAmountKobo;
}

/** One amount a fee type has had, and when it began to apply (item 22). */
export interface FeeAmountChange {
  /** `null` for the fee type's default amount. */
  routeTypeId: string | null;
  amountKobo: number;
  effectiveFrom: Date;
}

/**
 * The amount that was in force on a given date (PRD Requirement 27.13).
 *
 * `resolveFeeAmountKobo` answers "what does this cost now", which is right for
 * starting a payment. A monthly levy needs "what did the month of March cost":
 * the amount in force when that month fell due. Asked of today's prices, a
 * levy rise would re-price every month already paid and show a shortfall on
 * each.
 *
 * `history` is append-only and holds a row per change. A key with no rows has
 * never changed, so its current amount has applied from the beginning. The
 * first change to a key also records the amount it replaced, so that reading
 * holds for everything before it.
 *
 * A route type priced for the first time part-way through has no row before
 * that date; before it, the default amount applied, exactly as it does now for
 * a route type with no price of its own.
 */
export function resolveFeeAmountAtKobo(input: {
  at: Date;
  routeTypeId: string | null;
  current: {
    defaultAmountKobo: number;
    prices: readonly { routeTypeId: string; amountKobo: number }[];
  };
  history: readonly FeeAmountChange[];
}): number {
  const inForce = (key: string | null): FeeAmountChange | undefined =>
    input.history
      .filter(
        (change) =>
          change.routeTypeId === key &&
          change.effectiveFrom.getTime() <= input.at.getTime(),
      )
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];

  if (input.routeTypeId) {
    const everChanged = input.history.some(
      (change) => change.routeTypeId === input.routeTypeId,
    );
    if (everChanged) {
      const change = inForce(input.routeTypeId);
      if (change) {
        return change.amountKobo;
      }
      // Not yet priced separately on that date: the default applied.
    } else {
      const price = input.current.prices.find(
        (candidate) => candidate.routeTypeId === input.routeTypeId,
      );
      if (price) {
        return price.amountKobo;
      }
    }
  }

  const defaultEverChanged = input.history.some(
    (change) => change.routeTypeId === null,
  );
  if (!defaultEverChanged) {
    return input.current.defaultAmountKobo;
  }
  const change = inForce(null);
  if (change) {
    return change.amountKobo;
  }
  // Before the first recorded default: the baseline row is effective from the
  // epoch, so this is unreachable with history the service wrote. The earliest
  // known amount is the honest answer if it ever is reached.
  return [...input.history]
    .filter((candidate) => candidate.routeTypeId === null)
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0]!
    .amountKobo;
}

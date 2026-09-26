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

/**
 * What a dedicated-account transfer is worth to NURTW (PRD Requirement 27.7,
 * `QUESTIONS.md` PAY-11 — item 23).
 *
 * A dedicated account is assigned with the NURTW subaccount, so Paystack
 * splits every transfer into it at the subaccount's **fixed percentage**: the
 * contractor's account takes that share and bears Paystack's fee out of it,
 * and NURTW settles the rest. The ₦200 cap and the fee-on-top of Requirement
 * 27.3 cannot apply to a transfer the payer starts, so the member is credited
 * with what NURTW receives and is told how much to send to cover a due.
 *
 * The percentage is a setting with up to two decimal places. It is worked in
 * basis points so the arithmetic stays in integers (Requirement 27.2: money
 * is integer kobo, never a float).
 */

/** `1.5` per cent is 150 basis points. Throws on a value Paystack could not apply. */
export function percentageToBasisPoints(percentage: number): number {
  const basisPoints = Math.round(percentage * 100);
  if (
    !Number.isFinite(percentage) ||
    basisPoints < 0 ||
    basisPoints >= 10_000 ||
    Math.abs(basisPoints - percentage * 100) > 1e-6
  ) {
    throw new RangeError(
      `A contractor percentage must be at least 0 and below 100, to two decimal places; got ${percentage}.`,
    );
  }
  return basisPoints;
}

/**
 * NURTW's share of a transfer. The contractor's share is rounded **up** to the
 * kobo, so a member is never credited with more than NURTW actually receives.
 *
 * Used only when Paystack's own split figure is missing from the verified
 * transaction: the figure Paystack reports is what really settled.
 */
export function dedicatedCreditKobo(
  amountKobo: number,
  contractorPercentage: number,
): number {
  const basisPoints = percentageToBasisPoints(contractorPercentage);
  const contractorShare = Math.floor(
    (amountKobo * basisPoints + 9_999) / 10_000,
  );
  return Math.max(0, amountKobo - contractorShare);
}

/**
 * The smallest whole-naira amount whose NURTW share covers `creditKobo`: what
 * the member is told to send to clear a due. Whole naira, because nobody can
 * send kobo from a POS terminal or a banking app's quick-transfer screen.
 */
export function amountToSendKobo(
  creditKobo: number,
  contractorPercentage: number,
): number {
  if (creditKobo <= 0) {
    return 0;
  }
  const basisPoints = percentageToBasisPoints(contractorPercentage);
  // A true lower bound, rounded up to the naira: nothing below it can be enough.
  const lowerBound = Math.ceil((creditKobo * 10_000) / (10_000 - basisPoints));
  let amount = Math.ceil(lowerBound / 100) * 100;
  while (dedicatedCreditKobo(amount, contractorPercentage) < creditKobo) {
    amount += 100;
  }
  return amount;
}

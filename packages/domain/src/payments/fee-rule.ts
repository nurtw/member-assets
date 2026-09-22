/**
 * The processing-fee rule (PRD Requirement 27.3, `QUESTIONS.md` PAY-10).
 *
 * The payer bears both the contractor's fee and Paystack's own fee. The
 * contractor's fee is 0.5 per cent of the due, capped at ₦200. The total
 * charged is the smallest whole-naira amount such that, after Paystack takes
 * its cut of *that total*, what is left still covers the due plus the
 * contractor's fee — so neither the Union nor the contractor is ever short.
 *
 * Every parameter here is a runtime setting in the System (Paystack changes
 * its own pricing from time to time); this function takes them as arguments
 * rather than hard-coding them, so the settings-backed caller can pass
 * whatever is currently configured.
 *
 * All amounts are naira, not kobo, to match the worked table in PAY-10
 * exactly — the caller converts to kobo at the database boundary.
 */

export interface PaystackFeeSchedule {
  /** e.g. 0.015 for 1.5%. */
  readonly percentage: number;
  /** Flat fee added on top of the percentage, e.g. 100. */
  readonly flatFee: number;
  /** The flat fee is waived below this amount, e.g. 2500. */
  readonly flatFeeWaivedBelow: number;
  /** The total fee never exceeds this amount, e.g. 2000. */
  readonly cap: number;
}

export interface ContractorFeeRule {
  /** e.g. 0.005 for 0.5%. */
  readonly percentage: number;
  /** The contractor's fee never exceeds this amount, e.g. 200. */
  readonly cap: number;
}

export interface FeeCalculationInput {
  readonly due: number;
  readonly contractorFee: ContractorFeeRule;
  readonly paystackFee: PaystackFeeSchedule;
}

export interface FeeCalculationResult {
  readonly due: number;
  /** The contractor's fee, shown to the payer as its own line. */
  readonly contractorFee: number;
  /** What Paystack is expected to take out of `totalCharged`. */
  readonly paystackFee: number;
  /** The amount the payer is asked to pay. */
  readonly totalCharged: number;
}

const DEFAULT_PAYSTACK_FEE_SCHEDULE: PaystackFeeSchedule = {
  percentage: 0.015,
  flatFee: 100,
  flatFeeWaivedBelow: 2500,
  cap: 2000,
};

const DEFAULT_CONTRACTOR_FEE_RULE: ContractorFeeRule = {
  percentage: 0.005,
  cap: 200,
};

/**
 * Truncates to the kobo below, matching Paystack's own display of its fee
 * (PAY-10's worked table shows ₦15.31 for an exact ₦15.315, not ₦15.32) —
 * a small epsilon guards against float noise pushing an exact value down a
 * cent before truncation.
 */
function roundToKobo(amount: number): number {
  return Math.floor(amount * 100 + 1e-9) / 100;
}

function paystackFeeOn(total: number, schedule: PaystackFeeSchedule): number {
  const flat = total < schedule.flatFeeWaivedBelow ? 0 : schedule.flatFee;
  const fee = total * schedule.percentage + flat;
  return Math.min(fee, schedule.cap);
}

export function calculateContractorFee(
  due: number,
  rule: ContractorFeeRule = DEFAULT_CONTRACTOR_FEE_RULE,
): number {
  return roundToKobo(Math.min(due * rule.percentage, rule.cap));
}

/**
 * The smallest whole-naira total such that `total - paystackFeeOn(total)`
 * covers `due + contractorFee`. Paystack's fee is non-decreasing in `total`
 * below its cap and constant at the cap above it, so the amount owed by the
 * payer net of Paystack's fee is non-decreasing in `total` throughout —
 * a linear scan upward from `due + contractorFee` always finds the smallest
 * satisfying whole-naira total, and reaches it quickly because each step
 * closes nearly all of the remaining gap.
 */
function solveTotalCharged(
  amountToCover: number,
  schedule: PaystackFeeSchedule,
): number {
  let total = Math.ceil(amountToCover);
  for (;;) {
    const net = total - paystackFeeOn(total, schedule);
    if (net >= amountToCover - 1e-9) {
      return total;
    }
    total += 1;
  }
}

export function calculateFees(
  input: FeeCalculationInput,
): FeeCalculationResult {
  if (input.due <= 0) {
    throw new RangeError('due must be a positive amount');
  }

  const contractorFee = calculateContractorFee(input.due, input.contractorFee);
  const amountToCover = input.due + contractorFee;
  const totalCharged = solveTotalCharged(amountToCover, input.paystackFee);
  const paystackFee = roundToKobo(paystackFeeOn(totalCharged, input.paystackFee));

  return {
    due: input.due,
    contractorFee,
    paystackFee,
    totalCharged,
  };
}

export const DEFAULT_FEE_SCHEDULES = {
  contractorFee: DEFAULT_CONTRACTOR_FEE_RULE,
  paystackFee: DEFAULT_PAYSTACK_FEE_SCHEDULE,
} as const;

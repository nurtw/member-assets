/**
 * Payments (PRD §27).
 */

import { z } from 'zod';

const uuid = z.uuid('A valid identifier is required.');

export const initiatePaymentSchema = z.object({
  feeTypeCode: z.string().trim().min(1, 'A fee type is required.'),
  subjectType: z.enum(['member', 'vehicle']),
  subjectId: uuid,
  payerEmail: z.email('A valid email is required.'),
  callbackUrl: z.url().optional(),
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

/**
 * PRD Requirement 27.12 — the account name is never accepted from the
 * caller; the service resolves it from Paystack and returns it for
 * confirmation before saving.
 */
export const setSettlementAccountSchema = z.object({
  bankCode: z.string().trim().min(1, 'A bank is required.'),
  bankName: z.string().trim().min(1, 'A bank name is required.'),
  accountNumber: z
    .string()
    .trim()
    .min(10, 'A valid account number is required.')
    .max(10, 'A valid account number is required.'),
  password: z.string().min(1, 'Your password is required to make this change.'),
  reason: z.string().trim().min(1, 'A reason is required for this change.'),
});
export type SetSettlementAccountInput = z.infer<
  typeof setSettlementAccountSchema
>;

export const refundPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required for a refund.'),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

// --- Fee-type settings (Requirements 27.1–27.2, revision 1.3) ---------------

/**
 * Money is integer kobo end to end (Requirement 27.2). A settings screen
 * converts naira to kobo before sending; the API never accepts a float.
 */
const amountKobo = z
  .number()
  .int('An amount must be a whole number of kobo.')
  .positive('An amount must be greater than zero.')
  .max(100_000_000_00, 'That amount is implausibly large.');

/** Every change to a fee type is audited with a mandatory reason (27.2). */
const reason = z
  .string()
  .trim()
  .min(4, 'A reason is required for this change.')
  .max(1000);

/**
 * Amends a fee type's default amount, label, or whether it is offered. The
 * code, recurrence, charged-against, and settlement are fixed once a fee type
 * exists — changing any of those would silently change the meaning of every
 * payment already made against it.
 */
export const updateFeeTypeSchema = z
  .object({
    label: z.string().trim().min(2).max(120).optional(),
    amountKobo: amountKobo.optional(),
    active: z.boolean().optional(),
    reason,
  })
  .refine(
    (value) =>
      value.label !== undefined ||
      value.amountKobo !== undefined ||
      value.active !== undefined,
    { message: 'Change at least one of the label, the amount, or whether it is active.' },
  );
export type UpdateFeeTypeInput = z.infer<typeof updateFeeTypeSchema>;

/**
 * Sets a fee type's amount for one route type (PRD Requirement 27.1, PAY-14).
 * The levy is priced this way; a route type without its own amount is charged
 * the fee type's default.
 */
export const setFeeTypePriceSchema = z.object({ amountKobo, reason });
export type SetFeeTypePriceInput = z.infer<typeof setFeeTypePriceSchema>;

/** A fee type as the settings screen shows it. */
export interface FeeTypeSummary {
  code: string;
  label: string;
  /** The default amount, charged where no route-type amount applies. */
  amountKobo: number;
  recurrence: string;
  chargedAgainst: string;
  settlement: string;
  active: boolean;
  isPlaceholder: boolean;
  prices: {
    routeType: { id: string; code: string; label: string };
    amountKobo: number;
  }[];
}

/**
 * Dues status (PRD Requirement 27.8, item 22). **Internal only**: it appears
 * in no external API response, on no public page, and in no disclosure
 * profile. These types must never be reachable from an external contract.
 */
export type DuesStatusCode = 'NOT_DUE' | 'PAID' | 'OWED' | 'IN_ARREARS';

/** One month of levy that is not fully paid. */
export interface UnpaidLevyMonth {
  /** `2026-11`. */
  month: string;
  dueOn: string;
  amountKobo: number;
  paidKobo: number;
  outstandingKobo: number;
}

/** `GET /vehicles/:id/dues` — the levy on one vehicle (Requirement 27.13). */
export interface VehicleDues {
  vehicleId: string;
  status: DuesStatusCode;
  /** When the levy first fell, or will fall, due; `null` until onboarded. */
  firstDueOn: string | null;
  /** How many months have fallen due so far. */
  monthsDue: number;
  /** The months not fully paid, oldest first. */
  unpaidMonths: UnpaidLevyMonth[];
  outstandingKobo: number;
  /** Paid beyond what has fallen due, held against the next month. */
  creditKobo: number;
  nextDueOn: string | null;
  /** What one month costs this vehicle at today's amounts. */
  currentAmountKobo: number;
}

/** `GET /members/:id/dues` — the membership fee (Requirement 27.13). */
export interface MemberDues {
  memberId: string;
  /** Never `IN_ARREARS`: one fee is outstanding at most (PAY-18). */
  status: DuesStatusCode;
  firstDueOn: string | null;
  coveredUntil: string | null;
  owedSince: string | null;
  /**
   * Why nothing is due, when that is not simply "paid up": the member is not
   * yet approved, or was migrated and no go-live date has been set (GOV-11).
   */
  notStartedBecause: 'NOT_APPROVED' | 'NO_GO_LIVE_DATE' | null;
  currentAmountKobo: number;
}

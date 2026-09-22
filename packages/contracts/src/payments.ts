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

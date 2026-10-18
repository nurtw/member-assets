import type { Prisma } from '@prisma/client';

/** What a payment confirmation announces. */
export type PaymentNoticeSource =
  | { type: 'payment'; id: string }
  | { type: 'dedicated_account_transfer'; id: string };

/**
 * Queues a member's payment confirmation (item 45, "no message, not paid").
 * Call it inside the transaction that records the credit: a credit that rolls
 * back queues nothing, and one that commits is announced even if the provider
 * is down at that moment.
 *
 * One message per source: the partial unique index
 * `sms_message_one_per_source` makes a replayed webhook or a second
 * confirmation queue none (`skipDuplicates` is `ON CONFLICT DO NOTHING`).
 *
 * A plain function rather than a service, so the payments module writes the
 * outbox without depending on the notifications module, which reads dues from
 * the payments module when it sends.
 */
export async function queuePaymentNotice(
  tx: Prisma.TransactionClient,
  memberId: string,
  source: PaymentNoticeSource,
): Promise<void> {
  await tx.smsMessage.createMany({
    data: [
      {
        memberId,
        purpose: 'PAYMENT_RECEIVED',
        sourceType: source.type,
        sourceId: source.id,
      },
    ],
    skipDuplicates: true,
  });
}

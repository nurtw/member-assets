-- Item 45 (PRD Requirement 27.14, revision 1.18): text messages to members.
-- An outbox written in the same transaction as the credit it announces, and
-- the versioned words of each message.

-- CreateEnum
CREATE TYPE "SmsPurpose" AS ENUM ('PAYMENT_RECEIVED', 'TEST');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'UNSENDABLE', 'NOT_SENT', 'EXPIRED');

-- CreateTable
CREATE TABLE "sms_message" (
    "id" UUID NOT NULL,
    "member_id" UUID,
    "purpose" "SmsPurpose" NOT NULL,
    "source_type" TEXT,
    "source_id" UUID,
    "resend_of_id" UUID,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient_last_four" TEXT,
    "text" TEXT,
    "template_key" TEXT,
    "template_version" INTEGER,
    "provider_message_id" TEXT,
    "provider_status" TEXT,
    "failure" TEXT,
    "requested_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "sms_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_template" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_message_provider_message_id_key" ON "sms_message"("provider_message_id");

-- CreateIndex
CREATE INDEX "sms_message_member_id_created_at_idx" ON "sms_message"("member_id", "created_at");

-- CreateIndex
CREATE INDEX "sms_message_status_next_attempt_at_idx" ON "sms_message"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "sms_message_purpose_source_type_source_id_idx" ON "sms_message"("purpose", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_template_key_version_key" ON "sms_template"("key", "version");

-- AddForeignKey
ALTER TABLE "sms_message" ADD CONSTRAINT "sms_message_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_message" ADD CONSTRAINT "sms_message_resend_of_id_fkey" FOREIGN KEY ("resend_of_id") REFERENCES "sms_message"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- One message per source (a payment, or a dedicated-account transfer), so a
-- replayed webhook queues no second. A message an officer asks to send again
-- names the one it repeats, and is not counted. Prisma cannot express a
-- partial index; the schema carries a plain one on the same columns.
CREATE UNIQUE INDEX "sms_message_one_per_source" ON "sms_message" ("purpose", "source_type", "source_id")
  WHERE "resend_of_id" IS NULL AND "source_id" IS NOT NULL;

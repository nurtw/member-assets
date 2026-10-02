-- CreateEnum
CREATE TYPE "DedicatedCreditBasis" AS ENUM ('PAYSTACK_SPLIT', 'PERCENTAGE_SETTING');

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "dedicated_transfer_id" UUID,
ADD COLUMN     "due_period" TEXT;

-- CreateTable
CREATE TABLE "dedicated_account" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "paystack_customer_code" TEXT NOT NULL,
    "paystack_account_id" INTEGER NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dedicated_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dedicated_account_transfer" (
    "id" UUID NOT NULL,
    "dedicated_account_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "paystack_reference" TEXT NOT NULL,
    "amount_kobo" INTEGER NOT NULL,
    "credit_kobo" INTEGER NOT NULL,
    "credit_basis" "DedicatedCreditBasis" NOT NULL,
    "paystack_fee_kobo" INTEGER,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dedicated_account_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dedicated_account_paystack_account_id_key" ON "dedicated_account"("paystack_account_id");

-- CreateIndex
CREATE INDEX "dedicated_account_member_id_idx" ON "dedicated_account"("member_id");

-- CreateIndex
CREATE INDEX "dedicated_account_paystack_customer_code_idx" ON "dedicated_account"("paystack_customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "dedicated_account_transfer_paystack_reference_key" ON "dedicated_account_transfer"("paystack_reference");

-- CreateIndex
CREATE INDEX "dedicated_account_transfer_member_id_idx" ON "dedicated_account_transfer"("member_id");

-- CreateIndex
CREATE INDEX "dedicated_account_transfer_dedicated_account_id_idx" ON "dedicated_account_transfer"("dedicated_account_id");

-- CreateIndex
CREATE INDEX "payment_dedicated_transfer_id_idx" ON "payment"("dedicated_transfer_id");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_dedicated_transfer_id_fkey" FOREIGN KEY ("dedicated_transfer_id") REFERENCES "dedicated_account_transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dedicated_account" ADD CONSTRAINT "dedicated_account_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dedicated_account" ADD CONSTRAINT "dedicated_account_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dedicated_account_transfer" ADD CONSTRAINT "dedicated_account_transfer_dedicated_account_id_fkey" FOREIGN KEY ("dedicated_account_id") REFERENCES "dedicated_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dedicated_account_transfer" ADD CONSTRAINT "dedicated_account_transfer_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one ACTIVE dedicated account per member, while deactivated ones stay
-- as history (CLAUDE.md "History is preserved"). Partial, so Prisma cannot
-- express it in the schema; preserve it across future migrations.
CREATE UNIQUE INDEX "dedicated_account_one_active_per_member"
  ON "dedicated_account" ("member_id") WHERE "active";

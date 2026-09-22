-- CreateEnum
CREATE TYPE "FeeRecurrence" AS ENUM ('ONE_OFF', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ChargedAgainst" AS ENUM ('MEMBER', 'VEHICLE');

-- CreateEnum
CREATE TYPE "FeeSettlement" AS ENUM ('CONTRACTOR_ONLY', 'SPLIT_WITH_NURTW');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('LINK', 'DEDICATED_ACCOUNT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "fee_type" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount_kobo" INTEGER NOT NULL,
    "recurrence" "FeeRecurrence" NOT NULL,
    "charged_against" "ChargedAgainst" NOT NULL,
    "settlement" "FeeSettlement" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_placeholder" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "fee_type_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "due_kobo" INTEGER NOT NULL,
    "contractor_fee_kobo" INTEGER NOT NULL,
    "total_charged_kobo" INTEGER NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paystack_reference" TEXT NOT NULL,
    "paystack_fee_kobo" INTEGER,
    "initiated_by_user_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_kobo" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_account" (
    "id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "subaccount_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_type_code_key" ON "fee_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_paystack_reference_key" ON "payment"("paystack_reference");

-- CreateIndex
CREATE INDEX "payment_subject_type_subject_id_idx" ON "payment"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE INDEX "payment_fee_type_id_idx" ON "payment"("fee_type_id");

-- CreateIndex
CREATE INDEX "ledger_entry_payment_id_idx" ON "ledger_entry"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_account_subaccount_code_key" ON "settlement_account"("subaccount_code");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

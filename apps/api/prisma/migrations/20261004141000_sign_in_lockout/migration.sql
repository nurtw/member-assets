-- Item 28: a lock on repeated failed sign-ins, and a second-factor secret
-- held pending until a code confirms it.
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "failed_sign_in_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfa_pending_secret" TEXT,
ADD COLUMN     "sign_in_locked_until" TIMESTAMP(3);


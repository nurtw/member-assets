-- AlterTable
-- ARCHITECTURE.md Decision 6.5 — an ON_RECORD vehicle has never been
-- declared, so declared_at must be able to hold no value.
ALTER TABLE "vehicle" ALTER COLUMN "declared_at" DROP NOT NULL;

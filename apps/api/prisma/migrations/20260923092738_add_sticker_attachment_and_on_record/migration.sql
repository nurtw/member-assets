-- AlterEnum
ALTER TYPE "DeclarationStatus" ADD VALUE 'ON_RECORD';

-- AlterTable
ALTER TABLE "sticker" ALTER COLUMN "vehicle_id" DROP NOT NULL,
ALTER COLUMN "plate_number_at_issue" DROP NOT NULL,
ADD COLUMN "registered_plate_normalized" TEXT,
ADD COLUMN "attached_at" TIMESTAMP(3),
ADD COLUMN "attachment_payment_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "sticker_attachment_payment_id_key" ON "sticker"("attachment_payment_id");

-- CreateIndex
CREATE INDEX "sticker_registered_plate_normalized_idx" ON "sticker"("registered_plate_normalized");

-- AddForeignKey
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_attachment_payment_id_fkey" FOREIGN KEY ("attachment_payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PRD §9A.4 — at most one ATTACHED sticker per vehicle at a time. A PARTIAL
-- unique index, the same technique as
-- vehicle_one_active_declaration_per_plate: Prisma cannot express a partial
-- index in the schema, so it is raw SQL here, appended by hand. SUSPENDED
-- counts as attached (an administrative hold, not a physical removal).
CREATE UNIQUE INDEX "sticker_one_attached_per_vehicle"
  ON "sticker" ("vehicle_id")
  WHERE "status" IN ('ACTIVE', 'SUSPENDED');

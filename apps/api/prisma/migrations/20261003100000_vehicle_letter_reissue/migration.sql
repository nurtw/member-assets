-- AlterTable
ALTER TABLE "vehicle_letter" ADD COLUMN     "reissue_reason" TEXT,
ADD COLUMN     "replaces_letter_id" UUID,
ADD COLUMN     "superseded_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_letter_replaces_letter_id_key" ON "vehicle_letter"("replaces_letter_id");

-- AddForeignKey
ALTER TABLE "vehicle_letter" ADD CONSTRAINT "vehicle_letter_replaces_letter_id_fkey" FOREIGN KEY ("replaces_letter_id") REFERENCES "vehicle_letter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

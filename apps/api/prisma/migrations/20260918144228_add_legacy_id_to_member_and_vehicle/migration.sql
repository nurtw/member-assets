-- AlterTable
ALTER TABLE "member" ADD COLUMN     "legacy_id" TEXT;

-- AlterTable
ALTER TABLE "vehicle" ADD COLUMN     "legacy_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "member_legacy_id_key" ON "member"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_legacy_id_key" ON "vehicle"("legacy_id");

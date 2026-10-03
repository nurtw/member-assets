-- AlterTable
ALTER TABLE "vehicle" ADD COLUMN     "retired_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vehicle_route_type_change" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "route_type_id" UUID NOT NULL,
    "previous_route_type_id" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_route_type_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_route_type_change_vehicle_id_changed_at_idx" ON "vehicle_route_type_change"("vehicle_id", "changed_at");

-- AddForeignKey
ALTER TABLE "vehicle_route_type_change" ADD CONSTRAINT "vehicle_route_type_change_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_route_type_change" ADD CONSTRAINT "vehicle_route_type_change_route_type_id_fkey" FOREIGN KEY ("route_type_id") REFERENCES "route_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_route_type_change" ADD CONSTRAINT "vehicle_route_type_change_previous_route_type_id_fkey" FOREIGN KEY ("previous_route_type_id") REFERENCES "route_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PAY-19: a vehicle already retired stops its levy too. Its retirement time
-- was never recorded, so its last update stands in for it. This writes only
-- RETIRED rows, which the legacy import never produces.
UPDATE "vehicle" SET "retired_at" = "updated_at" WHERE "status" = 'RETIRED' AND "retired_at" IS NULL;

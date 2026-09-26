-- AlterTable
ALTER TABLE "vehicle" ADD COLUMN     "route_type_id" UUID;

-- CreateTable
CREATE TABLE "route_type" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_owner" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "owner_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_owner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_type_code_key" ON "route_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_owner_vehicle_id_key" ON "vehicle_owner"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_route_type_id_idx" ON "vehicle"("route_type_id");

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_route_type_id_fkey" FOREIGN KEY ("route_type_id") REFERENCES "route_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_owner" ADD CONSTRAINT "vehicle_owner_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ARCHITECTURE.md Decision 6.6 (revision 1.3) — at most one ON_RECORD row per
-- normalised plate, so two enumerators recording the same vehicle at once
-- cannot both succeed. Partial, like vehicle_one_active_declaration_per_plate,
-- which Prisma cannot express in the schema. Preserve it across migrations.
CREATE UNIQUE INDEX "vehicle_one_on_record_per_plate"
  ON "vehicle" ("plate_number_normalized") WHERE "status" = 'ON_RECORD';

-- PRD Requirement 9.9 / QUESTIONS.md VEH-26 — the three route types the Union
-- named. Inserted here, not only by the seed, because the API requires a route
-- type on every new vehicle and the levy is priced by it (item 21): every
-- environment this migration reaches must have them. ON CONFLICT keeps it
-- idempotent against a seed that ran first; a label the Union later edits is
-- never touched again.
INSERT INTO "route_type" ("id", "code", "label", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'INTERSTATE', 'Interstate', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INTERCITY', 'Intercity', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TOWN_SERVICE', 'Town service', 2, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

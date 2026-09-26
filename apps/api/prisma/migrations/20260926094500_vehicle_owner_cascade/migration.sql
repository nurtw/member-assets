-- The owner row is part of the vehicle record (PRD Requirement 9.8), the same
-- relationship member_contact has to member, which cascades. Vehicles are never
-- deleted by the application; this aligns the two and lets test cleanup remove
-- a vehicle without first removing its owner row.
ALTER TABLE "vehicle_owner" DROP CONSTRAINT "vehicle_owner_vehicle_id_fkey";
ALTER TABLE "vehicle_owner" ADD CONSTRAINT "vehicle_owner_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

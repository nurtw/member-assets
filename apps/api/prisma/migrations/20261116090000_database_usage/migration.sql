-- Database usage (the audit of 15 November 2026).
--
-- Indexes for the housekeeping purges and for the filters a list or a count
-- runs on, and trigram indexes for the two searches that match the middle of
-- a word. None changes a column or a row.

-- The 12-month purge of the external access log, and the purge of expired
-- portal sessions, each delete by age. Without these they read the whole table.
CREATE INDEX "api_request_log_created_at_idx" ON "api_request_log"("created_at");
CREATE INDEX "portal_session_expires_at_idx" ON "portal_session"("expires_at");

-- The scope filter of the vehicle list, and the filters of the vehicle totals.
CREATE INDEX "vehicle_branch_id_idx" ON "vehicle"("branch_id");
CREATE INDEX "vehicle_unit_id_idx" ON "vehicle"("unit_id");
CREATE INDEX "vehicle_vehicle_category_id_idx" ON "vehicle"("vehicle_category_id");

-- The three indexes below are raw SQL that schema.prisma cannot express, like
-- the partial unique indexes in earlier migrations. PRESERVE THEM across
-- future migrations: Prisma will offer to drop them, and must be told no.

-- A search matches the middle of a name, a membership number, or a plate
-- (`ILIKE '%q%'`), which an ordinary index cannot serve.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "member_surname_trgm_idx" ON "member" USING GIN ("surname" gin_trgm_ops);
CREATE INDEX "member_first_name_trgm_idx" ON "member" USING GIN ("first_name" gin_trgm_ops);
CREATE INDEX "member_membership_number_trgm_idx" ON "member" USING GIN ("membership_number" gin_trgm_ops);
CREATE INDEX "vehicle_plate_number_normalized_trgm_idx" ON "vehicle" USING GIN ("plate_number_normalized" gin_trgm_ops);

-- Every scope check is `path LIKE 'prefix%'`. On a database whose collation is
-- not "C" an ordinary index on `path` cannot serve it; this operator class can.
CREATE INDEX "organisation_path_pattern_idx" ON "organisation"("path" text_pattern_ops);

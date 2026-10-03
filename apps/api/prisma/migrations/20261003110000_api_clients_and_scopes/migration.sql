-- Item 11 — API clients and scopes (PRD §12.1, §15; revision 1.5).
--
-- `api_client`, `api_token`, `disclosure_profile`, and `api_request_log` have
-- existed since item 02 and nothing has ever written to them: no route used
-- them until this item. That is why two columns can be renamed here, and why a
-- NOT NULL column can be added without a default.

-- The technical contact becomes a name, an email, and a phone. The email is
-- where a rotation reminder is addressed (Requirement 12.6).
ALTER TABLE "api_client" RENAME COLUMN "technical_contact" TO "technical_contact_name";

-- "Sponsor" was never given a meaning. PRD §12.1 asks for the "named NURTW
-- sponsor or approving officer"; the approving officer is what is recorded.
ALTER TABLE "api_client" RENAME COLUMN "sponsor_user_id" TO "approved_by_user_id";

-- AlterTable
ALTER TABLE "api_client" ADD COLUMN     "technical_contact_email" TEXT NOT NULL,
ADD COLUMN     "technical_contact_phone" TEXT,
ADD COLUMN     "registered_by_user_id" UUID,
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "agreement_reference" TEXT,
ADD COLUMN     "agreement_date" DATE,
ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "status_reason" TEXT;

-- AlterTable
ALTER TABLE "api_request_log" ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "token_id" UUID;

-- AlterTable
ALTER TABLE "api_token" ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "last_used_at" TIMESTAMP(3),
ADD COLUMN     "retires_at" TIMESTAMP(3),
ADD COLUMN     "rotated_from_token_id" UUID;

-- AlterTable
ALTER TABLE "disclosure_profile" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "api_token_rotated_from_token_id_key" ON "api_token"("rotated_from_token_id");

-- AddForeignKey
ALTER TABLE "api_client" ADD CONSTRAINT "api_client_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client" ADD CONSTRAINT "api_client_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_rotated_from_token_id_fkey" FOREIGN KEY ("rotated_from_token_id") REFERENCES "api_token"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_log" ADD CONSTRAINT "api_request_log_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "api_token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The four profiles of PRD §15 that an outside organisation can hold
-- (`SYSTEM_DISCLOSURE_PROFILES` in `@nurtw/contracts`; the seed writes the same
-- rows). They are seeded here as well because an organisation cannot be
-- approved without a profile, so every environment this migration reaches
-- must have them. PRD §15's fifth profile, Internal, is deliberately not a
-- row: the internal channels are governed by permissions.
INSERT INTO "disclosure_profile" ("id", "code", "label", "description", "is_system", "is_active", "updated_at") VALUES
  (gen_random_uuid(), 'MINIMAL_VERIFICATION', 'Minimal verification', 'Confirms that a matching NURTW record exists. Discloses nothing about it.', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OPERATIONAL_VERIFICATION', 'Operational verification', 'For an approved operational process: the plate, the vehicle category, the sticker status, and the branch or unit.', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MEMBERSHIP_VERIFICATION', 'Membership verification', 'Confirms a membership or card number, with the membership status and the card status.', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'AGGREGATE_REPORTING', 'Aggregate reporting', 'For an organisation that reads totals only. No record of any vehicle or member is disclosed.', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Minimal verification and Aggregate reporting name no field at all.
INSERT INTO "disclosure_field" ("profile_id", "field_path")
SELECT "profile"."id", "permitted"."field_path"
  FROM "disclosure_profile" AS "profile"
  JOIN (VALUES
    ('OPERATIONAL_VERIFICATION', 'plate_number'),
    ('OPERATIONAL_VERIFICATION', 'vehicle_category'),
    ('OPERATIONAL_VERIFICATION', 'sticker_status'),
    ('OPERATIONAL_VERIFICATION', 'organizational_unit'),
    ('MEMBERSHIP_VERIFICATION', 'membership_status'),
    ('MEMBERSHIP_VERIFICATION', 'card_status')
  ) AS "permitted" ("code", "field_path") ON "permitted"."code" = "profile"."code"
ON CONFLICT DO NOTHING;

-- Requirement 12.6 — how many days before a token expires it is flagged for
-- replacement. A setting, so the Union can change it without a release.
INSERT INTO "system_setting" ("key", "value", "description", "updated_at") VALUES
  ('api_token.reminder_days', '14', 'Days before an API token expires that it is flagged for replacement (PRD Requirement 12.6).', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

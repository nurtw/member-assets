-- AlterTable
ALTER TABLE "membership_application" ADD COLUMN     "created_by_user_id" UUID;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill the recording officer from the audit trail.
--
-- Applications created before this column existed still recorded who created
-- them, as an `application.create` audit event naming the actor. Recovering it
-- here means the column is complete wherever the evidence survives, rather than
-- starting empty and leaving a permanent gap that looks like "nobody recorded
-- these".
--
-- Where no such event exists the column stays NULL, which is honest: the System
-- does not know. A separate-approver check treats NULL as "cannot prove it was
-- the same person" and allows the decision, so this backfill can only tighten
-- the control, never loosen it.
-- ---------------------------------------------------------------------------
UPDATE "membership_application" AS a
   SET "created_by_user_id" = e."actor_user_id"
  FROM "audit_event" AS e
 WHERE e."action" = 'application.create'
   AND e."subject_type" = 'membership_application'
   AND e."subject_id" = a."id"::text
   AND e."actor_user_id" IS NOT NULL
   AND a."created_by_user_id" IS NULL;

-- ---------------------------------------------------------------------------
-- The approval setting, seeded off.
--
-- QUESTIONS.md MEM-04 asks the Union whether a second officer must approve a
-- membership. Until it is answered the control is built and disabled: with one
-- administrator account on the System, enforcing it would make a registration
-- impossible to complete.
--
-- Seeded as a row rather than left absent so that an operator listing the
-- settings table can see the control exists and what it does.
-- ---------------------------------------------------------------------------
INSERT INTO "system_setting" ("key", "value", "description", "updated_at")
VALUES (
  'approval.require_separate_officer',
  'false',
  'When true, the officer who recorded a membership application may not decide it, and the officer who prepared a card may not approve it. Off pending QUESTIONS.md MEM-04.',
  now()
)
ON CONFLICT ("key") DO NOTHING;

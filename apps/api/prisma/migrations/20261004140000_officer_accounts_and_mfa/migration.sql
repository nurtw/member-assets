-- Item 28: officer accounts and multi-factor sign-in (PRD §16, §17.1).
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "mfa_last_step" BIGINT,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_role_assignment" ADD COLUMN     "assigned_by_user_id" UUID,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "user_session" ADD COLUMN     "mfa_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_recovery_code" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_recovery_code_code_hash_key" ON "user_recovery_code"("code_hash");

-- CreateIndex
CREATE INDEX "user_recovery_code_user_id_idx" ON "user_recovery_code"("user_id");

-- AddForeignKey
ALTER TABLE "user_recovery_code" ADD CONSTRAINT "user_recovery_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Whether a privileged permission needs a second-factor session (Requirement
-- 17.1). Off on a database that already has administrators, so that none is
-- locked out before enrolling; the Union turns it on once they have, and it
-- must be on at go-live (QUESTIONS.md GOV-18). Never overwritten here.
INSERT INTO "system_setting" ("key", "value", "description", "updated_at")
VALUES (
  'auth.mfa_enforced',
  'false',
  'When true, a privileged permission can be used only by a session that has proved a second factor (PRD Requirement 17.1). Turn on once every administrator has enrolled. Must be on at go-live.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

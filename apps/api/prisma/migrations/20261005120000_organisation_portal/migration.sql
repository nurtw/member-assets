-- The organisation portal (PRD section 23.23, revision 1.9; QUESTIONS.md EXT-20
-- - roadmap item 29): an organisation's own account and sessions, kept apart
-- from officers', and how a self-application was confirmed before approval.

-- AlterTable
ALTER TABLE "api_client" ADD COLUMN     "applicant_confirmation_note" TEXT,
ADD COLUMN     "applicant_confirmed_via" TEXT,
ADD COLUMN     "self_registered" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "portal_account" (
    "id" UUID NOT NULL,
    "api_client_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_sign_in_count" INTEGER NOT NULL DEFAULT 0,
    "sign_in_locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_session" (
    "id" UUID NOT NULL,
    "portal_account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_account_api_client_id_key" ON "portal_account"("api_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_account_email_key" ON "portal_account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_session_token_hash_key" ON "portal_session"("token_hash");

-- CreateIndex
CREATE INDEX "portal_session_portal_account_id_idx" ON "portal_session"("portal_account_id");

-- AddForeignKey
ALTER TABLE "portal_account" ADD CONSTRAINT "portal_account_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_session" ADD CONSTRAINT "portal_session_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "portal_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The open application form's limits (EXT-20). Runtime settings, changeable
-- without a release; the service falls back to these figures if a row is
-- removed.
INSERT INTO "system_setting" ("key", "value", "description", "updated_at") VALUES
  ('portal.applications_per_hour', '3',
   'Organisation portal: how many applications one address may send in an hour (item 29).',
   CURRENT_TIMESTAMP),
  ('portal.pending_cap', '50',
   'Organisation portal: how many self-applications may await approval at once (item 29).',
   CURRENT_TIMESTAMP),
  ('portal.application_expiry_days', '30',
   'Organisation portal: days after which an unapproved self-application lapses (item 29).',
   CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

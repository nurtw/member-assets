-- Item 33 (PRD Requirement 12.11, revision 1.10; QUESTIONS.md EXT-21): an
-- invitation for a named organisation to apply through the portal. Its
-- standing is worked out from the dates, never stored. The code is not a
-- credential (ARCHITECTURE.md Decision 9.17).

-- CreateTable
CREATE TABLE "portal_invitation" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "organisation_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "note" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "api_client_id" UUID,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_user_id" UUID,
    "withdraw_reason" TEXT,

    CONSTRAINT "portal_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_invitation_code_key" ON "portal_invitation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "portal_invitation_api_client_id_key" ON "portal_invitation"("api_client_id");

-- CreateIndex
CREATE INDEX "portal_invitation_created_at_idx" ON "portal_invitation"("created_at");

-- AddForeignKey
ALTER TABLE "portal_invitation" ADD CONSTRAINT "portal_invitation_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invitation" ADD CONSTRAINT "portal_invitation_withdrawn_by_user_id_fkey" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invitation" ADD CONSTRAINT "portal_invitation_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "api_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;


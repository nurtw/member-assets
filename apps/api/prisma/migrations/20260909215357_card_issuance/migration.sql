-- CreateEnum
CREATE TYPE "OfficerSignaturePosition" AS ENUM ('PRESIDENT', 'GENERAL_SECRETARY');

-- AlterTable
ALTER TABLE "card" ADD COLUMN     "general_secretary_signature_id" UUID,
ADD COLUMN     "membership_number" TEXT,
ADD COLUMN     "president_signature_id" UUID,
ADD COLUMN     "printed_address" TEXT,
ADD COLUMN     "printed_branch" TEXT,
ADD COLUMN     "printed_designation" TEXT,
ADD COLUMN     "printed_name" TEXT,
ADD COLUMN     "printed_photo_id" UUID,
ADD COLUMN     "printed_signature_id" UUID,
ADD COLUMN     "printed_state" TEXT,
ADD COLUMN     "printed_unit" TEXT,
ALTER COLUMN "card_number" DROP NOT NULL;

-- CreateTable
CREATE TABLE "officer_signature" (
    "id" UUID NOT NULL,
    "position" "OfficerSignaturePosition" NOT NULL,
    "officer_name" TEXT NOT NULL,
    "officer_title" TEXT NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "officer_signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "officer_signature_media_asset_id_key" ON "officer_signature"("media_asset_id");

-- CreateIndex
CREATE INDEX "officer_signature_position_is_active_idx" ON "officer_signature"("position", "is_active");

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_printed_photo_id_fkey" FOREIGN KEY ("printed_photo_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_printed_signature_id_fkey" FOREIGN KEY ("printed_signature_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_president_signature_id_fkey" FOREIGN KEY ("president_signature_id") REFERENCES "officer_signature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_general_secretary_signature_id_fkey" FOREIGN KEY ("general_secretary_signature_id") REFERENCES "officer_signature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_signature" ADD CONSTRAINT "officer_signature_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Partial unique indexes. Prisma cannot express a WHERE clause on an index, so
-- these are hand-written and MUST be preserved across future migrations.
-- ---------------------------------------------------------------------------

-- At most one live card per member.
--
-- ISSUED and ACTIVE are both live: ISSUED is printed and in the office, ACTIVE
-- is in the member's hands, and a card that goes missing between the two is
-- exactly as dangerous as one lost afterwards. Two live cards would mean two
-- credentials answering for one person, and suspending one would leave the
-- other working.
--
-- History stays open by construction: EXPIRED, REPLACED, LOST, and CANCELLED
-- cards accumulate without limit, which is PRD Requirement 8.1.
--
-- A plain @@unique([member_id, status]) is NOT equivalent and is wrong: it
-- would permit one card per status per member, so a member could be issued a
-- card, have it replaced, and then never be replaced again.
CREATE UNIQUE INDEX "card_one_live_per_member"
  ON "card" ("member_id") WHERE "status" IN ('ISSUED', 'ACTIVE');

-- At most one active signature per officer position (PRD §23.7).
--
-- Superseded signatures stay, inactive, so that cards issued under a former
-- president remain explicable. Without this index two active president
-- signatures could coexist and which one a card was composited from would
-- become a matter of query ordering.
CREATE UNIQUE INDEX "officer_signature_one_active_per_position"
  ON "officer_signature" ("position") WHERE "is_active";

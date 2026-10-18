-- A member's National Identification Number (PRD revision 1.16, Requirement
-- 7.4; QUESTIONS.md PAY-22, MEM-19 — roadmap item 44). Sealed under
-- IDENTITY_ENCRYPTION_KEY by the API and never stored in the clear. Nothing
-- here moves or reads existing data.

-- CreateTable
CREATE TABLE "member_identity" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "nin_ciphertext" TEXT NOT NULL,
    "nin_lookup_hash" TEXT NOT NULL,
    "nin_last_four" TEXT NOT NULL,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_identity_member_id_key" ON "member_identity"("member_id");

-- CreateIndex
CREATE INDEX "member_identity_nin_lookup_hash_idx" ON "member_identity"("nin_lookup_hash");

-- AddForeignKey
ALTER TABLE "member_identity" ADD CONSTRAINT "member_identity_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one record holds each NIN. A cancelled membership releases its own
-- (released_at), so somebody who rejoins can be registered with it, and the
-- cancelled record keeps it. A partial index Prisma cannot express: preserve
-- it in later migrations.
CREATE UNIQUE INDEX "member_identity_one_held_per_nin"
  ON "member_identity" ("nin_lookup_hash") WHERE "released_at" IS NULL;

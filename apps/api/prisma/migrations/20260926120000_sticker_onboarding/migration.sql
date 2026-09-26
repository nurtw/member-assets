-- AlterTable
ALTER TABLE "sticker" ADD COLUMN     "attached_by_user_id" UUID,
ADD COLUMN     "legacy_security_code" TEXT;

-- AddForeignKey
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_attached_by_user_id_fkey" FOREIGN KEY ("attached_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

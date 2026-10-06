-- Item 27 (PRD Requirement 9A.8, revision 1.12; QUESTIONS.md VEH-29): printed
-- legacy stickers the register never recorded are taken into stock by
-- scanning them. A stock sticker is a `sticker` row with a legacy barcode and
-- no registered plate; these two columns say when it was added, and by whom.
-- Both stay null for a barcode imported with the register and for a signed
-- sticker.

-- AlterTable
ALTER TABLE "sticker" ADD COLUMN     "stock_added_at" TIMESTAMP(3),
ADD COLUMN     "stock_added_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "sticker_stock_added_at_idx" ON "sticker"("stock_added_at");

-- AddForeignKey
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_stock_added_by_user_id_fkey" FOREIGN KEY ("stock_added_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

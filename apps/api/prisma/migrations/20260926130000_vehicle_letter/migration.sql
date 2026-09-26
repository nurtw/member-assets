-- CreateTable
CREATE TABLE "vehicle_letter" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "sticker_id" UUID NOT NULL,
    "letter_reference" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_user_id" UUID,
    "printed_plate" TEXT NOT NULL,
    "printed_category" TEXT,
    "printed_make" TEXT,
    "printed_model" TEXT,
    "printed_colour" TEXT,
    "printed_sticker_number" TEXT NOT NULL,
    "printed_member_name" TEXT,
    "printed_membership_number" TEXT,
    "printed_unit" TEXT,
    "printed_branch" TEXT,
    "president_signature_id" UUID,
    "general_secretary_signature_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_letter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_letter_letter_reference_key" ON "vehicle_letter"("letter_reference");

-- CreateIndex
CREATE INDEX "vehicle_letter_vehicle_id_issued_at_idx" ON "vehicle_letter"("vehicle_id", "issued_at");

-- CreateIndex
CREATE INDEX "vehicle_letter_sticker_id_idx" ON "vehicle_letter"("sticker_id");

-- AddForeignKey
ALTER TABLE "vehicle_letter" ADD CONSTRAINT "vehicle_letter_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_letter" ADD CONSTRAINT "vehicle_letter_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "sticker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_letter" ADD CONSTRAINT "vehicle_letter_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_letter" ADD CONSTRAINT "vehicle_letter_president_signature_id_fkey" FOREIGN KEY ("president_signature_id") REFERENCES "officer_signature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_letter" ADD CONSTRAINT "vehicle_letter_general_secretary_signature_id_fkey" FOREIGN KEY ("general_secretary_signature_id") REFERENCES "officer_signature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

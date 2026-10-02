-- CreateTable
CREATE TABLE "fee_amount_history" (
    "id" UUID NOT NULL,
    "fee_type_id" UUID NOT NULL,
    "route_type_id" UUID,
    "amount_kobo" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_amount_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_amount_history_fee_type_id_route_type_id_effective_from_idx" ON "fee_amount_history"("fee_type_id", "route_type_id", "effective_from");

-- AddForeignKey
ALTER TABLE "fee_amount_history" ADD CONSTRAINT "fee_amount_history_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_amount_history" ADD CONSTRAINT "fee_amount_history_route_type_id_fkey" FOREIGN KEY ("route_type_id") REFERENCES "route_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

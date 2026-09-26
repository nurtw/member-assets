-- CreateTable
CREATE TABLE "fee_type_price" (
    "id" UUID NOT NULL,
    "fee_type_id" UUID NOT NULL,
    "route_type_id" UUID NOT NULL,
    "amount_kobo" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_type_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_type_price_route_type_id_idx" ON "fee_type_price"("route_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_type_price_fee_type_id_route_type_id_key" ON "fee_type_price"("fee_type_id", "route_type_id");

-- AddForeignKey
ALTER TABLE "fee_type_price" ADD CONSTRAINT "fee_type_price_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_type_price" ADD CONSTRAINT "fee_type_price_route_type_id_fkey" FOREIGN KEY ("route_type_id") REFERENCES "route_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- QUESTIONS.md PAY-02 (revised 26 September 2026) and PAY-14 — the levy is
-- ₦7,000, priced per route type. PRD Requirement 27.2 says every amount change
-- is audited with a reason, so an environment already seeded at the old ₦5,000
-- is corrected WITH a trace here, not silently. Each statement is conditional:
--
--   * the default moves only if it still stands at the old launch figure, so a
--     figure the Union has since set in settings is never overwritten;
--   * route-type prices are inserted only where none exists yet.
--
-- On a fresh database the fee_type table is empty at this point (the seed runs
-- after migrations), so every statement below affects nothing and the seed
-- creates the ₦7,000 figures directly.
-- ---------------------------------------------------------------------------

INSERT INTO "audit_event" ("id", "action", "subject_type", "subject_id", "before_value", "after_value", "reason", "created_at")
SELECT gen_random_uuid(), 'fee_type.update', 'fee_type', "id"::text,
       jsonb_build_object('code', "code", 'amountKobo', "amount_kobo"),
       jsonb_build_object('code', "code", 'amountKobo', 700000),
       'Levy revised to ₦7,000 by the project owner, 26 September 2026 (QUESTIONS.md PAY-02, PAY-14). Applied by migration 20260926110000.',
       CURRENT_TIMESTAMP
FROM "fee_type"
WHERE "code" = 'LEVY' AND "amount_kobo" = 500000;

UPDATE "fee_type"
SET "amount_kobo" = 700000, "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'LEVY' AND "amount_kobo" = 500000;

WITH inserted AS (
  INSERT INTO "fee_type_price" ("id", "fee_type_id", "route_type_id", "amount_kobo", "updated_at")
  SELECT gen_random_uuid(), f."id", r."id", 700000, CURRENT_TIMESTAMP
  FROM "fee_type" f
  CROSS JOIN "route_type" r
  WHERE f."code" = 'LEVY' AND r."code" IN ('INTERSTATE', 'INTERCITY', 'TOWN_SERVICE')
  ON CONFLICT ("fee_type_id", "route_type_id") DO NOTHING
  RETURNING "id", "fee_type_id", "route_type_id", "amount_kobo"
)
INSERT INTO "audit_event" ("id", "action", "subject_type", "subject_id", "after_value", "reason", "created_at")
SELECT gen_random_uuid(), 'fee_type.price_set', 'fee_type', i."fee_type_id"::text,
       jsonb_build_object('routeTypeCode', r."code", 'amountKobo', i."amount_kobo"),
       'Levy priced per route type at ₦7,000 each by the project owner, 26 September 2026 (QUESTIONS.md PAY-14). Applied by migration 20260926110000.',
       CURRENT_TIMESTAMP
FROM inserted i
JOIN "route_type" r ON r."id" = i."route_type_id";

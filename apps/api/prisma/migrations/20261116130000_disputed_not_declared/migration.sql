-- Item 59 follow-up. A disputed claim is kept but is not a declaration, so it
-- carries no declared date. The column's now() default had stamped one on every
-- disputed row. Data only; idempotent; the creation time stays in the audit trail.
UPDATE "vehicle" SET "declared_at" = NULL WHERE "status" = 'DISPUTED' AND "declared_at" IS NOT NULL;

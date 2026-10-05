-- Personal pay links and the public pay routes' counters (PRD Requirement
-- 27.8, revision 1.9; QUESTIONS.md PAY-21 — roadmap item 31).

-- CreateTable
CREATE TABLE "pay_link" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "pay_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_rate_counter" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "public_rate_counter_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_link_code_key" ON "pay_link"("code");

-- CreateIndex
CREATE INDEX "pay_link_subject_type_subject_id_idx" ON "pay_link"("subject_type", "subject_id");

-- At most one live link per subject, while replaced ones stay as history.
-- A partial index Prisma cannot express: preserve it in later migrations.
CREATE UNIQUE INDEX "pay_link_one_live_per_subject"
  ON "pay_link" ("subject_type", "subject_id") WHERE "revoked_at" IS NULL;

-- The public routes' limits, per address. Runtime settings, changeable
-- without a release; the service falls back to these figures if a row is
-- removed.
INSERT INTO "system_setting" ("key", "value", "description", "updated_at") VALUES
  ('pay_link.views_per_minute', '30',
   'Public pay page: how many times one address may open pay links in a minute (item 31).',
   CURRENT_TIMESTAMP),
  ('pay_link.payments_per_hour', '10',
   'Public pay page: how many payments one address may start in an hour (item 31).',
   CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

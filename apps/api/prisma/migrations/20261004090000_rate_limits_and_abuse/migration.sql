-- Item 13: rate limiting and abuse detection (PRD §14, §23.12; ARCHITECTURE.md
-- Decisions 8.1-8.3). Counters live in Postgres by the owner's direction of
-- 3 October 2026 (QUESTIONS.md EXT-14).

-- CreateTable
CREATE TABLE "rate_limit_profile" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "verification_per_minute" INTEGER NOT NULL,
    "aggregate_per_minute" INTEGER NOT NULL,
    "burst" INTEGER NOT NULL,
    "hourly_quota" INTEGER,
    "daily_quota" INTEGER NOT NULL,
    "window_minutes" INTEGER NOT NULL,
    "forgery_threshold" INTEGER NOT NULL,
    "miss_threshold" INTEGER NOT NULL,
    "miss_percent" INTEGER NOT NULL,
    "sequence_threshold" INTEGER NOT NULL,
    "sequence_reach" INTEGER NOT NULL,
    "pause_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_profile_pkey" PRIMARY KEY ("code")
);

-- The two client types of proposal §14.2, with the owner's daily quotas
-- (EXT-15) and an hour's pause (EXT-16). Detection thresholds are launch
-- defaults pending EXT-17. Kept identical to SYSTEM_RATE_LIMIT_PROFILES in
-- packages/contracts, which the seed writes on a fresh database.
INSERT INTO "rate_limit_profile" (
    "code", "label", "description",
    "verification_per_minute", "aggregate_per_minute", "burst",
    "hourly_quota", "daily_quota",
    "window_minutes", "forgery_threshold", "miss_threshold", "miss_percent",
    "sequence_threshold", "sequence_reach", "pause_minutes", "updated_at"
) VALUES
    ('STANDARD', 'Approved external client',
     'The limits an approved organisation is held to unless it is given another profile.',
     30, 2, 5, NULL, 1000, 10, 5, 30, 80, 5, 3, 60, CURRENT_TIMESTAMP),
    ('TRUSTED', 'Trusted operational client',
     'Higher limits, for an organisation whose approved operation needs them.',
     120, 5, 20, NULL, 5000, 10, 5, 120, 80, 5, 3, 60, CURRENT_TIMESTAMP);

-- Every organisation already registered starts on the standard profile.
UPDATE "api_client" SET "rate_limit_profile" = 'STANDARD'
 WHERE "rate_limit_profile" IS NULL
    OR "rate_limit_profile" NOT IN ('STANDARD', 'TRUSTED');

-- AlterTable
ALTER TABLE "api_client" ALTER COLUMN "rate_limit_profile" SET NOT NULL,
ALTER COLUMN "rate_limit_profile" SET DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "api_request_log" ADD COLUMN     "server_request_id" TEXT;

-- CreateTable
CREATE TABLE "api_rate_bucket" (
    "client_id" UUID NOT NULL,
    "route_class" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_rate_bucket_pkey" PRIMARY KEY ("client_id","route_class")
);

-- CreateTable
CREATE TABLE "api_rate_counter" (
    "client_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "api_rate_counter_pkey" PRIMARY KEY ("client_id","period","window_start")
);

-- CreateTable
CREATE TABLE "api_abuse_window" (
    "client_id" UUID NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "checks" INTEGER NOT NULL,
    "misses" INTEGER NOT NULL,
    "forgeries" INTEGER NOT NULL,

    CONSTRAINT "api_abuse_window_pkey" PRIMARY KEY ("client_id","window_start")
);

-- CreateTable
CREATE TABLE "api_sequence_state" (
    "client_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "number" BIGINT NOT NULL,
    "run" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_sequence_state_pkey" PRIMARY KEY ("client_id","kind")
);

-- CreateTable
CREATE TABLE "api_client_pause" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "signal" TEXT NOT NULL,
    "paused_at" TIMESTAMP(3) NOT NULL,
    "paused_until" TIMESTAMP(3) NOT NULL,
    "evidence" JSONB NOT NULL,
    "lifted_at" TIMESTAMP(3),
    "lifted_by_user_id" UUID,
    "lift_reason" TEXT,

    CONSTRAINT "api_client_pause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_rate_counter_window_start_idx" ON "api_rate_counter"("window_start");

-- CreateIndex
CREATE INDEX "api_abuse_window_window_start_idx" ON "api_abuse_window"("window_start");

-- CreateIndex
CREATE INDEX "api_client_pause_client_id_paused_at_idx" ON "api_client_pause"("client_id", "paused_at");

-- AddForeignKey
ALTER TABLE "api_client" ADD CONSTRAINT "api_client_rate_limit_profile_fkey" FOREIGN KEY ("rate_limit_profile") REFERENCES "rate_limit_profile"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "api_rate_bucket" ADD CONSTRAINT "api_rate_bucket_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_rate_counter" ADD CONSTRAINT "api_rate_counter_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_abuse_window" ADD CONSTRAINT "api_abuse_window_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_sequence_state" ADD CONSTRAINT "api_sequence_state_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client_pause" ADD CONSTRAINT "api_client_pause_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client_pause" ADD CONSTRAINT "api_client_pause_lifted_by_user_id_fkey" FOREIGN KEY ("lifted_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

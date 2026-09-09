-- CreateEnum
CREATE TYPE "OrganisationLevel" AS ENUM ('COUNCIL', 'ZONE', 'BRANCH', 'UNIT');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'ACTIVE', 'SUSPENDED', 'LOST', 'REPLACED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StickerStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACTIVE', 'SUSPENDED', 'LOST', 'REPLACED', 'DAMAGED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'DISPUTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApiClientStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdentifierScheme" AS ENUM ('SIGNED', 'LEGACY');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PASSPORT_PHOTOGRAPH', 'MEMBER_SIGNATURE', 'OFFICER_SIGNATURE', 'COLLATERAL_EVIDENCE');

-- CreateTable
CREATE TABLE "organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" "OrganisationLevel" NOT NULL,
    "parent_id" UUID,
    "path" TEXT NOT NULL,
    "state_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_category" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designation" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lga" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL,
    "membership_number" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "surname" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "organisation_id" UUID NOT NULL,
    "designation_id" UUID,
    "passport_photo_id" UUID,
    "signature_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_contact" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "residential_address" TEXT NOT NULL,
    "area" TEXT,
    "town_city" TEXT,
    "residential_lga_id" UUID,
    "state_of_origin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "next_of_kin" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "surname" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "town_city" TEXT,
    "lga_id" UUID,
    "state_of_origin" TEXT,
    "phone" TEXT NOT NULL,
    "occupation" TEXT,
    "signature_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "next_of_kin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantor" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "surname" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "town_city" TEXT,
    "relationship_to_applicant" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "occupation" TEXT,
    "has_collateral" BOOLEAN,
    "collateral_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guarantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_application" (
    "id" UUID NOT NULL,
    "application_number" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "member_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card" (
    "id" UUID NOT NULL,
    "card_number" TEXT NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "template_version" TEXT NOT NULL,
    "replacement_of_card_id" UUID,
    "issued_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL,
    "plate_number_normalized" TEXT NOT NULL,
    "plate_number_display" TEXT NOT NULL,
    "vehicle_category_id" UUID,
    "make" TEXT,
    "model" TEXT,
    "color" TEXT,
    "chassis_vin_restricted" TEXT,
    "declared_by_member_id" UUID,
    "branch_id" UUID,
    "unit_id" UUID,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'PENDING',
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_legacy_import" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "status" "StickerStatus" NOT NULL DEFAULT 'DRAFT',
    "sticker_qr_id" TEXT NOT NULL,
    "signing_key_id" TEXT,
    "legacy_barcode" TEXT,
    "plate_number_at_issue" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "template_version" TEXT NOT NULL,
    "replacement_of_sticker_id" UUID,
    "issued_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mfa_secret" TEXT,
    "mfa_enabled_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requires_step_up" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_role_assignment" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_grant" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_revocation" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "revoked_by_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_revocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_client" (
    "id" UUID NOT NULL,
    "organisation_name" TEXT NOT NULL,
    "status" "ApiClientStatus" NOT NULL DEFAULT 'PENDING',
    "business_purpose" TEXT NOT NULL,
    "sponsor_user_id" UUID,
    "technical_contact" TEXT NOT NULL,
    "disclosure_profile_id" UUID,
    "allowed_ip_ranges" TEXT[],
    "rate_limit_profile" TEXT,
    "daily_quota" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_token" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_client_scope" (
    "client_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_client_scope_pkey" PRIMARY KEY ("client_id","scope")
);

-- CreateTable
CREATE TABLE "disclosure_profile" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disclosure_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disclosure_field" (
    "profile_id" UUID NOT NULL,
    "field_path" TEXT NOT NULL,

    CONSTRAINT "disclosure_field_pkey" PRIMARY KEY ("profile_id","field_path")
);

-- CreateTable
CREATE TABLE "api_request_log" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "client_id" UUID,
    "endpoint" TEXT NOT NULL,
    "scope" TEXT,
    "result_class" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "rate_limited" BOOLEAN NOT NULL DEFAULT false,
    "identifier_scheme" "IdentifierScheme",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_api_client_id" UUID,
    "organisation_id" UUID,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT,
    "before_value" JSONB,
    "after_value" JSONB,
    "reason" TEXT,
    "request_id" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "organisation_parent_id_idx" ON "organisation"("parent_id");

-- CreateIndex
CREATE INDEX "organisation_path_idx" ON "organisation"("path");

-- CreateIndex
CREATE INDEX "organisation_level_idx" ON "organisation"("level");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_category_code_key" ON "vehicle_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "designation_code_key" ON "designation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lga_code_key" ON "lga"("code");

-- CreateIndex
CREATE INDEX "lga_state_name_idx" ON "lga"("state_name");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_storage_key_key" ON "media_asset"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "member_membership_number_key" ON "member"("membership_number");

-- CreateIndex
CREATE UNIQUE INDEX "member_passport_photo_id_key" ON "member"("passport_photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_signature_id_key" ON "member"("signature_id");

-- CreateIndex
CREATE INDEX "member_organisation_id_idx" ON "member"("organisation_id");

-- CreateIndex
CREATE INDEX "member_status_idx" ON "member"("status");

-- CreateIndex
CREATE UNIQUE INDEX "member_contact_member_id_key" ON "member_contact"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "next_of_kin_member_id_key" ON "next_of_kin"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "guarantor_member_id_key" ON "guarantor"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_application_application_number_key" ON "membership_application"("application_number");

-- CreateIndex
CREATE UNIQUE INDEX "membership_application_member_id_key" ON "membership_application"("member_id");

-- CreateIndex
CREATE INDEX "membership_application_status_idx" ON "membership_application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "card_card_number_key" ON "card"("card_number");

-- CreateIndex
CREATE UNIQUE INDEX "card_replacement_of_card_id_key" ON "card"("replacement_of_card_id");

-- CreateIndex
CREATE INDEX "card_member_id_idx" ON "card"("member_id");

-- CreateIndex
CREATE INDEX "card_status_idx" ON "card"("status");

-- CreateIndex
CREATE INDEX "vehicle_plate_number_normalized_idx" ON "vehicle"("plate_number_normalized");

-- CreateIndex
CREATE INDEX "vehicle_status_idx" ON "vehicle"("status");

-- CreateIndex
CREATE INDEX "vehicle_declared_by_member_id_idx" ON "vehicle"("declared_by_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_sticker_qr_id_key" ON "sticker"("sticker_qr_id");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_legacy_barcode_key" ON "sticker"("legacy_barcode");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_replacement_of_sticker_id_key" ON "sticker"("replacement_of_sticker_id");

-- CreateIndex
CREATE INDEX "sticker_vehicle_id_idx" ON "sticker"("vehicle_id");

-- CreateIndex
CREATE INDEX "sticker_status_idx" ON "sticker"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE INDEX "user_role_assignment_user_id_idx" ON "user_role_assignment"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignment_user_id_role_id_organisation_id_key" ON "user_role_assignment"("user_id", "role_id", "organisation_id");

-- CreateIndex
CREATE INDEX "user_permission_grant_permission_id_idx" ON "user_permission_grant"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_grant_user_id_permission_id_organisation_id_key" ON "user_permission_grant"("user_id", "permission_id", "organisation_id");

-- CreateIndex
CREATE INDEX "user_permission_revocation_permission_id_idx" ON "user_permission_revocation"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_revocation_user_id_permission_id_organisati_key" ON "user_permission_revocation"("user_id", "permission_id", "organisation_id");

-- CreateIndex
CREATE INDEX "api_client_status_idx" ON "api_client"("status");

-- CreateIndex
CREATE UNIQUE INDEX "api_token_token_hash_key" ON "api_token"("token_hash");

-- CreateIndex
CREATE INDEX "api_token_client_id_idx" ON "api_token"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "disclosure_profile_code_key" ON "disclosure_profile"("code");

-- CreateIndex
CREATE INDEX "api_request_log_client_id_created_at_idx" ON "api_request_log"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "api_request_log_request_id_idx" ON "api_request_log"("request_id");

-- CreateIndex
CREATE INDEX "audit_event_subject_type_subject_id_idx" ON "audit_event"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "audit_event_actor_user_id_created_at_idx" ON "audit_event"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_action_created_at_idx" ON "audit_event"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_created_at_idx" ON "audit_event"("created_at");

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_passport_photo_id_fkey" FOREIGN KEY ("passport_photo_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_contact" ADD CONSTRAINT "member_contact_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_contact" ADD CONSTRAINT "member_contact_residential_lga_id_fkey" FOREIGN KEY ("residential_lga_id") REFERENCES "lga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "next_of_kin" ADD CONSTRAINT "next_of_kin_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "next_of_kin" ADD CONSTRAINT "next_of_kin_lga_id_fkey" FOREIGN KEY ("lga_id") REFERENCES "lga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantor" ADD CONSTRAINT "guarantor_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_replacement_of_card_id_fkey" FOREIGN KEY ("replacement_of_card_id") REFERENCES "card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_vehicle_category_id_fkey" FOREIGN KEY ("vehicle_category_id") REFERENCES "vehicle_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_declared_by_member_id_fkey" FOREIGN KEY ("declared_by_member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_replacement_of_sticker_id_fkey" FOREIGN KEY ("replacement_of_sticker_id") REFERENCES "sticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_grant" ADD CONSTRAINT "user_permission_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_grant" ADD CONSTRAINT "user_permission_grant_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_grant" ADD CONSTRAINT "user_permission_grant_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_grant" ADD CONSTRAINT "user_permission_grant_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_revocation" ADD CONSTRAINT "user_permission_revocation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_revocation" ADD CONSTRAINT "user_permission_revocation_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_revocation" ADD CONSTRAINT "user_permission_revocation_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client" ADD CONSTRAINT "api_client_disclosure_profile_id_fkey" FOREIGN KEY ("disclosure_profile_id") REFERENCES "disclosure_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client_scope" ADD CONSTRAINT "api_client_scope_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disclosure_field" ADD CONSTRAINT "disclosure_field_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "disclosure_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_log" ADD CONSTRAINT "api_request_log_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Partial unique index — added by hand, not generated by Prisma.
--
-- PRD Requirement 9.2: at most one ACTIVE declaration per normalised plate.
--
-- Prisma cannot express a partial unique index in schema.prisma, so it is
-- written here. It must be preserved across future migrations.
--
-- A plain UNIQUE (plate_number_normalized, status) is NOT equivalent and is
-- wrong: it permits only one row per status per plate, so a vehicle could be
-- retired exactly once and never again. PRD §4.8 requires history to be
-- preserved, and declared -> retired -> re-declared -> retired is legitimate.
--
-- Only ACTIVE is constrained. PENDING, SUSPENDED, RETIRED, DISPUTED, and
-- ARCHIVED rows may repeat freely for the same plate, which is what keeps the
-- historical record intact.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "vehicle_one_active_declaration_per_plate"
  ON "vehicle" ("plate_number_normalized")
  WHERE "status" = 'ACTIVE';

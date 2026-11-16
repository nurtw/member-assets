-- Item 61 (MEM-20): a registration makes the member active at once.

-- The registering officer's one correction; an administrator's are not counted.
ALTER TABLE "membership_application" ADD COLUMN "corrected_at" TIMESTAMP(3);

-- There is no review and no decision, so the two permissions that served them go.
-- role_permission, user_permission_grant, and user_permission_revocation cascade.
DELETE FROM "permission" WHERE "code" IN ('application.decide', 'application.review');

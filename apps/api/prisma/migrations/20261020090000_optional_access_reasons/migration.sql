-- Item 56, the owner's direction of 20 October 2026: giving an officer a
-- permission, or taking one away, no longer needs a reason. A grant or a
-- revocation given without one keeps none (NULL), never an empty string.
-- Rows already written keep the reason they were given.

ALTER TABLE "user_permission_grant" ALTER COLUMN "reason" DROP NOT NULL;

ALTER TABLE "user_permission_revocation" ALTER COLUMN "reason" DROP NOT NULL;

-- PRD revision 1.14 (QUESTIONS.md MEM-16, MEM-06): a next of kin and a
-- guarantor are asked for a full name in one field, and for less besides.
--
-- This adds and loosens, and removes nothing. Every column that was there
-- stays, with what it held.
--
-- The full name of a row recorded before is put together from the three name
-- parts it already holds, in the order the printed form reads them out. That
-- is the Union's own data rearranged, not a value supplied for it.

-- AlterTable: next_of_kin
ALTER TABLE "next_of_kin" ADD COLUMN "full_name" TEXT;

UPDATE "next_of_kin"
SET "full_name" = btrim(concat_ws(
  ' ',
  NULLIF(btrim("first_name"), ''),
  NULLIF(btrim("middle_name"), ''),
  NULLIF(btrim("surname"), '')
));

ALTER TABLE "next_of_kin"
  ALTER COLUMN "full_name" SET NOT NULL,
  ALTER COLUMN "surname" DROP NOT NULL,
  ALTER COLUMN "first_name" DROP NOT NULL,
  ALTER COLUMN "address" DROP NOT NULL;

-- AlterTable: guarantor
ALTER TABLE "guarantor" ADD COLUMN "full_name" TEXT;

UPDATE "guarantor"
SET "full_name" = btrim(concat_ws(
  ' ',
  NULLIF(btrim("first_name"), ''),
  NULLIF(btrim("middle_name"), ''),
  NULLIF(btrim("surname"), '')
));

ALTER TABLE "guarantor"
  ALTER COLUMN "full_name" SET NOT NULL,
  ALTER COLUMN "surname" DROP NOT NULL,
  ALTER COLUMN "first_name" DROP NOT NULL,
  ALTER COLUMN "relationship_to_applicant" DROP NOT NULL;

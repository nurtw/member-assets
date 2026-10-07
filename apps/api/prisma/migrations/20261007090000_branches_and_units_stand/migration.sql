-- ORG-05, as determined by the project owner on 7 October 2026 at the request
-- of the Union's Head of Operations: the one branch and one unit seeded beneath
-- each zone, named after it, stand as the Union's own. They were marked
-- "(demo)" while that was undecided; the mark comes off.
--
-- Data only: no column changes. Each rename is recorded in the audit trail
-- first, with the name before and after, as a rename through the System is.
-- There is no actor: nobody signed in to do it.
--
-- Safe to run anywhere, and more than once: a database with no such names is
-- left as it is.
INSERT INTO "audit_event" (
  "id", "action", "organisation_id", "subject_type", "subject_id",
  "before_value", "after_value", "reason"
)
SELECT
  gen_random_uuid(),
  'organisation.update',
  o."id",
  'organisation',
  o."id"::text,
  jsonb_build_object('name', o."name"),
  jsonb_build_object('name', regexp_replace(o."name", ' \(demo\)$', '')),
  'ORG-05: the project owner''s determination of 7 October 2026. The branch and unit beneath each zone stand as the Union''s own, and are no longer marked as placeholders.'
FROM "organisation" o
WHERE o."level" IN ('BRANCH', 'UNIT')
  AND o."name" LIKE '% (demo)';

UPDATE "organisation"
SET "name" = regexp_replace("name", ' \(demo\)$', ''),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "level" IN ('BRANCH', 'UNIT')
  AND "name" LIKE '% (demo)';

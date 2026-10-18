-- QUESTIONS.md ORG-06, answered by the project owner on 18 October 2026: the
-- eight designations seeded as placeholders are the Union's list. Their codes
-- lose the DEMO_ prefix, and Driver and Conductor come first, the order
-- Mr Timothy gave on 6 October 2026. Labels are unchanged, and members keep
-- their designation, which they hold by id.
--
-- A code is renamed only where the plain code is not already taken, so a
-- database where an entry was made by hand is left for an officer to settle.

UPDATE "designation" AS d
   SET "code" = substr(d."code", 6), "updated_at" = now()
 WHERE d."code" LIKE 'DEMO\_%'
   AND NOT EXISTS (
     SELECT 1 FROM "designation" AS o WHERE o."code" = substr(d."code", 6)
   );

UPDATE "designation" AS d
   SET "sort_order" = v.sort_order, "updated_at" = now()
  FROM (VALUES
         ('DRIVER', 0),
         ('CONDUCTOR', 1),
         ('CHAIRMAN', 2),
         ('SECRETARY', 3),
         ('TREASURER', 4),
         ('FINANCIAL_SECRETARY', 5),
         ('PRO', 6),
         ('AUDITOR', 7)
       ) AS v(code, sort_order)
 WHERE d."code" = v.code;

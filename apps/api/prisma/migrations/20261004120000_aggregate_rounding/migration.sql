-- Item 14: filtered vehicle totals are rounded to the nearest multiple of this
-- setting (the owner's direction of 4 October 2026, QUESTIONS.md EXT-18). The
-- Union owns the value once it exists; this never overwrites it.
INSERT INTO "system_setting" ("key", "value", "description", "updated_at")
VALUES (
  'aggregate.rounding_base',
  '10',
  'Filtered aggregate totals are rounded to the nearest multiple of this, so totals cannot be subtracted to uncover a suppressed one (QUESTIONS.md EXT-18). 1 turns it off.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- The floor was seeded by the seed script only; make sure every database has it.
INSERT INTO "system_setting" ("key", "value", "description", "updated_at")
VALUES (
  'aggregate.suppression_floor',
  '25',
  'Aggregate totals below this are returned as SUPPRESSED (PRD §23.12).',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Roadmap item 62 (QUESTIONS.md VEH-40): the one edit of an imported vehicle that an
-- officer who is not an administrator gets. Set by the first such save.
ALTER TABLE "vehicle" ADD COLUMN "imported_edited_at" TIMESTAMP(3);

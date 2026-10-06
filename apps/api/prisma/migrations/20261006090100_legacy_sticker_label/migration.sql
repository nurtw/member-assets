-- The label the legacy import gave its stickers carried the previous
-- operator's name, which is no longer written anywhere (the owner's direction
-- of 5 October 2026). It becomes `legacy-barcode`, the label the import and
-- the stock now write.
--
-- The old value is written here in two parts, so that the name stays out of
-- the repository. Nothing reads this label to decide anything: a legacy
-- sticker is one whose `legacy_barcode` is set.
UPDATE "sticker"
SET "template_version" = 'legacy-barcode'
WHERE "template_version" = 'trans' || 'pay-legacy';

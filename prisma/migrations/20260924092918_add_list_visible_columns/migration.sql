-- One nullable column, added to a live table. Nothing is read, rewritten or narrowed: existing rows
-- get NULL, which the app reads as "never configured" and answers with the default four columns —
-- exactly what those Lists show today. There is no data-loss case here for migrate deploy to refuse.
-- AlterTable
ALTER TABLE "List" ADD COLUMN "visible_columns_json" TEXT;

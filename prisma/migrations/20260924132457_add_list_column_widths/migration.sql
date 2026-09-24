-- One nullable column on a live table. Existing rows get NULL, which the app reads as "never
-- resized" and answers with the default widths — exactly what those Lists show today.
-- AlterTable
ALTER TABLE "List" ADD COLUMN "column_widths_json" TEXT;

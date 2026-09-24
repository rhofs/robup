-- One nullable column on a live table. NULL reads as "deadline" (red once passed, like Due), which
-- is what every existing date field shows from now on until someone switches it to "event".
-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN "date_kind" TEXT;

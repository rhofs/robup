-- One nullable column on a live table. NULL reads as "never sorted", which resolves to manual order
-- — exactly what every List does today.
-- AlterTable
ALTER TABLE "List" ADD COLUMN "sort_json" TEXT;

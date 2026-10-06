-- The icon shown inside a status's circle; null means the default for its kind (open / done / closed).
ALTER TABLE "Status" ADD COLUMN "icon" TEXT;

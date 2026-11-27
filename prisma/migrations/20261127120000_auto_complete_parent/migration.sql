-- AlterTable
ALTER TABLE "Space" ADD COLUMN "auto_complete_parent" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "List" ADD COLUMN "auto_complete_parent" BOOLEAN;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "auto_completed_from" TEXT;

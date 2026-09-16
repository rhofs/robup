-- Two nullable columns, so this applies to live data without touching a single existing row and
-- needs no data-loss acknowledgement. Generated with `prisma migrate diff` against the committed
-- migration history rather than hand-written — see AGENTS.md on why `db push` is not an option here.
-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "color" TEXT;

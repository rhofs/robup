-- Hand-written instead of Prisma's generated table rebuild: three plain ADD COLUMNs, which leave the
-- Space table (referenced by nearly everything) untouched. Verified against the schema with
-- `prisma migrate diff` (no difference).

-- What checking a task's circle does in a Space: 'archive' (the original behaviour) or 'status'.
ALTER TABLE "Space" ADD COLUMN "check_mode" TEXT NOT NULL DEFAULT 'archive';
-- Strike through the titles of tasks in a done status.
ALTER TABLE "Space" ADD COLUMN "strike_done" BOOLEAN NOT NULL DEFAULT false;
-- A status that counts as finished.
ALTER TABLE "Status" ADD COLUMN "is_done" BOOLEAN NOT NULL DEFAULT false;

-- Statuses already named as finished start out marked so.
UPDATE "Status" SET "is_done" = true
WHERE lower(trim("name")) IN ('done', 'complete', 'completed', 'closed', 'finished', 'ferdig', 'fullført', 'fullfort');

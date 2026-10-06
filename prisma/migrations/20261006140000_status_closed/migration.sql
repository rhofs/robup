-- A status can be "closed": picking it from a task's circle archives the task (it leaves the list),
-- unlike a done status, which keeps the task in view. Plain ADD COLUMN.
ALTER TABLE "Status" ADD COLUMN "is_closed" BOOLEAN NOT NULL DEFAULT false;

-- Statuses that already say they close a task start out as closed (and not done) — e.g. "Slett"
-- from a ClickUp import, where it sat in the Closed group.
UPDATE "Status" SET "is_closed" = true, "is_done" = false
WHERE lower(trim("name")) IN ('closed', 'slett', 'lukket', 'arkivert', 'archived', 'arkiver');

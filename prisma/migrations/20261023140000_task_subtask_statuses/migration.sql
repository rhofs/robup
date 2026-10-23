-- Hand-written instead of Prisma's generated rebuild of the Status table: a plain ADD COLUMN,
-- verified against the schema with `prisma migrate diff`.

-- A task's own statuses for its subtasks. Null on every existing status, so nothing changes until a
-- task chooses a set of its own.
ALTER TABLE "Status" ADD COLUMN "task_id" TEXT REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Status_task_id_idx" ON "Status"("task_id");

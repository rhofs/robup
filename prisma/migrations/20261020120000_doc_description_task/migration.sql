-- Hand-written instead of Prisma's generated rebuild of the Doc table: a plain ADD COLUMN, verified
-- against the schema with `prisma migrate diff`.

-- The Doc that is a task's description (at most one per task). Null on every existing Doc, so nothing
-- changes until a task's description is first opened.
ALTER TABLE "Doc" ADD COLUMN "description_task_id" TEXT REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Doc_description_task_id_key" ON "Doc"("description_task_id");

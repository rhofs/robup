-- Hand-written instead of Prisma's generated rebuild of the Space and CustomField tables: plain ADD
-- COLUMNs, verified against the schema with `prisma migrate diff`.

-- Whether the Planner shows a task. Null on every existing task = follow its List, then its Space.
ALTER TABLE "Task" ADD COLUMN "show_in_planner" BOOLEAN;

-- A List's Planner default; null on every existing List = the Space's.
ALTER TABLE "List" ADD COLUMN "planner_default" BOOLEAN;

-- A Space's Planner default; true, so every task stays in the Planner until someone changes it.
ALTER TABLE "Space" ADD COLUMN "planner_default" BOOLEAN NOT NULL DEFAULT true;

-- Date fields: shown in the Planner / counted in My Assigned Tasks. Both off, so nothing changes.
ALTER TABLE "CustomField" ADD COLUMN "show_in_planner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomField" ADD COLUMN "show_in_my_tasks" BOOLEAN NOT NULL DEFAULT false;

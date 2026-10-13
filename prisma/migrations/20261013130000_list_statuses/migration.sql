-- Hand-written instead of Prisma's generated rebuild of the Status AND Workspace tables (Workspace is
-- referenced by nearly everything): plain ADD COLUMNs, verified against the schema with
-- `prisma migrate diff`.

-- A List's own statuses ("Use custom statuses"); null = a Space status, inherited by every List
-- without its own. Every existing status stays a Space status, so nothing changes until a List opts in.
ALTER TABLE "Status" ADD COLUMN "list_id" TEXT REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Status_list_id_idx" ON "Status"("list_id");

-- Whether the built-in status templates have been copied in as this workspace's own (deletable) rows.
ALTER TABLE "Workspace" ADD COLUMN "status_templates_seeded" BOOLEAN NOT NULL DEFAULT false;

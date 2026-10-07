-- Status templates (Edit statuses → "Save as template") and the workspace's default for new Spaces.
-- Both additive: a new table, and a nullable column on Workspace.

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "default_status_template" TEXT;

-- CreateTable
CREATE TABLE "StatusTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statuses_json" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusTemplate_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StatusTemplate_workspace_id_idx" ON "StatusTemplate"("workspace_id");

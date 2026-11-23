-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN "workspace_ids_json" TEXT;

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token_id" TEXT,
    "token_name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "request_id" TEXT,
    "changes_json" TEXT NOT NULL,
    "result_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "undone_at" DATETIME,
    "undone_by_id" TEXT,
    "undo_report" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentAction_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "ApiToken" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentAction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentAction_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
-- Written by hand: Prisma generated a full rebuild of "Workspace" (create new, copy, drop, rename)
-- to add this one column. SQLite can add a NOT NULL column with a constant default in place, which
-- leaves the table every other table points at untouched.
ALTER TABLE "Workspace" ADD COLUMN "agents_allowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "AgentAction_workspace_id_created_at_idx" ON "AgentAction"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_token_id_request_id_key" ON "AgentAction"("token_id", "request_id");

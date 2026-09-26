-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "message_of_the_day" TEXT,
    "org_type" TEXT,
    "work_email" TEXT,
    "color" TEXT,
    "avatar_url" TEXT,
    "wiki_enabled" BOOLEAN NOT NULL DEFAULT false,
    "wiki_editors_json" TEXT NOT NULL DEFAULT '[]',
    "wiki_feedback_list_id" TEXT,
    "is_personal" BOOLEAN NOT NULL DEFAULT false,
    "personal_owner_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Workspace" ("avatar_url", "color", "created_at", "id", "is_personal", "message_of_the_day", "name", "org_type", "personal_owner_id", "wiki_editors_json", "wiki_feedback_list_id", "work_email") SELECT "avatar_url", "color", "created_at", "id", "is_personal", "message_of_the_day", "name", "org_type", "personal_owner_id", "wiki_editors_json", "wiki_feedback_list_id", "work_email" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
CREATE UNIQUE INDEX "Workspace_personal_owner_id_key" ON "Workspace"("personal_owner_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

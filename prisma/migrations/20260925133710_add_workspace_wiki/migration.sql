-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Doc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "content" TEXT NOT NULL DEFAULT '',
    "color" TEXT,
    "text_color" TEXT,
    "ydoc" BLOB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" DATETIME,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_url" TEXT,
    "subtitle" TEXT,
    "page_width" TEXT NOT NULL DEFAULT 'normal',
    "show_last_modified" BOOLEAN NOT NULL DEFAULT true,
    "task_id" TEXT,
    "space_id" TEXT,
    "doc_folder_id" TEXT,
    "board_folder_id" TEXT,
    "parent_doc_id" TEXT,
    "owner_id" TEXT,
    "contributor_ids_json" TEXT NOT NULL DEFAULT '[]',
    "wiki_workspace_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Doc_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Doc_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Doc_doc_folder_id_fkey" FOREIGN KEY ("doc_folder_id") REFERENCES "DocFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Doc_board_folder_id_fkey" FOREIGN KEY ("board_folder_id") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Doc_parent_doc_id_fkey" FOREIGN KEY ("parent_doc_id") REFERENCES "Doc" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Doc_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Doc_wiki_workspace_id_fkey" FOREIGN KEY ("wiki_workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Doc" ("archived", "board_folder_id", "color", "content", "contributor_ids_json", "cover_image_url", "created_at", "deleted_at", "doc_folder_id", "id", "order", "owner_id", "page_width", "parent_doc_id", "show_last_modified", "space_id", "subtitle", "task_id", "text_color", "title", "updated_at", "ydoc") SELECT "archived", "board_folder_id", "color", "content", "contributor_ids_json", "cover_image_url", "created_at", "deleted_at", "doc_folder_id", "id", "order", "owner_id", "page_width", "parent_doc_id", "show_last_modified", "space_id", "subtitle", "task_id", "text_color", "title", "updated_at", "ydoc" FROM "Doc";
DROP TABLE "Doc";
ALTER TABLE "new_Doc" RENAME TO "Doc";
CREATE INDEX "Doc_space_id_deleted_at_idx" ON "Doc"("space_id", "deleted_at");
CREATE INDEX "Doc_wiki_workspace_id_deleted_at_idx" ON "Doc"("wiki_workspace_id", "deleted_at");
CREATE INDEX "Doc_task_id_idx" ON "Doc"("task_id");
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "message_of_the_day" TEXT,
    "org_type" TEXT,
    "work_email" TEXT,
    "color" TEXT,
    "avatar_url" TEXT,
    "wiki_editors_json" TEXT NOT NULL DEFAULT '[]',
    "wiki_feedback_list_id" TEXT,
    "is_personal" BOOLEAN NOT NULL DEFAULT false,
    "personal_owner_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Workspace" ("avatar_url", "color", "created_at", "id", "is_personal", "message_of_the_day", "name", "org_type", "personal_owner_id", "work_email") SELECT "avatar_url", "color", "created_at", "id", "is_personal", "message_of_the_day", "name", "org_type", "personal_owner_id", "work_email" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
CREATE UNIQUE INDEX "Workspace_personal_owner_id_key" ON "Workspace"("personal_owner_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

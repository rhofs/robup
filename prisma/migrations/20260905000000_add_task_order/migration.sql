-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "priority" INTEGER,
    "start_date" DATETIME,
    "due_date" DATETIME,
    "calendar_lane" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" DATETIME,
    "deleted_at" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "list_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "custom_field_values" TEXT NOT NULL DEFAULT '{}',
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "access_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Task_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("access_json", "archived", "archived_at", "calendar_lane", "created_at", "custom_field_values", "deleted_at", "description", "due_date", "id", "is_private", "list_id", "parent_id", "priority", "start_date", "status", "title", "updated_at") SELECT "access_json", "archived", "archived_at", "calendar_lane", "created_at", "custom_field_values", "deleted_at", "description", "due_date", "id", "is_private", "list_id", "parent_id", "priority", "start_date", "status", "title", "updated_at" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


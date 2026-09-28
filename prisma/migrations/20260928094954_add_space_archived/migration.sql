-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "text_color" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "cover_image_url" TEXT,
    "deleted_at" DATETIME,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "workspace_id" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "access_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Space_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Space" ("access_json", "color", "cover_image_url", "created_at", "deleted_at", "description", "icon", "id", "is_private", "name", "order", "text_color", "workspace_id") SELECT "access_json", "color", "cover_image_url", "created_at", "deleted_at", "description", "icon", "id", "is_private", "name", "order", "text_color", "workspace_id" FROM "Space";
DROP TABLE "Space";
ALTER TABLE "new_Space" RENAME TO "Space";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

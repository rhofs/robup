-- Folders, Lists and Docs at one level of a Space's sidebar now share one order (components/
-- FolderTree.tsx), so a List can sit between two Folders or above one (2026-10-21). Until now each
-- kind was ordered on its own and Folders were always drawn first.
--
-- Data only, no schema change. Every Folder gets a negative order, -n..-1 among its siblings in the
-- order they are shown in today (their own order, then insertion order for ties — what the sidebar
-- read). Lists and Docs keep theirs (0 and up), so under the shared order every Folder still comes
-- first and nothing moves on screen until someone drags something.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY space_id, parent_id ORDER BY "order", rowid) AS rn,
    COUNT(*) OVER (PARTITION BY space_id, parent_id) AS cnt
  FROM "Folder"
)
UPDATE "Folder" SET "order" = (SELECT rn - 1 - cnt FROM ranked WHERE ranked.id = "Folder".id);

-- One-time repair, data only: an event filed under a Space now always belongs to that Space's
-- workspace (enforced by the events API from 2026-10-07). Events created before that took the
-- workspace that happened to be active while the Space could be any workspace's, so some sit in the
-- wrong workspace — e.g. a Bleep Show (New Game Media) event filed under CRRM Media. Events with no
-- Space are left alone: nothing says where they belong.
--
-- Attendees and Google copies are not touched here: attendees from the old workspace stay on the
-- event, and any Google copies stay on the old workspace's calendar until the event is next edited.
UPDATE "Event"
SET "workspace_id" = (SELECT "Space"."workspace_id" FROM "Space" WHERE "Space"."id" = "Event"."space_id")
WHERE "space_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Space" WHERE "Space"."id" = "Event"."space_id")
  AND "workspace_id" <> (SELECT "Space"."workspace_id" FROM "Space" WHERE "Space"."id" = "Event"."space_id");

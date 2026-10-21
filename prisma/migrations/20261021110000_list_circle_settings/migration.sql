-- A List's own task circle and strike-through, chosen in its "Edit statuses" window. Null on every
-- existing List = its Space's, so nothing changes until a List chooses.
ALTER TABLE "List" ADD COLUMN "check_mode" TEXT;
ALTER TABLE "List" ADD COLUMN "strike_done" BOOLEAN;

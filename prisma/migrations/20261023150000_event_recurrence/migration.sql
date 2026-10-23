-- Hand-written instead of Prisma's generated rebuild of the Event table: plain ADD COLUMNs, verified
-- against the schema with `prisma migrate diff`.

-- Repeating events: the rule (null = a one-off, every existing event) and the days left out.
ALTER TABLE "Event" ADD COLUMN "recurrence" TEXT;
ALTER TABLE "Event" ADD COLUMN "recurrence_exceptions" TEXT NOT NULL DEFAULT '[]';

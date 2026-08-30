import { PrismaClient } from '@prisma/client';
import { pullChangesFromGoogle } from '../lib/google/calendarSync';

const prisma = new PrismaClient();

// The Google→Siqt half of two-way calendar sync (backlog #13) — run on a schedule (Pterodactyl
// Schedule, same precedent as scripts/backupDb.ts) since this app has no server-side cron of its
// own. Every EXISTING (user, workspace) calendar gets pulled independently — one calendar per
// workspace now, not one per user, so this iterates UserWorkspaceGoogleCalendar rows rather than
// connected users. A workspace with no calendar yet (nobody's synced anything to/from it) has
// nothing to poll, so it's simply not in this list — no need to enumerate workspace memberships
// separately. One row's failure (a revoked token, a deleted calendar) doesn't stop the others.
async function main() {
  const calendars = await prisma.userWorkspaceGoogleCalendar.findMany({
    select: { userId: true, workspaceId: true, user: { select: { name: true } }, workspace: { select: { name: true } } },
  });

  console.log(`Checking ${calendars.length} workspace calendar(s) for changes...`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  for (const cal of calendars) {
    const label = `${cal.user.name} / ${cal.workspace.name}`;
    try {
      const { created, updated, deleted } = await pullChangesFromGoogle(cal.userId, cal.workspaceId);
      if (created > 0 || updated > 0 || deleted > 0) {
        console.log(`${label}: ${created} imported, ${updated} updated, ${deleted} deleted`);
      }
      totalCreated += created;
      totalUpdated += updated;
      totalDeleted += deleted;
    } catch (err) {
      console.error(`Failed to sync calendar for ${label}:`, err);
    }
  }

  console.log(`Done — ${totalCreated} total imported, ${totalUpdated} total updated, ${totalDeleted} total deleted.`);
}

main()
  .catch((err) => {
    console.error('Calendar sync failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

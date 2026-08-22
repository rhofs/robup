import { PrismaClient } from '@prisma/client';
import { pullChangesFromGoogle } from '../lib/google/calendarSync';

const prisma = new PrismaClient();

// The Google→Siqt half of two-way calendar sync (backlog #13) — run on a schedule (Pterodactyl
// Schedule, same precedent as scripts/backupDb.ts) since this app has no server-side cron of its
// own. Every user with a Google connection gets pulled independently; one user's failure (a
// revoked token, a deleted calendar) doesn't stop the others.
async function main() {
  const users = await prisma.user.findMany({
    where: { googleRefreshToken: { not: null } },
    select: { id: true, name: true },
  });

  console.log(`Checking ${users.length} Google-connected user(s) for calendar changes...`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  for (const user of users) {
    try {
      const { created, updated, deleted } = await pullChangesFromGoogle(user.id);
      if (created > 0 || updated > 0 || deleted > 0) {
        console.log(`${user.name}: ${created} imported, ${updated} updated, ${deleted} deleted`);
      }
      totalCreated += created;
      totalUpdated += updated;
      totalDeleted += deleted;
    } catch (err) {
      console.error(`Failed to sync calendar for ${user.name} (${user.id}):`, err);
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

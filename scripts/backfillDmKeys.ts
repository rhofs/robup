import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-time backfill for the DM cross-workspace pivot — dmKey moved from
// `${workspaceId}:${sortedIds}` to a workspace-independent `sortedIds.join(':')`. Old rows are
// left with their old-format key otherwise (dmKey is only ever read for dedupe-on-create, never
// for lookup elsewhere — confirmed by grep), except that leaving them untouched would let the
// same pair create a second, duplicate DM the next time they message each other. Run once,
// manually, after `prisma db push` picks up the schema change.
async function main() {
  // group_dm rows keep dmKey: null untouched — they never deduped, no format change needed.
  const dms = await prisma.chatChannel.findMany({
    where: { type: 'dm' },
    include: { members: { select: { userId: true } } },
  });

  const seen = new Set<string>();
  const sorted = [...dms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  let updated = 0;
  for (const dm of sorted) {
    const ids = dm.members.map((m) => m.userId).sort();
    if (ids.length !== 2) continue; // defensive — a real 1:1 row always has exactly 2 members
    const newKey = ids.join(':');
    if (seen.has(newKey)) {
      console.log(`Skipping older duplicate DM ${dm.id} for pair ${newKey} (keeping most-recent as canonical)`);
      continue;
    }
    seen.add(newKey);
    await prisma.chatChannel.update({
      where: { id: dm.id },
      data: { dmKey: newKey, workspaceId: null },
    });
    updated += 1;
  }
  console.log(`Backfilled ${updated} DM(s), skipped ${sorted.length - updated} older duplicate(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

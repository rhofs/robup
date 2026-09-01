// Read-only diagnostic. Prints, per non-personal workspace and per member, exactly how many
// Spaces `GET /api/workspaces` would return for that person — by calling the route's own access
// helpers rather than reimplementing them, so the answer cannot drift from the real behaviour.
// Delete after use; nothing depends on this.
import { prisma } from '../lib/prisma';
import { getAccessContext, canSee } from '../lib/auth/access';

async function main() {
  const workspaces = await prisma.workspace.findMany({
    where: { isPersonal: false },
    include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
      spaces: { select: { id: true, name: true, isPrivate: true, accessJson: true } },
    },
  });

  for (const ws of workspaces) {
    console.log(`\n=== ${ws.name} (${ws.id}) ===`);
    console.log(`Spaces i databasen: ${ws.spaces.length}`);
    for (const s of ws.spaces) {
      console.log(`   - "${s.name}"  privat=${s.isPrivate}  grants=${s.accessJson || '(ingen)'}`);
    }
    console.log('Hva hver enkelt ville fått servert:');
    for (const m of ws.memberships) {
      const ctx = await getAccessContext(ws.id, m.user.id);
      const visible = ws.spaces.filter((s) => canSee(s, ctx));
      console.log(
        `   - ${m.user.name} <${m.user.email}> rolle=${m.role} -> ${visible.length} av ${ws.spaces.length} spaces` +
          (visible.length ? ` (${visible.map((v) => v.name).join(', ')})` : '')
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});

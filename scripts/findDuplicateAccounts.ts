// Read-only. Finds accounts that are the same email address stored with different capitalisation —
// the duplicate the signup route could create until 2026-09-04, because its uniqueness check was
// case-sensitive while Google-created accounts keep the provider's own casing.
//
// Prints what each duplicate owns, so a decision about merging is made with the facts in view.
// Deliberately does NOT merge or delete anything: merging accounts is destructive, and which one
// to keep depends on what is actually in them.
import { prisma } from '../lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, password: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byLowerEmail = new Map<string, typeof users>();
  for (const u of users) {
    if (!u.email) continue;
    const key = u.email.toLowerCase();
    byLowerEmail.set(key, [...(byLowerEmail.get(key) ?? []), u]);
  }

  const dupes = [...byLowerEmail.entries()].filter(([, list]) => list.length > 1);
  if (dupes.length === 0) {
    console.log('Ingen duplikater funnet — hver e-postadresse har nøyaktig én konto.');
    await prisma.$disconnect();
    return;
  }

  console.log(`FANT ${dupes.length} adresse(r) med mer enn én konto:\n`);
  for (const [email, list] of dupes) {
    console.log(`=== ${email} ===`);
    for (const u of list) {
      const [workspaces, tasks, messages] = await Promise.all([
        prisma.workspaceMembership.count({ where: { userId: u.id } }),
        prisma.task.count({ where: { assignees: { some: { id: u.id } } } }),
        prisma.chatMessage.count({ where: { authorId: u.id } }),
      ]);
      console.log(
        `  - "${u.name}" lagret som <${u.email}>\n` +
          `      id=${u.id}\n` +
          `      opprettet=${u.createdAt.toISOString()}  passord=${u.password ? 'ja' : 'nei (Google)'}\n` +
          `      workspaces=${workspaces}  tildelte oppgaver=${tasks}  meldinger=${messages}`
      );
    }
    console.log('');
  }
  console.log('Ingenting er endret. Del utskriften før noe slås sammen — sammenslåing kan ikke angres.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});

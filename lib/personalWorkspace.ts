import { prisma } from '@/lib/prisma';

// Find-or-create the single-member "personal" workspace that backs My Tasks.
//
// A single atomic `upsert` keyed on the unique `personalOwnerId` column — not findFirst-then-
// create, which raced under React Strict Mode's dev-mode effect double-invocation (two
// near-simultaneous requests both saw "nothing exists yet" and both created one). The unique
// constraint plus upsert make a duplicate impossible at the DB level regardless of how many
// concurrent callers there are.
//
// Extracted here so account creation can call it too. Previously this only ever ran lazily, the
// first time someone clicked "My Tasks" — which meant a brand-new account loaded the app with
// literally zero workspaces, and since almost every surface (nav tabs, Settings, the Spaces tree)
// keys off having one, nothing worked at all until they happened to create a real workspace.
// Reported live: "Ny lagd bruker. Ingenting funka bortsett fra create new workspace." Creating it
// up front is what makes "works with no workspace, everything private" actually true.
export async function ensurePersonalWorkspace(userId: string) {
  return prisma.workspace.upsert({
    where: { personalOwnerId: userId },
    update: {},
    create: {
      name: 'Personal',
      isPersonal: true,
      personalOwnerId: userId,
      // Sole member, always 'owner' — there's only ever one person in a personal workspace, so
      // the tier is moot in practice, but stays consistent with every other workspace's shape.
      memberships: { create: { userId, role: 'owner' } },
      spaces: { create: [{ name: 'Personal', lists: { create: [{ name: 'My tasks' }] } }] },
    },
    include: { spaces: { include: { lists: true } } },
  });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Find-or-create the user's single-member "personal" workspace behind the sidebar's private "My
// tasks" list. A single atomic `upsert` keyed on the unique `personalOwnerId` column — not a
// separate findFirst-then-create — since that shape raced under React Strict Mode's dev-mode
// effect double-invocation (two near-simultaneous requests both saw "nothing exists yet" and both
// created a workspace). The unique constraint plus upsert make a duplicate impossible at the DB
// level regardless of how many concurrent requests land.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const workspace = await prisma.workspace.upsert({
    where: { personalOwnerId: userId },
    update: {},
    create: {
      name: 'Personal',
      isPersonal: true,
      personalOwnerId: userId,
      members: { connect: { id: userId } },
      spaces: { create: [{ name: 'Personal', lists: { create: [{ name: 'My tasks' }] } }] },
    },
    include: { spaces: { include: { lists: true } } },
  });

  const space = workspace.spaces[0];
  const list = space?.lists[0];
  if (!space || !list) {
    // Extremely unlikely (the workspace existed but its default Space/List were somehow
    // removed) — create a fresh Space/List inside the existing personal workspace rather than
    // creating a second one.
    const newSpace = await prisma.space.create({
      data: { workspaceId: workspace.id, name: 'Personal', lists: { create: [{ name: 'My tasks' }] } },
      include: { lists: true },
    });
    return NextResponse.json({ workspaceId: workspace.id, spaceId: newSpace.id, listId: newSpace.lists[0].id });
  }

  return NextResponse.json({ workspaceId: workspace.id, spaceId: space.id, listId: list.id });
}

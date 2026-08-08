import { NextResponse } from 'next/server';
// Adjust this import to match how you fetch the Prisma client elsewhere in your project
// (usually a singleton in e.g. lib/prisma.ts)
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function GET() {
  const userId = await getCurrentUserId();
  // No identity asserted -> no workspaces. Real login now backs this identity (see auth.ts) —
  // signed-out requests must not be a way to bypass every private workspace's membership check.
  if (!userId) return NextResponse.json([]);

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { id: userId } } },
    include: {
      members: { select: publicUserSelect },
      rooms: { orderBy: { order: 'asc' } },
      spaces: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        include: {
          folders: { where: { deletedAt: null }, select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true } },
          lists: { where: { deletedAt: null }, select: { id: true, name: true, color: true, icon: true, folderId: true, order: true } },
          statuses: { orderBy: { order: 'asc' } },
          customFields: true,
          // Space.docs is already scoped by the spaceId foreign key — task-scoped docs (spaceId
          // null) never come back here, they stay reachable only via /api/tasks/[id]/docs.
          docFolders: { where: { deletedAt: null }, select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true } },
          docs: { where: { deletedAt: null }, select: { id: true, title: true, content: true, order: true, taskId: true, spaceId: true, folderId: true, createdAt: true, updatedAt: true } },
        },
      },
    },
  });

  const mapped = workspaces.map((ws) => ({
    ...ws,
    spaces: ws.spaces.map(({ docs, ...s }) => ({
      ...s,
      // Prisma's relation is named `docs` (matching the Doc model's `space` relation) — renamed
      // here to `spaceDocs` to match HierarchySpace's frontend field and avoid any confusion with
      // the store's separate top-level `docs: Record<taskId, TaskDoc[]>` state.
      spaceDocs: docs,
      customFields: s.customFields.map((cf) => ({
        ...cf,
        options: JSON.parse(cf.options),
      })),
    })),
  }));

  return NextResponse.json(mapped);
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json();

  const workspace = await prisma.workspace.create({
    data: {
      name: body.name || 'Untitled workspace',
      members: { connect: { id: userId } },
    },
    select: { id: true, name: true, messageOfTheDay: true, createdAt: true },
  });
  return NextResponse.json(workspace);
}

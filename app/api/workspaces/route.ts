import { NextResponse } from 'next/server';
// Adjust this import to match how you fetch the Prisma client elsewhere in your project
// (usually a singleton in e.g. lib/prisma.ts)
import { prisma } from '@/lib/prisma';

export async function GET() {
  const workspaces = await prisma.workspace.findMany({
    include: {
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

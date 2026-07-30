import { NextResponse } from 'next/server';
// Adjust this import to match how you fetch the Prisma client elsewhere in your project
// (usually a singleton in e.g. lib/prisma.ts)
import { prisma } from '@/lib/prisma';

export async function GET() {
  const workspaces = await prisma.workspace.findMany({
    include: {
      spaces: {
        orderBy: { order: 'asc' },
        include: {
          folders: { select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true } },
          lists: { select: { id: true, name: true, color: true, icon: true, folderId: true, order: true } },
          statuses: { orderBy: { order: 'asc' } },
          customFields: true,
        },
      },
    },
  });

  const mapped = workspaces.map((ws) => ({
    ...ws,
    spaces: ws.spaces.map((s) => ({
      ...s,
      customFields: s.customFields.map((cf) => ({
        ...cf,
        options: JSON.parse(cf.options),
      })),
    })),
  }));

  return NextResponse.json(mapped);
}

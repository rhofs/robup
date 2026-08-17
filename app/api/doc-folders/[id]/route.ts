import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cascadeDocFolder } from '@/lib/trashCascade';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureDocFolderAccess } from '@/lib/auth/resourceAccess';

// DocFolder/Doc rows each carry their own `spaceId` directly (not derived from ancestry), so
// moving a DocFolder into a different Space only updates its own row unless we walk its subtree
// too — same reasoning as app/api/folders/[id]/route.ts's collectDescendantFolderIds.
async function collectDescendantDocFolderIds(rootId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.docFolder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocFolderAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc folder' }, { status: 403 });

  if (body.restore === true) {
    await cascadeDocFolder(id, null);
    const folder = await prisma.docFolder.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true },
    });
    return NextResponse.json(folder);
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.parentId !== undefined) data.parentId = body.parentId;
  if (body.order !== undefined) data.order = body.order;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;

  if (body.spaceId !== undefined) {
    const descendantFolderIds = await collectDescendantDocFolderIds(id);
    const allFolderIds = [id, ...descendantFolderIds];
    await prisma.$transaction([
      prisma.docFolder.update({ where: { id }, data }),
      ...(descendantFolderIds.length > 0
        ? [prisma.docFolder.updateMany({ where: { id: { in: descendantFolderIds } }, data: { spaceId: body.spaceId } })]
        : []),
      prisma.doc.updateMany({ where: { folderId: { in: allFolderIds } }, data: { spaceId: body.spaceId } }),
    ]);
  } else {
    await prisma.docFolder.update({ where: { id }, data });
  }

  const folder = await prisma.docFolder.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true },
  });
  return NextResponse.json(folder);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocFolderAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc folder' }, { status: 403 });

  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    await prisma.docFolder.delete({ where: { id } });
  } else {
    await cascadeDocFolder(id, new Date());
  }
  return NextResponse.json({ ok: true });
}

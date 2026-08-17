import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cascadeFolder } from '@/lib/trashCascade';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';
import { ensureFolderAccess } from '@/lib/auth/resourceAccess';

// Folder/List rows each carry their own `spaceId` directly (not derived from ancestry), so
// moving a folder into a different Space only updates its own row unless we walk its subtree
// too — otherwise every list and sub-folder nested inside would silently keep pointing at the
// old Space, orphaned from the piece of the tree that moved.
async function collectDescendantFolderIds(rootId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.folder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
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
  if (!(await ensureFolderAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this folder' }, { status: 403 });

  if (body.restore === true) {
    await cascadeFolder(id, null);
    const folder = await prisma.folder.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, color: true, textColor: true, icon: true, spaceId: true, parentId: true, order: true, isPrivate: true, accessJson: true },
    });
    return NextResponse.json(folder);
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;
  if (body.textColor !== undefined) data.textColor = body.textColor;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.parentId !== undefined) data.parentId = body.parentId;
  if (body.order !== undefined) data.order = body.order;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;

  // Stricter, separate Owner/Admin-only gate on top of the plain "can you see this" check above.
  if (body.isPrivate !== undefined || body.accessJson !== undefined) {
    const existing = await prisma.folder.findUnique({ where: { id }, select: { space: { select: { workspaceId: true } } } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const role = await getWorkspaceRole(existing.space.workspaceId, userId);
    if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can change access' }, { status: 403 });
    if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;
    if (body.accessJson !== undefined) data.accessJson = body.accessJson;
  }

  if (body.spaceId !== undefined) {
    const descendantFolderIds = await collectDescendantFolderIds(id);
    const allFolderIds = [id, ...descendantFolderIds];
    await prisma.$transaction([
      prisma.folder.update({ where: { id }, data }),
      ...(descendantFolderIds.length > 0
        ? [prisma.folder.updateMany({ where: { id: { in: descendantFolderIds } }, data: { spaceId: body.spaceId } })]
        : []),
      prisma.list.updateMany({ where: { folderId: { in: allFolderIds } }, data: { spaceId: body.spaceId } }),
    ]);
  } else {
    await prisma.folder.update({ where: { id }, data });
  }

  const folder = await prisma.folder.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, color: true, textColor: true, icon: true, spaceId: true, parentId: true, order: true },
  });
  return NextResponse.json(folder);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureFolderAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this folder' }, { status: 403 });

  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    await prisma.folder.delete({ where: { id } });
  } else {
    await cascadeFolder(id, new Date());
  }
  return NextResponse.json({ ok: true });
}

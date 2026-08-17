import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cascadeList } from '@/lib/trashCascade';
import { archiveList } from '@/lib/archiveCascade';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';
import { ensureListAccess } from '@/lib/auth/resourceAccess';

const LIST_SELECT = {
  id: true,
  name: true,
  color: true,
  textColor: true,
  icon: true,
  spaceId: true,
  folderId: true,
  order: true,
  archived: true,
  isPrivate: true,
  accessJson: true,
} as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureListAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this list' }, { status: 403 });

  if (body.restore === true) {
    await cascadeList(id, null);
    const list = await prisma.list.findUniqueOrThrow({ where: { id }, select: LIST_SELECT });
    return NextResponse.json(list);
  }

  // Archiving/restoring cascades to every Task inside (lib/archiveCascade.ts) — a plain field
  // set on the generic `data` object below wouldn't touch those, so this is handled separately,
  // same pattern as the `restore` branch just above.
  if (body.archived !== undefined) {
    await archiveList(id, body.archived);
    const list = await prisma.list.findUniqueOrThrow({ where: { id }, select: LIST_SELECT });
    return NextResponse.json(list);
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;
  if (body.textColor !== undefined) data.textColor = body.textColor;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.folderId !== undefined) data.folderId = body.folderId;
  if (body.order !== undefined) data.order = body.order;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;

  // Stricter, separate Owner/Admin-only gate on top of the plain "can you see this" check above.
  if (body.isPrivate !== undefined || body.accessJson !== undefined) {
    const existing = await prisma.list.findUnique({ where: { id }, select: { space: { select: { workspaceId: true } } } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const role = await getWorkspaceRole(existing.space.workspaceId, userId);
    if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can change access' }, { status: 403 });
    if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;
    if (body.accessJson !== undefined) data.accessJson = body.accessJson;
  }

  const list = await prisma.list.update({
    where: { id },
    data,
    select: LIST_SELECT,
  });
  return NextResponse.json(list);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureListAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this list' }, { status: 403 });

  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    await prisma.list.delete({ where: { id } });
  } else {
    await cascadeList(id, new Date());
  }
  return NextResponse.json({ ok: true });
}

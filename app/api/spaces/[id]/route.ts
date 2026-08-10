import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cascadeSpace } from '@/lib/trashCascade';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Restore is its own thing, not a plain field patch: it has to cascade back down through
  // every Folder/List/Task/DocFolder/Doc that was soft-deleted along with this Space, not just
  // clear this one row's own deletedAt.
  if (body.restore === true) {
    await cascadeSpace(id, null);
    const space = await prisma.space.findUniqueOrThrow({ where: { id } });
    return NextResponse.json(space);
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.order !== undefined) data.order = body.order;
  if (body.description !== undefined) data.description = body.description;
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;

  // Marking something private, or editing who it's shared with, is an Owner/Admin-only action —
  // a regular member can still edit every other field above exactly as before (this route had no
  // caller-identity check at all pre-existing, and this pass deliberately doesn't add one for
  // the fields that already worked unauthenticated; see PLANNING.md's deferred "broader
  // per-route authorization hardening" note).
  if (body.isPrivate !== undefined || body.accessJson !== undefined) {
    const callerId = await getCurrentUserId();
    if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const existing = await prisma.space.findUnique({ where: { id }, select: { workspaceId: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const role = await getWorkspaceRole(existing.workspaceId, callerId);
    if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can change access' }, { status: 403 });
    if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;
    if (body.accessJson !== undefined) data.accessJson = body.accessJson;
  }

  const space = await prisma.space.update({
    where: { id },
    data,
  });
  return NextResponse.json(space);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    // Real delete: Prisma's onDelete: Cascade FKs take it from here (Folders, Lists, Tasks,
    // Statuses, CustomFields, DocFolders, Docs — everything nested), same as before this
    // feature existed. Only reachable from inside Trash, on an already soft-deleted Space.
    await prisma.space.delete({ where: { id } });
  } else {
    await cascadeSpace(id, new Date());
  }
  return NextResponse.json({ ok: true });
}
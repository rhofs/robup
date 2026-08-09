import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

async function requireManager(workspaceId: string) {
  const callerId = await getCurrentUserId();
  if (!callerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const role = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(role)) return { error: NextResponse.json({ error: 'Only the workspace owner/admins can manage roles' }, { status: 403 }) };
  return { callerId };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  const { id: workspaceId, roleId } = await params;
  const { error } = await requireManager(workspaceId);
  if (error) return error;

  const body = await req.json();
  const data: { name?: string; color?: string } = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.color === 'string') data.color = body.color;

  const updated = await prisma.role.update({
    where: { id: roleId },
    data,
    include: { members: { select: { id: true } } },
  });
  return NextResponse.json({ id: updated.id, name: updated.name, color: updated.color, memberIds: updated.members.map((m) => m.id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  const { id: workspaceId, roleId } = await params;
  const { error } = await requireManager(workspaceId);
  if (error) return error;

  // Any Space/Folder/List/Task granting access to this Role via accessJson keeps that (now
  // dangling) id around — harmless by design, same as every other dangling-reference case in
  // this app (see lib/auth/access.ts's comment on why that's an accepted tradeoff here).
  await prisma.role.delete({ where: { id: roleId } });
  return NextResponse.json({ ok: true });
}

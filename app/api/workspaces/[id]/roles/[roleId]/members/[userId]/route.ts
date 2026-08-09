import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; roleId: string; userId: string }> }) {
  const { id: workspaceId, roleId, userId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const callerRole = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(callerRole)) return NextResponse.json({ error: 'Only the workspace owner/admins can manage roles' }, { status: 403 });

  await prisma.role.update({
    where: { id: roleId },
    data: { members: { disconnect: { id: userId } } },
  });
  return NextResponse.json({ ok: true });
}

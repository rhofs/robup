import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  const { id: workspaceId, roleId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const callerRole = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(callerRole)) return NextResponse.json({ error: 'Only the workspace owner/admins can manage roles' }, { status: 403 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  // A Role only makes sense for people actually in this workspace — assigning it to someone
  // outside it would grant them nothing (canSee() checks workspace membership independently
  // anyway) but would be a confusing, meaningless state to leave lying around.
  const targetMembership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: body.userId } },
  });
  if (!targetMembership) return NextResponse.json({ error: 'That user is not a member of this workspace' }, { status: 400 });

  await prisma.role.update({
    where: { id: roleId },
    data: { members: { connect: { id: body.userId } } },
  });
  return NextResponse.json({ ok: true });
}

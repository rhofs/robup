import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

// Declining (by the recipient) or cancelling (by the inviting workspace's Owner/Admin) is the
// same action either way — the invite row just goes away, nothing else to do (this never created
// a membership in the first place). Distinguished only by who's allowed to call it.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const invite = await prisma.workspaceMemberInvite.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (invite.toUserId !== callerId) {
    const role = await getWorkspaceRole(invite.workspaceId, callerId);
    if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  await prisma.workspaceMemberInvite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

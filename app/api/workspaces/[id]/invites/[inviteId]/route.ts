import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

// "Revoking" a link is just deleting this row — GET /api/invites/[code] and the accept route
// both already treat a missing row as an invalid/expired invite, so no separate `revoked` flag
// was needed on the schema.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const { id: workspaceId, inviteId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const role = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can manage invites' }, { status: 403 });

  await prisma.workspaceInvite.deleteMany({ where: { id: inviteId, workspaceId } });
  return NextResponse.json({ ok: true });
}

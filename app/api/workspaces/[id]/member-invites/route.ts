import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';
import { getConnectedUserIds } from '@/lib/auth/connections';

// Pending targeted invites for THIS workspace (backlog #8) — Owner/Admin only, shown in Workspace
// Settings' Invite tab alongside the existing reusable-link list.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json([]);
  const role = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(role)) return NextResponse.json([]);

  const invites = await prisma.workspaceMemberInvite.findMany({
    where: { workspaceId: id },
    include: { toUser: { select: publicUserSelect }, invitedBy: { select: publicUserSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(invites);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const role = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can invite' }, { status: 403 });

  const body = await req.json();
  if (!body.toUserId) return NextResponse.json({ error: 'Missing toUserId' }, { status: 400 });

  // Scoped to the caller's own Network (Connections + coworkers across shared workspaces) — this
  // is meant to be a "invite via Network" flow, not an open invite-any-user-id-you-know endpoint.
  const connectedIds = await getConnectedUserIds(callerId);
  if (!connectedIds.has(body.toUserId)) {
    return NextResponse.json({ error: 'You can only invite someone from your Network' }, { status: 403 });
  }

  const alreadyMember = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: body.toUserId } },
  });
  if (alreadyMember) return NextResponse.json({ error: 'That person is already a member' }, { status: 400 });

  try {
    const invite = await prisma.workspaceMemberInvite.create({
      data: {
        workspaceId: id,
        toUserId: body.toUserId,
        invitedById: callerId,
        role: body.role === 'admin' ? 'admin' : 'member',
      },
      include: { toUser: { select: publicUserSelect }, invitedBy: { select: publicUserSelect } },
    });
    return NextResponse.json(invite);
  } catch {
    // Unique constraint (workspaceId, toUserId) — an invite to this person is already pending.
    return NextResponse.json({ error: 'An invite is already pending for that person' }, { status: 409 });
  }
}

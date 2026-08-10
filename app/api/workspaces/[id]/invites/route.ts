import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

async function requireManager(workspaceId: string) {
  const callerId = await getCurrentUserId();
  if (!callerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const role = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(role)) return { error: NextResponse.json({ error: 'Only the workspace owner/admins can manage invites' }, { status: 403 }) };
  return { callerId };
}

// Lists this workspace's active (reusable, un-expiring — see schema comment) invite links —
// Owner/Admin only, same as everything else that manages who can get into a workspace.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const { error } = await requireManager(workspaceId);
  if (error) return error;

  const invites = await prisma.workspaceInvite.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, role: true, createdAt: true, createdBy: { select: publicUserSelect } },
  });
  return NextResponse.json(invites);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const { error, callerId } = await requireManager(workspaceId);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  // Never 'owner' — that tier is fixed at creation with no transfer mechanism (see schema comment).
  const role = body.role === 'admin' ? 'admin' : 'member';

  const invite = await prisma.workspaceInvite.create({
    data: { workspaceId, role, createdById: callerId! },
    select: { id: true, role: true, createdAt: true, createdBy: { select: publicUserSelect } },
  });
  return NextResponse.json(invite);
}

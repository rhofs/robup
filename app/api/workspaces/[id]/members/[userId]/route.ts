import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const callerRole = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(callerRole)) return NextResponse.json({ error: 'Not authorized to manage this workspace' }, { status: 403 });

  const target = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId } } });
  // The Owner row can't be removed through this route — there's no ownership-transfer feature,
  // so removing it would leave the workspace permanently ownerless. Deleting the workspace
  // itself (Owner-only) is the only way to get rid of an Owner's membership.
  if (target?.role === 'owner') return NextResponse.json({ error: "Can't remove the workspace owner" }, { status: 403 });

  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: id, userId } });
  return NextResponse.json({ ok: true });
}

// Promote/demote between 'admin' and 'member' — a separate, explicit action from add/remove
// above. Never targets or produces an 'owner' row: that tier is fixed at workspace creation and
// has no transfer mechanism yet (see PLANNING.md's deferred list).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const callerRole = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(callerRole)) return NextResponse.json({ error: 'Not authorized to manage this workspace' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const role = body.role;
  if (role !== 'admin' && role !== 'member') return NextResponse.json({ error: "role must be 'admin' or 'member'" }, { status: 400 });

  const target = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId } } });
  if (!target) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 404 });
  if (target.role === 'owner') return NextResponse.json({ error: "Can't change the workspace owner's role" }, { status: 403 });

  const updated = await prisma.workspaceMembership.update({
    where: { workspaceId_userId: { workspaceId: id, userId } },
    data: { role },
  });
  return NextResponse.json({ ok: true, role: updated.role });
}

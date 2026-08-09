import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Adding someone to a workspace is now an Owner/Admin action, not "any current member" — same
  // tightening the role tier itself exists for (see lib/auth/access.ts).
  const callerRole = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(callerRole)) return NextResponse.json({ error: 'Not authorized to manage this workspace' }, { status: 403 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  // Always adds as 'member' — promoting to Admin is a separate, explicit action (PATCH on the
  // [userId] route below), never bundled into the initial add.
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: id, userId: body.userId } },
    update: {},
    create: { workspaceId: id, userId: body.userId, role: 'member' },
  });
  return NextResponse.json({ ok: true });
}

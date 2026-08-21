import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const invite = await prisma.workspaceMemberInvite.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.toUserId !== callerId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  // upsert, not create — the inviter and the recipient accepting could in principle race with
  // some other path into membership (e.g. a reusable invite link accepted in another tab at the
  // same time); same "atomic find-or-create" precedent as POST /api/workspaces/personal.
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: callerId } },
    update: {},
    create: { workspaceId: invite.workspaceId, userId: callerId, role: invite.role },
  });
  await prisma.workspaceMemberInvite.delete({ where: { id } });

  return NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
}

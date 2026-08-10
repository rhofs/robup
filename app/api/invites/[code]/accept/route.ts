import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const invite = await prisma.workspaceInvite.findUnique({ where: { id: code } });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 });

  // Already a member (e.g. clicking the same link twice, or an Owner/Admin using their own
  // invite) — a friendly no-op, not an error, same spirit as Discord letting you rejoin a server
  // you're already in via its invite link. Never touches an existing 'owner'/'admin' row's role —
  // only creates a fresh membership at the invite's role if none exists yet.
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
    update: {},
    create: { workspaceId: invite.workspaceId, userId, role: invite.role },
  });

  return NextResponse.json({ workspaceId: invite.workspaceId });
}

import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// My own pending invites — across every workspace, not scoped to one (unlike
// GET /api/workspaces/[id]/member-invites, which is the Owner/Admin-facing "who have I invited
// to THIS workspace" list). This is the recipient side: what shows up as a real notification,
// same shape as GET /api/connections/requests's own "incoming" list.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const invites = await prisma.workspaceMemberInvite.findMany({
    where: { toUserId: userId },
    include: {
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: publicUserSelect },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(invites);
}

import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getConnectedUserIds } from '@/lib/auth/connections';

// Global (workspace-independent) DM/group-DM list+create — replaces
// /api/workspaces/[id]/dms now that a DM is never scoped to one workspace (Connections work).
// Deliberately separate from /channels, not a `type` query param on that same route, since
// visibility works completely differently (real ChatChannelMember membership, never canSee — see
// PLANNING.md's "canSee vs membership split" note and lib/auth/chatAccess.ts's own comment).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const dms = await prisma.chatChannel.findMany({
    where: { type: { in: ['dm', 'group_dm'] }, deletedAt: null, members: { some: { userId } } },
    include: { members: { include: { user: { select: publicUserSelect } } } },
    orderBy: { lastMessageAt: 'desc' },
  });
  return NextResponse.json(dms);
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const rawMemberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : [];
  const memberIds = [...new Set(rawMemberIds)].filter((id) => id !== userId);
  if (memberIds.length === 0) {
    return NextResponse.json({ error: 'Pick at least one other person to message' }, { status: 400 });
  }

  // Every target must be a connection of the CALLER's (explicit Connection row, or sharing any
  // Workspace) — the invitees don't need to be pairwise-connected to each other, same as
  // Slack/Discord letting you group people from your own contacts who may be strangers to one
  // another.
  const connectedIds = await getConnectedUserIds(userId);
  const notConnected = memberIds.filter((id) => !connectedIds.has(id));
  if (notConnected.length > 0) {
    return NextResponse.json({ error: 'You can only message people you are connected with' }, { status: 403 });
  }

  const include = { members: { include: { user: { select: publicUserSelect } } } } as const;

  // 1:1 — dedupe via dmKey, so messaging the same person twice reopens the one existing
  // conversation instead of forking a new one every time.
  if (memberIds.length === 1) {
    const dmKey = [userId, memberIds[0]].sort().join(':');
    const existing = await prisma.chatChannel.findUnique({ where: { dmKey }, include });
    if (existing) return NextResponse.json(existing);

    const created = await prisma.chatChannel.create({
      data: {
        type: 'dm',
        dmKey,
        createdById: userId,
        members: { create: [{ userId }, { userId: memberIds[0] }] },
      },
      include,
    });
    return NextResponse.json(created);
  }

  // Group DM — deliberately never deduped, matching real Slack/Discord: every "create group"
  // makes a genuinely new conversation, even with identical membership to an existing one.
  const created = await prisma.chatChannel.create({
    data: {
      type: 'group_dm',
      dmKey: null,
      createdById: userId,
      members: { create: [userId, ...memberIds].map((id) => ({ userId: id })) },
    },
    include,
  });
  return NextResponse.json(created);
}

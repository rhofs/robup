import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext, canSee, type AccessJsonEntry } from '@/lib/auth/access';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const ctx = await getAccessContext(workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json([]);

  const channels = await prisma.chatChannel.findMany({
    where: { workspaceId, type: 'channel', deletedAt: null },
    // Same shape as a dm/group_dm row's `.members` — lets ChatPanel/ChatThreadPanel resolve
    // author names for both channel types from one identical code path, no separate
    // workspace-member lookup needed.
    include: { members: { include: { user: { select: publicUserSelect } } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(channels.filter((c) => canSee(c, ctx)));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const ctx = await getAccessContext(workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  }

  const isPrivate = !!body.isPrivate;
  const accessEntries: AccessJsonEntry[] = isPrivate && Array.isArray(body.accessEntries) ? body.accessEntries : [];

  const channel = await prisma.chatChannel.create({
    data: {
      workspaceId,
      type: 'channel',
      name: body.name.trim(),
      topic: body.topic || null,
      taskId: body.taskId || null,
      spaceId: body.spaceId || null,
      isPrivate,
      accessJson: JSON.stringify(accessEntries),
      createdById: userId,
      members: { create: { userId } },
    },
    include: { members: { include: { user: { select: publicUserSelect } } } },
  });

  // Directly-granted users get their membership row created now too, so "who's allowed" (accessJson)
  // and "who's actually a member" (where lastReadAt will live) stay in sync — role-based grants get
  // lazy membership on first open/post instead, kept simple for Phase 1 (see PLANNING.md).
  const grantedUserIds = accessEntries.filter((e) => e.type === 'user' && e.id !== userId).map((e) => e.id);
  if (grantedUserIds.length > 0) {
    await Promise.all(
      grantedUserIds.map((uid) =>
        prisma.chatChannelMember.upsert({
          where: { channelId_userId: { channelId: channel.id, userId: uid } },
          update: {},
          create: { channelId: channel.id, userId: uid },
        })
      )
    );
  }

  return NextResponse.json(channel);
}

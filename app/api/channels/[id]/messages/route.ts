import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';
import { broadcastChatSignal } from '@/lib/collab/broadcastChatSignal';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const channel = await ensureChannelAccess(channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  // Lazy-join-on-open, per PLANNING.md — a public channel never needs an explicit "Join" click.
  await prisma.chatChannelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    update: {},
    create: { channelId, userId },
  });

  const messages = await prisma.chatMessage.findMany({
    where: { channelId, threadRootId: null },
    include: { author: { select: publicUserSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(messages);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const channel = await ensureChannelAccess(channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  const body = await req.json();
  if (!body.body || !body.body.trim()) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  await prisma.chatChannelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    update: {},
    create: { channelId, userId },
  });

  const message = await prisma.chatMessage.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      channelId,
      authorId: userId,
      body: body.body,
    },
    include: { author: { select: publicUserSelect } },
  });

  // Fire-and-forget — never block the response on the sidecar broadcast (see broadcastChatSignal's
  // own comment). The message is already durably committed above regardless of whether this lands.
  broadcastChatSignal(channelId);

  return NextResponse.json(message);
}

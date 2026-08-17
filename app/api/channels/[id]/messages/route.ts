import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';
import { broadcastChatSignal } from '@/lib/collab/broadcastChatSignal';
import { validateChatAttachment } from '@/lib/chatAttachment';

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
    include: { author: { select: publicUserSelect }, attachments: true, reactions: { include: { user: { select: publicUserSelect } } } },
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
  const attachment = validateChatAttachment(body.attachment);
  // An image-only message (no text) is valid, same as Discord/Slack — only reject when there's
  // neither a real body nor an attachment to send.
  if ((!body.body || !body.body.trim()) && !attachment) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  await prisma.chatChannelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    update: {},
    create: { channelId, userId },
  });

  // Quote-reply: the snapshot is captured here, server-side, from the quoted message's *current*
  // row — never trusted from the client — so it can't be spoofed and so it keeps showing what was
  // actually quoted even after the original is later edited or hard-deleted (quotedMessageId
  // itself goes null on delete via onDelete: SetNull; the snapshot columns are untouched by that
  // relation, so they survive independently). Only a message already in this same channel can be
  // quoted — silently ignored (not an error) if the id is missing/wrong-channel, since a stale
  // quote target (e.g. a race with someone else deleting it a moment earlier) shouldn't block
  // sending the reply itself.
  let quoteData: { quotedMessageId?: string; quotedBodySnapshot?: string; quotedAuthorId?: string | null } = {};
  if (typeof body.quotedMessageId === 'string') {
    const quoted = await prisma.chatMessage.findFirst({ where: { id: body.quotedMessageId, channelId } });
    if (quoted) {
      quoteData = { quotedMessageId: quoted.id, quotedBodySnapshot: quoted.body, quotedAuthorId: quoted.authorId };
    }
  }

  const message = await prisma.chatMessage.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      channelId,
      authorId: userId,
      body: body.body || '',
      ...quoteData,
      ...(attachment ? { attachments: { create: attachment } } : {}),
    },
    include: { author: { select: publicUserSelect }, attachments: true, reactions: { include: { user: { select: publicUserSelect } } } },
  });

  // Denormalized recency for the DM/group-chat list's sort order (GET /api/dms) — a real channel
  // also has this field but nothing currently reads it for channels, so bumping it unconditionally
  // here is harmless.
  await prisma.chatChannel.update({ where: { id: channelId }, data: { lastMessageAt: message.createdAt } });

  // Fire-and-forget — never block the response on the sidecar broadcast (see broadcastChatSignal's
  // own comment). The message is already durably committed above regardless of whether this lands.
  broadcastChatSignal(channelId);

  return NextResponse.json(message);
}

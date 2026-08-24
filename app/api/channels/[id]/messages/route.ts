import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';
import { broadcastChatSignal } from '@/lib/collab/broadcastChatSignal';
import { validateChatAttachment } from '@/lib/chatAttachment';
import { sendPushToUser } from '@/lib/push';

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

  // Mark-as-read: opening a channel's message list IS "reading" it, client-side — catch the
  // caller up to the latest message that existed at fetch time (Phase 8, unread badges). A
  // message that arrives a moment after this response is correctly still unread until the next
  // open. The membership row is guaranteed to exist from the upsert just above, plain update.
  const latest = messages[messages.length - 1];
  await prisma.chatChannelMember.update({
    where: { channelId_userId: { channelId, userId } },
    data: { lastReadAt: new Date(), lastReadMessageId: latest?.id ?? null },
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

  // Real push notifications (deferred until HTTPS existed, unblocked by the siqt.no deploy) —
  // every other member of this channel/DM (DMs are ChatChannel rows too, same route), not just
  // whoever's currently looking at ChatPanel. sendPushToUser is a no-op if VAPID isn't configured
  // and never throws, so this can't affect the response either way.
  prisma.chatChannelMember
    .findMany({ where: { channelId, userId: { not: userId } }, select: { userId: true, muted: true } })
    .then((members) => {
      const title = channel.type === 'dm' || channel.type === 'group_dm' ? (message.author?.name ?? 'Someone') : `#${channel.name}`;
      const body = message.body?.trim() || (attachment ? '📎 Attachment' : '');
      for (const m of members) {
        // Muted (backlog #6) — the message still lands and stores normally, this member just
        // doesn't get pinged about it. Matches the unread-badge skip in lib/chatUnread.ts.
        if (m.muted) continue;
        sendPushToUser(m.userId, { title, body, url: '/' }).catch(() => {});
      }
    })
    .catch(() => {});

  return NextResponse.json(message);
}

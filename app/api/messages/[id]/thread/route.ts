import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';
import { broadcastChatSignal } from '@/lib/collab/broadcastChatSignal';
import { validateChatAttachment } from '@/lib/chatAttachment';

// Thread replies to one root message — deliberately a *separate* id namespace from
// /api/channels/[id]/messages rather than a query param on it: the main feed route only ever
// returns `threadRootId: null` rows (built that way since Phase 1, so thread replies never leaked
// into the main feed even before this route existed), and this one only ever returns
// `threadRootId: <id>` rows. Access is still gated through the *channel* the root belongs to
// (ensureChannelAccess — same DM-vs-channel membership split as everywhere else in chat), not
// some new thread-level permission concept.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rootId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const root = await prisma.chatMessage.findUnique({ where: { id: rootId } });
  if (!root) return NextResponse.json([]);
  const channel = await ensureChannelAccess(root.channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  const replies = await prisma.chatMessage.findMany({
    where: { threadRootId: rootId },
    include: { author: { select: publicUserSelect }, attachments: true, reactions: { include: { user: { select: publicUserSelect } } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(replies);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rootId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const root = await prisma.chatMessage.findUnique({ where: { id: rootId } });
  if (!root) return NextResponse.json({ error: 'Thread root not found' }, { status: 404 });
  // A reply-to-a-reply would technically create a second-level thread — not a concept this schema
  // supports (threadRootId always points at the real root, never chains); reject rather than
  // silently attaching the wrong root.
  if (root.threadRootId) return NextResponse.json({ error: 'Cannot start a thread on a thread reply' }, { status: 400 });

  const channel = await ensureChannelAccess(root.channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  const body = await req.json();
  const attachment = validateChatAttachment(body.attachment);
  if ((!body.body || !body.body.trim()) && !attachment) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  await prisma.chatChannelMember.upsert({
    where: { channelId_userId: { channelId: root.channelId, userId } },
    update: {},
    create: { channelId: root.channelId, userId },
  });

  // Same server-side-only quote snapshot as the main feed's POST route — a thread reply can also
  // be a quote-reply at once (the schema's threadRootId and quotedMessageId are fully orthogonal
  // columns), quoting anything in the same channel, not just something inside this thread.
  let quoteData: { quotedMessageId?: string; quotedBodySnapshot?: string; quotedAuthorId?: string | null } = {};
  if (typeof body.quotedMessageId === 'string') {
    const quoted = await prisma.chatMessage.findFirst({ where: { id: body.quotedMessageId, channelId: root.channelId } });
    if (quoted) {
      quoteData = { quotedMessageId: quoted.id, quotedBodySnapshot: quoted.body, quotedAuthorId: quoted.authorId };
    }
  }

  const [reply] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        channelId: root.channelId,
        authorId: userId,
        body: body.body || '',
        threadRootId: rootId,
        ...quoteData,
        ...(attachment ? { attachments: { create: attachment } } : {}),
      },
      include: { author: { select: publicUserSelect }, attachments: true, reactions: { include: { user: { select: publicUserSelect } } } },
    }),
    prisma.chatMessage.update({ where: { id: rootId }, data: { threadReplyCount: { increment: 1 } } }),
    // A thread reply is still activity in that channel — keep GET /api/dms's recency sort in sync.
    prisma.chatChannel.update({ where: { id: root.channelId }, data: { lastMessageAt: new Date() } }),
  ]);

  // Same channel-wide signal a normal message uses — the main feed refetches and picks up the
  // root's now-incremented threadReplyCount; an open thread panel for this same root refetches
  // its own reply list on the identical signal.
  broadcastChatSignal(root.channelId);

  return NextResponse.json(reply);
}

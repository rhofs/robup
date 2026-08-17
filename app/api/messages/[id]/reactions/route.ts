import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';
import { broadcastChatSignal } from '@/lib/collab/broadcastChatSignal';

// Toggle — creates the (messageId, userId, emoji) row if it doesn't exist yet, deletes it if it
// does. One POST endpoint doing both (not separate POST/DELETE) matches the picker's own "click to
// react, click your own reaction again to remove it" UX, and means the client never has to track
// "do I currently have this reaction" just to pick the right HTTP verb — the toggle result is
// always whatever the server's row now says. Same channel-wide broadcast every other
// message-mutating route fires, so another open tab sees a reaction land live.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  const channel = await ensureChannelAccess(message.channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  const body = await req.json();
  const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
  // A raw unicode emoji is at most a handful of codepoints (e.g. a flag or a skin-tone modifier
  // sequence) — reject anything wildly longer than that rather than trusting an arbitrary
  // client-supplied string into this column unbounded. No custom/shortcode emoji in v1 (schema's
  // own comment), so this is deliberately loose, not a real allowlist of specific emoji.
  if (!emoji || [...emoji].length > 8) {
    return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
  }

  const existing = await prisma.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  if (existing) {
    await prisma.chatReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.chatReaction.create({ data: { messageId, userId, emoji } });
  }

  broadcastChatSignal(message.channelId);

  const reactions = await prisma.chatReaction.findMany({
    where: { messageId },
    include: { user: { select: publicUserSelect } },
  });
  return NextResponse.json({ reactions });
}

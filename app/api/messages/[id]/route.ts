import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { broadcastChatSignal } from '@/lib/collab/broadcastChatSignal';

// Hard delete, per the already-confirmed v1 decision (see PLANNING.md's "Two decisions already
// confirmed directly with the user" note) — no soft-delete/Trash/restore for individual messages,
// deliberately simpler than this app's usual Trash convention for everything else. Only the
// message's own author can delete it (the simplest sensible v1 rule; no moderator/manager
// override yet, unlike channel rename which is open to every member).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (message.authorId !== userId) return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });

  // quotedBy's onDelete: SetNull clears quotedMessageId on anything that quoted this message —
  // quotedBodySnapshot/quotedAuthorId are plain columns, untouched by that relation, so a message
  // that quoted this one keeps showing what was actually quoted even after this delete.
  //
  // If this message is itself a thread reply, the root's denormalized threadReplyCount needs the
  // matching decrement in the same transaction — nothing does that automatically the way
  // threadReplies' onDelete: SetNull handles *deleting the root* (that case needs no bookkeeping
  // at all, the root and its count are simply gone together).
  await prisma.$transaction([
    prisma.chatMessage.delete({ where: { id: messageId } }),
    ...(message.threadRootId ? [prisma.chatMessage.update({ where: { id: message.threadRootId }, data: { threadReplyCount: { decrement: 1 } } })] : []),
  ]);

  broadcastChatSignal(message.channelId);

  return NextResponse.json({ ok: true, threadRootId: message.threadRootId });
}

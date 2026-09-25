import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { notifyTaskCommentMentions } from '@/lib/mentionRecipients';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    include: { author: { select: publicUserSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  try {
    const body = await req.json();
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }
    const comment = await prisma.comment.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        taskId: id,
        body: body.body,
        type: body.type || 'comment',
        activityKind: body.activityKind || null,
        // The real signed-in caller (already verified above), not the client-supplied
        // body.authorId this used to trust directly — same spoofable-identity class as the
        // Google Doc export bug fixed earlier this project (a malformed/direct API call could
        // otherwise attribute a comment to any user id it liked).
        authorId: userId,
      },
      include: { author: { select: publicUserSelect } },
    });
    // Only real comments. An activity row ("Tildelt: …") is written by the app, and a name in one is
    // a record of what happened, not someone being addressed.
    if (comment.type === 'comment') {
      await notifyTaskCommentMentions({ taskId: id, body: comment.body, actorId: userId }).catch((err) =>
        console.error('Mention notifications failed:', err)
      );
    }
    return NextResponse.json(comment);
  } catch (error) {
    console.error('Feil ved oppretting av kommentar:', error);
    return NextResponse.json({ error: 'Kunne ikke opprette kommentar' }, { status: 500 });
  }
}
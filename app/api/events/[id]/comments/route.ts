import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureEventAccess } from '@/lib/auth/resourceAccess';

// Mirrors app/api/tasks/[id]/comments/route.ts exactly — same comment/activity-log shape, just
// keyed by eventId instead of taskId (see Comment's schema comment: exactly one of the two is
// ever set). Built so Planner can log "date changed" activity entries against an Event the same
// way it already does against a Task, which the schema had no way to do before (Comment.taskId
// was required, non-nullable, Event-less).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);
  if (!(await ensureEventAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this event' }, { status: 403 });

  const comments = await prisma.comment.findMany({
    where: { eventId: id },
    include: { author: { select: publicUserSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureEventAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this event' }, { status: 403 });

  try {
    const body = await req.json();
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }
    const comment = await prisma.comment.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        eventId: id,
        body: body.body,
        type: body.type || 'comment',
        activityKind: body.activityKind || null,
        // The real signed-in caller, not a client-supplied field — same fix just applied to the
        // Task comments route (see that file's own note).
        authorId: userId,
      },
      include: { author: { select: publicUserSelect } },
    });
    return NextResponse.json(comment);
  } catch (error) {
    console.error('Feil ved oppretting av kommentar (event):', error);
    return NextResponse.json({ error: 'Kunne ikke opprette kommentar' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';

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
        authorId: body.authorId || null,
      },
      include: { author: { select: publicUserSelect } },
    });
    return NextResponse.json(comment);
  } catch (error) {
    console.error('Feil ved oppretting av kommentar:', error);
    return NextResponse.json({ error: 'Kunne ikke opprette kommentar' }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureEventAccess } from '@/lib/auth/resourceAccess';

// Mirrors app/api/tasks/[id]/comments/[commentId]/route.ts, keyed by Event instead of Task.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureEventAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this event' }, { status: 403 });

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}

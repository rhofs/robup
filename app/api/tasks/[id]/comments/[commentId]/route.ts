import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}

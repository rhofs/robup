import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureDocAccess } from '@/lib/auth/resourceAccess';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  const body = await req.json();
  const comment = await prisma.docComment.update({
    where: { id: commentId },
    data: { resolved: !!body.resolved },
  });
  return NextResponse.json(comment);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  // Replies cascade automatically via the parentId FK's onDelete: Cascade when a thread root is deleted.
  await prisma.docComment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}

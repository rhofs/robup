import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { commentId } = await params;
  const body = await req.json();
  const comment = await prisma.docComment.update({
    where: { id: commentId },
    data: { resolved: !!body.resolved },
  });
  return NextResponse.json(comment);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { commentId } = await params;
  // Replies cascade automatically via the parentId FK's onDelete: Cascade when a thread root is deleted.
  await prisma.docComment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}

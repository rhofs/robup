import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { commentId } = await params;
  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}

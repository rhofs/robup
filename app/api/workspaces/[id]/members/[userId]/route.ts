import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  await prisma.workspace.update({
    where: { id },
    data: { members: { disconnect: { id: userId } } },
  });
  return NextResponse.json({ ok: true });
}

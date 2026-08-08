import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const isMember = await prisma.workspace.findFirst({ where: { id, members: { some: { id: callerId } } } });
  if (!isMember) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });

  await prisma.workspace.update({
    where: { id },
    data: { members: { disconnect: { id: userId } } },
  });
  return NextResponse.json({ ok: true });
}

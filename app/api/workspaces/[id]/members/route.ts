import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Previously anyone could add anyone to any workspace with zero check that the caller belongs
  // to it at all — this is that check, closed in the same pass as the identity-source fix.
  const isMember = await prisma.workspace.findFirst({ where: { id, members: { some: { id: callerId } } } });
  if (!isMember) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  await prisma.workspace.update({
    where: { id },
    data: { members: { connect: { id: body.userId } } },
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  await prisma.workspace.update({
    where: { id },
    data: { members: { connect: { id: body.userId } } },
  });
  return NextResponse.json({ ok: true });
}

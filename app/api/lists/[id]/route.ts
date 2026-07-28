import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;

  const list = await prisma.list.update({
    where: { id },
    data,
    select: { id: true, name: true, spaceId: true },
  });
  return NextResponse.json(list);
}

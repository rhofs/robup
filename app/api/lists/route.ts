import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const list = await prisma.list.create({
    data: {
      spaceId: body.spaceId,
      name: body.name,
    },
    select: { id: true, name: true, spaceId: true },
  });
  return NextResponse.json(list);
}

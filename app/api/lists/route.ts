import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const list = await prisma.list.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      folderId: body.folderId ?? null,
    },
    select: { id: true, name: true, spaceId: true, folderId: true, order: true },
  });
  return NextResponse.json(list);
}

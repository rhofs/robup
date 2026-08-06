import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const folder = await prisma.folder.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      parentId: body.parentId ?? null,
    },
    select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true },
  });
  return NextResponse.json(folder);
}

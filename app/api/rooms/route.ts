import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const room = await prisma.room.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      workspaceId: body.workspaceId,
      name: body.name,
    },
    select: { id: true, name: true, icon: true, color: true, order: true, workspaceId: true },
  });
  return NextResponse.json(room);
}

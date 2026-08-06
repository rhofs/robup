import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const count = await prisma.status.count({ where: { spaceId: body.spaceId } });
  const status = await prisma.status.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      color: body.color ?? '#94A3B8',
      order: body.order ?? count,
    },
  });
  return NextResponse.json(status);
}
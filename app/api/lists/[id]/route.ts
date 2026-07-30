import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.folderId !== undefined) data.folderId = body.folderId;
  if (body.order !== undefined) data.order = body.order;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;

  const list = await prisma.list.update({
    where: { id },
    data,
    select: { id: true, name: true, color: true, icon: true, spaceId: true, folderId: true, order: true },
  });
  return NextResponse.json(list);
}

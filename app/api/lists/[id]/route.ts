import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cascadeList } from '@/lib/trashCascade';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.restore === true) {
    await cascadeList(id, null);
    const list = await prisma.list.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, color: true, icon: true, spaceId: true, folderId: true, order: true },
    });
    return NextResponse.json(list);
  }

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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    await prisma.list.delete({ where: { id } });
  } else {
    await cascadeList(id, new Date());
  }
  return NextResponse.json({ ok: true });
}

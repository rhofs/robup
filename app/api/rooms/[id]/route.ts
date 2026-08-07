import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.color !== undefined) data.color = body.color;
  if (body.order !== undefined) data.order = body.order;
  if (body.isDnd !== undefined) data.isDnd = body.isDnd;

  const room = await prisma.room.update({
    where: { id },
    data,
    select: { id: true, name: true, icon: true, color: true, order: true, isDnd: true, workspaceId: true },
  });
  return NextResponse.json(room);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Room.members has onDelete: SetNull on User.roomId — deleting a room un-assigns its members
  // rather than deleting them.
  await prisma.room.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

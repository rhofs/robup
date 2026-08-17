import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';

async function ensureRoomAccess(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { workspaceId: true } });
  if (!room) return null;
  const ctx = await getAccessContext(room.workspaceId, userId);
  if (!ctx.isMember) return null;
  return room;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureRoomAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this room' }, { status: 403 });

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.color !== undefined) data.color = body.color;
  if (body.textColor !== undefined) data.textColor = body.textColor;
  if (body.order !== undefined) data.order = body.order;
  if (body.isDnd !== undefined) data.isDnd = body.isDnd;

  const room = await prisma.room.update({
    where: { id },
    data,
    select: { id: true, name: true, icon: true, color: true, textColor: true, order: true, isDnd: true, workspaceId: true },
  });
  return NextResponse.json(room);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureRoomAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this room' }, { status: 403 });

  // Room.members has onDelete: SetNull on User.roomId — deleting a room un-assigns its members
  // rather than deleting them.
  await prisma.room.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

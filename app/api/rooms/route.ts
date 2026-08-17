import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getAccessContext(body.workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });
  // Every new room needs a distinct, higher `order` than whatever already exists in this
  // workspace — the HQ Building view stacks floors by descending order (newest on top), so
  // without this every fresh room would tie at the schema's default 0 and fall back to
  // creation-array order for ties, which reads as "new floors appear at the bottom," not "built
  // upward" as intended.
  const highest = await prisma.room.aggregate({ where: { workspaceId: body.workspaceId }, _max: { order: true } });
  const nextOrder = (highest._max.order ?? -1) + 1;
  const room = await prisma.room.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      workspaceId: body.workspaceId,
      name: body.name,
      order: nextOrder,
    },
    select: { id: true, name: true, icon: true, color: true, order: true, isDnd: true, workspaceId: true },
  });
  return NextResponse.json(room);
}

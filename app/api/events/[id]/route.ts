import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';

// A leaf entity with nothing nested inside it (unlike List/Doc/Folder/Space/Task) — soft-delete
// and restore are both a single-row update, no cascade helper needed.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.restore === true) {
    const event = await prisma.event.update({
      where: { id },
      data: { deletedAt: null },
      include: { assignees: { select: publicUserSelect } },
    });
    return NextResponse.json(event);
  }

  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
  if (body.allDay !== undefined) data.allDay = body.allDay;
  if (body.color !== undefined) data.color = body.color;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;
  if (body.assigneeIds !== undefined) {
    data.assignees = { set: body.assigneeIds.map((uid: string) => ({ id: uid })) };
  }

  const event = await prisma.event.update({
    where: { id },
    data,
    include: { assignees: { select: publicUserSelect } },
  });
  return NextResponse.json(event);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    await prisma.event.delete({ where: { id } });
  } else {
    await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}

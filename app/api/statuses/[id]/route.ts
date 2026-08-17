import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess } from '@/lib/auth/resourceAccess';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.status.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Status not found' }, { status: 404 });

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(existing.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;
  if (body.order !== undefined) data.order = body.order;

  const updated = await prisma.status.update({ where: { id }, data });

  if (body.name !== undefined && body.name !== existing.name) {
    const lists = await prisma.list.findMany({ where: { spaceId: existing.spaceId }, select: { id: true } });
    await prisma.task.updateMany({
      where: { status: existing.name, listId: { in: lists.map((l) => l.id) } },
      data: { status: body.name },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.status.findUnique({ where: { id }, select: { spaceId: true } });
  if (!existing) return NextResponse.json({ error: 'Status not found' }, { status: 404 });

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(existing.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  await prisma.status.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

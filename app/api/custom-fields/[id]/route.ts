import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess } from '@/lib/auth/resourceAccess';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.customField.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(existing.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;

  let renamedPairs: { from: string; to: string }[] = [];
  if (body.options !== undefined) {
    const oldOptions: { id?: string; label: string; color: string }[] = JSON.parse(existing.options || '[]');
    const newOptions: { id?: string; label: string; color: string }[] = body.options;
    for (const newOpt of newOptions) {
      if (!newOpt.id) continue;
      const oldOpt = oldOptions.find((o) => o.id === newOpt.id);
      if (oldOpt && oldOpt.label !== newOpt.label) {
        renamedPairs.push({ from: oldOpt.label, to: newOpt.label });
      }
    }
    data.options = JSON.stringify(newOptions);
  }

  const updated = await prisma.customField.update({ where: { id }, data });

  if (renamedPairs.length > 0) {
    const lists = await prisma.list.findMany({ where: { spaceId: existing.spaceId }, select: { id: true } });
    const tasks = await prisma.task.findMany({
      where: { listId: { in: lists.map((l) => l.id) } },
      select: { id: true, customFieldValues: true },
    });
    for (const task of tasks) {
      const values = JSON.parse(task.customFieldValues || '{}');
      const current = values[id];
      const match = renamedPairs.find((p) => p.from === current);
      if (match) {
        values[id] = match.to;
        await prisma.task.update({ where: { id: task.id }, data: { customFieldValues: JSON.stringify(values) } });
      }
    }
  }

  return NextResponse.json({ ...updated, options: JSON.parse(updated.options) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.customField.findUnique({ where: { id }, select: { spaceId: true } });
  if (!existing) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(existing.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  await prisma.customField.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

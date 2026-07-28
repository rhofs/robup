import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.task.findUnique({ where: { id } });

  const data: any = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.customFieldValues !== undefined) data.customFieldValues = body.customFieldValues;
  if (body.listId !== undefined) data.listId = body.listId;
  if (body.parentId !== undefined) data.parentId = body.parentId;

  if (body.archived !== undefined) {
    data.archived = body.archived;
    data.archivedAt = body.archived ? new Date() : null;
  }

  if (body.assigneeIds !== undefined) {
    data.assignees = { set: body.assigneeIds.map((id: string) => ({ id })) };
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: { assignees: true },
  });

  const activities: string[] = [];
  if (existing && body.status !== undefined && body.status !== existing.status) {
    activities.push(`Status endret fra "${existing.status}" til "${body.status}"`);
  }
  if (existing && body.archived !== undefined && body.archived !== existing.archived) {
    activities.push(body.archived ? '✅ Merket som ferdig og arkivert' : '↩️ Hentet tilbake fra arkivet');
  }
  if (existing && body.parentId !== undefined && body.parentId !== existing.parentId) {
    activities.push(body.parentId ? '📥 Gjort om til en subtask' : '📤 Flyttet ut som egen oppgave');
  }
  if (existing && body.listId !== undefined && body.listId !== existing.listId) {
    activities.push('📂 Flyttet til en annen liste');
  }
  if (activities.length > 0) {
    await prisma.comment.createMany({
      data: activities.map((text) => ({ taskId: id, body: text, type: 'activity' })),
    });
  }

  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
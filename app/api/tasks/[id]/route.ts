import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.task.findUnique({ where: { id }, include: { assignees: { select: publicUserSelect } } });

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
    include: { assignees: { select: publicUserSelect } },
  });

  const activities: { body: string; kind: string }[] = [];
  if (!body.skipActivityLog) {
    if (existing && body.title !== undefined && body.title !== existing.title) {
      activities.push({ body: `Tittel endret til «${body.title}»`, kind: 'title' });
    }
    if (existing && body.status !== undefined && body.status !== existing.status) {
      activities.push({ body: `Status endret fra "${existing.status}" til "${body.status}"`, kind: 'status' });
    }
    if (existing && body.archived !== undefined && body.archived !== existing.archived) {
      activities.push(
        body.archived
          ? { body: 'Merket som ferdig og arkivert', kind: 'archived' }
          : { body: 'Hentet tilbake fra arkivet', kind: 'unarchived' }
      );
    }
    if (existing && body.parentId !== undefined && body.parentId !== existing.parentId) {
      activities.push(
        body.parentId
          ? { body: 'Gjort om til en underoppgave', kind: 'becameSubtask' }
          : { body: 'Flyttet ut som egen oppgave', kind: 'leftSubtask' }
      );
    }
    if (existing && body.listId !== undefined && body.listId !== existing.listId) {
      activities.push({ body: 'Flyttet til en annen liste', kind: 'movedList' });
    }
    if (existing && body.assigneeIds !== undefined) {
      const oldIds = new Set(existing.assignees.map((a) => a.id));
      const newIds = new Set<string>(body.assigneeIds);
      const addedIds = [...newIds].filter((uid) => !oldIds.has(uid));
      const removedIds = [...oldIds].filter((uid) => !newIds.has(uid));
      if (addedIds.length > 0 || removedIds.length > 0) {
        const affectedUsers = await prisma.user.findMany({ where: { id: { in: [...addedIds, ...removedIds] } } });
        const nameById = new Map(affectedUsers.map((u) => [u.id, u.name]));
        if (addedIds.length > 0) {
          activities.push({
            body: `Tildelt: ${addedIds.map((uid) => nameById.get(uid) ?? 'Ukjent bruker').join(', ')}`,
            kind: 'assigned',
          });
        }
        if (removedIds.length > 0) {
          activities.push({
            body: `Fjernet fra oppgaven: ${removedIds.map((uid) => nameById.get(uid) ?? 'Ukjent bruker').join(', ')}`,
            kind: 'unassigned',
          });
        }
      }
    }
  }
  if (activities.length > 0) {
    await prisma.comment.createMany({
      data: activities.map((a) => ({ taskId: id, body: a.body, type: 'activity', activityKind: a.kind, authorId: body.authorId ?? null })),
    });
  }

  // A subtask relationship changing is also logged on whichever parent(s) it affects — but only
  // that one level (the parent's own parent, if any, doesn't hear about it). Guarded by the same
  // skipActivityLog flag: optimisticSetParent is never called during a snapshot restore today,
  // but keeping this consistent with the rest of the route avoids a footgun if that changes.
  if (!body.skipActivityLog && existing && body.parentId !== undefined && body.parentId !== existing.parentId) {
    if (body.parentId) {
      await prisma.comment.create({
        data: {
          taskId: body.parentId,
          body: `Underoppgave lagt til: «${task.title}»`,
          type: 'activity',
          activityKind: 'subtaskAdded',
          authorId: body.authorId ?? null,
        },
      });
    }
    if (existing.parentId) {
      await prisma.comment.create({
        data: {
          taskId: existing.parentId,
          body: `Underoppgave fjernet: «${task.title}»`,
          type: 'activity',
          activityKind: 'subtaskRemoved',
          authorId: body.authorId ?? null,
        },
      });
    }
  }

  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
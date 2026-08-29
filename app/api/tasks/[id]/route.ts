import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { cascadeTask } from '@/lib/trashCascade';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { syncTaskForAllRelevantUsers, deleteTaskGoogleSyncs } from '@/lib/google/calendarSync';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  if (body.restore === true) {
    await cascadeTask(id, null);
    const task = await prisma.task.findUniqueOrThrow({ where: { id }, include: { assignees: { select: publicUserSelect } } });
    syncTaskForAllRelevantUsers(task.id).catch(() => {});
    return NextResponse.json(task);
  }

  const existing = await prisma.task.findUnique({ where: { id }, include: { assignees: { select: publicUserSelect } } });

  const data: any = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.calendarLane !== undefined) data.calendarLane = body.calendarLane;
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

  // Same Owner/Admin gate as Space/Folder/List's own PATCH routes — see Space's for why only the
  // privacy fields specifically get a caller-identity check here.
  if (body.isPrivate !== undefined || body.accessJson !== undefined) {
    const callerId = await getCurrentUserId();
    if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const owning = await prisma.task.findUnique({ where: { id }, select: { list: { select: { space: { select: { workspaceId: true } } } } } });
    if (!owning) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const role = await getWorkspaceRole(owning.list.space.workspaceId, callerId);
    if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can change access' }, { status: 403 });
    if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;
    if (body.accessJson !== undefined) data.accessJson = body.accessJson;
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
    // Was missing entirely before this session — dragging/resizing a Task's bar in Planner (or
    // editing its dates any other way) PATCHes startDate/dueDate but never logged it, same gap
    // backlog #12 flagged for Event (fixed there too, PATCH /api/events/[id]/route.ts, same shape).
    if (existing && (body.startDate !== undefined || body.dueDate !== undefined)) {
      const oldStart = existing.startDate ? existing.startDate.toISOString().slice(0, 10) : null;
      const oldDue = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;
      const newStart = (data.startDate as Date | null | undefined) !== undefined ? (data.startDate ? data.startDate.toISOString().slice(0, 10) : null) : oldStart;
      const newDue = (data.dueDate as Date | null | undefined) !== undefined ? (data.dueDate ? data.dueDate.toISOString().slice(0, 10) : null) : oldDue;
      if (newStart !== oldStart || newDue !== oldDue) {
        const range = newStart && newDue ? (newStart === newDue ? newStart : `${newStart} – ${newDue}`) : newStart || newDue || 'fjernet';
        activities.push({ body: `Dato endret til ${range}`, kind: 'datesChanged' });
      }
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
    // The real signed-in caller (verified above), not the client-supplied body.authorId this
    // used to trust directly — same spoofable-identity fix applied throughout this session.
    await prisma.comment.createMany({
      data: activities.map((a) => ({ taskId: id, body: a.body, type: 'activity', activityKind: a.kind, authorId: userId })),
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
          // The real signed-in caller, not the client-supplied body.authorId this used to trust
          // directly — same spoofable-identity fix applied throughout this session.
          authorId: userId,
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
          // The real signed-in caller, not the client-supplied body.authorId this used to trust
          // directly — same spoofable-identity fix applied throughout this session.
          authorId: userId,
        },
      });
    }
  }

  // Fire-and-forget Google Calendar mirror sync — only worth the API calls when something
  // sync-relevant actually changed (assignees, dates, title/description, or archived status).
  if (
    body.assigneeIds !== undefined ||
    body.startDate !== undefined ||
    body.dueDate !== undefined ||
    body.title !== undefined ||
    body.description !== undefined ||
    body.archived !== undefined
  ) {
    syncTaskForAllRelevantUsers(task.id).catch(() => {});
  }

  return NextResponse.json(task);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    // Read the Google-side copies (and remove them) before the cascade delete wipes the rows
    // that would otherwise be the only record of their googleEventId.
    await deleteTaskGoogleSyncs(id);
    await prisma.task.delete({ where: { id } });
  } else {
    await cascadeTask(id, new Date());
    // Soft delete — task row (and its sync rows) still exist; syncTaskForAllRelevantUsers sees
    // deletedAt now set and removes every assignee's calendar copy the normal way.
    syncTaskForAllRelevantUsers(id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
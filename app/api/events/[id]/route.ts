import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureEventAccess } from '@/lib/auth/resourceAccess';
import { pushEventToGoogle, deleteEventFromGoogle } from '@/lib/google/calendarSync';

// Event itself has no isPrivate of its own (workspace-scoped only), so a plain membership check
// is the whole story here — no canSee/ancestor-chain needed the way Task/Space/List/Folder/Doc
// need. It does now have nested Comments (see /comments), but those cascade-delete with the row
// itself (schema's onDelete: Cascade), so soft-delete/restore here are still a single-row update.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureEventAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this event' }, { status: 403 });

  if (body.restore === true) {
    const event = await prisma.event.update({
      where: { id },
      data: { deletedAt: null },
      include: { assignees: { select: publicUserSelect } },
    });
    // Best-effort re-create on Google (the soft-delete below removed it there too) — if the
    // stored googleEventId is now stale, pushEventToGoogle's own 404 handling clears it, and the
    // *next* push (any future edit) will create a fresh one; not retried inline here.
    pushEventToGoogle(event.id).catch(() => {});
    return NextResponse.json(event);
  }

  const existing = await prisma.event.findUnique({ where: { id }, include: { assignees: true } });

  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.location !== undefined) data.location = body.location;
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

  // Same "diff old vs. new, log what actually changed" shape as PATCH /api/tasks/[id]/route.ts —
  // scoped to the fields that actually apply to an Event (no status/archived/parentId/listId
  // concept here). Was previously missing entirely (Comment couldn't reference an Event at all
  // until this session's schema change), which is what backlog #12 flagged: stretching an
  // Event's date range in Planner had nowhere to log to.
  const activities: { body: string; kind: string }[] = [];
  if (!body.skipActivityLog && existing) {
    if (body.title !== undefined && body.title !== existing.title) {
      activities.push({ body: `Tittel endret til «${body.title}»`, kind: 'title' });
    }
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const oldStart = existing.startDate.toISOString().slice(0, 10);
      const oldEnd = existing.endDate.toISOString().slice(0, 10);
      const newStart = (data.startDate as Date | undefined)?.toISOString().slice(0, 10) ?? oldStart;
      const newEnd = (data.endDate as Date | undefined)?.toISOString().slice(0, 10) ?? oldEnd;
      if (newStart !== oldStart || newEnd !== oldEnd) {
        const range = newStart === newEnd ? newStart : `${newStart} – ${newEnd}`;
        activities.push({ body: `Dato endret til ${range}`, kind: 'datesChanged' });
      }
    }
    if (body.assigneeIds !== undefined) {
      const oldIds = new Set(existing.assignees.map((a) => a.id));
      const newIds = new Set<string>(body.assigneeIds);
      const addedIds = [...newIds].filter((uid) => !oldIds.has(uid));
      const removedIds = [...oldIds].filter((uid) => !newIds.has(uid));
      if (addedIds.length > 0 || removedIds.length > 0) {
        const affectedUsers = await prisma.user.findMany({ where: { id: { in: [...addedIds, ...removedIds] } } });
        const nameById = new Map(affectedUsers.map((u) => [u.id, u.name]));
        if (addedIds.length > 0) {
          activities.push({ body: `Tildelt: ${addedIds.map((uid) => nameById.get(uid) ?? 'Ukjent bruker').join(', ')}`, kind: 'assigned' });
        }
        if (removedIds.length > 0) {
          activities.push({ body: `Fjernet fra eventet: ${removedIds.map((uid) => nameById.get(uid) ?? 'Ukjent bruker').join(', ')}`, kind: 'unassigned' });
        }
      }
    }
  }
  if (activities.length > 0) {
    await prisma.comment.createMany({
      data: activities.map((a) => ({ eventId: id, body: a.body, type: 'activity', activityKind: a.kind, authorId: userId })),
    });
  }

  // Fire-and-forget push of the event's now-current state — cheaper to just always re-push
  // rather than work out which specific field changes are calendar-relevant.
  pushEventToGoogle(event.id).catch(() => {});

  return NextResponse.json(event);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureEventAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this event' }, { status: 403 });

  // Read before deleting the row — need these to remove the Google-side copy too, whether this
  // is a soft (trash) or permanent delete. A trashed Event shouldn't linger on the calendar any
  // more than a permanently-deleted one does.
  const existing = await prisma.event.findUnique({ where: { id }, select: { googleEventId: true, googleSyncOwnerId: true } });

  const permanent = new URL(req.url).searchParams.get('permanent') === 'true';
  if (permanent) {
    await prisma.event.delete({ where: { id } });
  } else {
    await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  if (existing?.googleEventId && existing.googleSyncOwnerId) {
    deleteEventFromGoogle(existing.googleSyncOwnerId, existing.googleEventId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

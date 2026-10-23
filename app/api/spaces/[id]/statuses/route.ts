import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess, ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { applyStatusSet, fallbackNamesForTask, parseIncoming } from '@/lib/statusSets';

// "Apply changes" in the Edit statuses window (components/StatusEditor.tsx): a whole status set in one
// go, in its new order, rather than one PATCH per edit — the window edits a draft, the way ClickUp's
// does, and a template swaps every status at once. See lib/statusSets.ts for which tasks it reaches.
//
// body.listId: absent for the Space's own set; a List's id for that List's ("Use custom statuses").
// body.inherit: with a listId — the List goes back to the Space's statuses (its own are deleted).
// body.taskId: a task's own set for its subtasks (Status.taskId); with inherit, the task gives it up.
// body.statuses: [{ id?, name, color, kind: 'open'|'done'|'closed', icon }] — an id keeps that status
//   (renamed, recoloured, reordered…); one without is created; an existing status left out is deleted.
// body.rename: { oldName: newName } — tasks are filed under a status *name*, so this moves them: the
//   renamed statuses, and removed ones to whichever status the person chose for their tasks.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const listId: string | null = typeof body.listId === 'string' && body.listId ? body.listId : null;
  if (listId) {
    const list = await prisma.list.findUnique({ where: { id: listId }, select: { spaceId: true } });
    if (!list || list.spaceId !== id) return NextResponse.json({ error: 'That List is not in this Space' }, { status: 400 });
  }
  const taskId: string | null = typeof body.taskId === 'string' && body.taskId ? body.taskId : null;
  if (taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { list: { select: { spaceId: true } } } });
    if (!task || task.list.spaceId !== id) return NextResponse.json({ error: 'That task is not in this Space' }, { status: 400 });
    if (!(await ensureTaskAccess(taskId, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });
  }
  const inherit = (!!listId || !!taskId) && body.inherit === true;

  const incoming = parseIncoming(body.statuses);
  if (!inherit) {
    if (incoming.length === 0) return NextResponse.json({ error: 'At least one status is needed' }, { status: 400 });
    const lower = incoming.map((s) => s.name.toLowerCase());
    if (new Set(lower).size !== lower.length) return NextResponse.json({ error: 'Two statuses have the same name' }, { status: 400 });
  }

  // Where tasks may be moved to: the names in the new set — or, for a List going back to inheriting,
  // the Space's own names.
  const targetNames = new Set<string>(
    inherit
      ? taskId
        ? await fallbackNamesForTask(taskId)
        : (await prisma.status.findMany({ where: { spaceId: id, listId: null, taskId: null }, select: { name: true } })).map((s) => s.name)
      : incoming.map((s) => s.name)
  );
  const rename = Object.entries((body.rename ?? {}) as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[0] !== e[1] && (targetNames.has(e[1]) || (inherit && targetNames.size === 0))
  );

  const statuses = await applyStatusSet({ spaceId: id, listId: taskId ? null : listId, taskId, inherit, incoming, rename });
  return NextResponse.json({ statuses });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureListAccess } from '@/lib/auth/resourceAccess';
import { canSee } from '@/lib/auth/access';

// Reordering a list, as ONE request instead of one request per task.
//
// It used to be one PATCH /api/tasks/[id] per sibling, fired together with Promise.all. On a list
// of a dozen that is merely wasteful; on an imported list of several hundred it is several hundred
// concurrent requests, each of which also writes an activity row and kicks off a Google Calendar
// sync. The client never checked `res.ok` either, so anything the browser dropped or the server
// refused was silently treated as saved — the store kept the optimistic order and everything looked
// right until a refresh read the real one back. Reported as lists not remembering their order.
//
// One transaction also makes the write atomic, which matters for the second half of that report:
// `order` is a column on the task itself, not a per-viewer preference, so everyone sorts by the
// same numbers — but only if the whole set lands or none of it does. A half-applied reorder is a
// list that disagrees with itself for everybody.

// Two shapes, and the first is the one a drag should use.
//
// `{ draggedId, targetId, position }` says what the GESTURE was and lets the server work out the
// resulting sequence from the rows it actually has. `{ ids }` states the sequence outright, which is
// right for undo — restoring an order that is already known — and wrong for a drag, because the
// client's list of siblings is not guaranteed to be the real one. It can be missing tasks that are
// private to someone else, tasks a colleague added a second ago, or tasks not yet fetched by the
// staged startup load. Renumbering from a partial list writes a sequence that was never on screen.
//
// The server answers with the full ordered ids either way, so the client applies what was really
// stored rather than what it predicted.

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);

  if (typeof body?.draggedId === 'string' && typeof body?.targetId === 'string') {
    return reorderByGesture(body.draggedId, body.targetId, body.position === 'below' ? 'below' : 'above', userId);
  }

  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'ids must be a non-empty array of task ids' }, { status: 400 });
  }
  // A duplicate id would give one task two positions and leave a gap where another should be.
  if (new Set(ids as string[]).size !== ids.length) {
    return NextResponse.json({ error: 'ids must be unique' }, { status: 400 });
  }

  const tasks = await prisma.task.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, listId: true, parentId: true, isPrivate: true, accessJson: true },
  });
  if (tasks.length !== ids.length) return NextResponse.json({ error: 'Unknown task' }, { status: 404 });

  // Every id must be a true sibling of every other. Positions are only meaningful within one
  // parent, and accepting a mixed set would let a caller renumber tasks in a list it never named.
  const listId = tasks[0].listId;
  const parentId = tasks[0].parentId ?? null;
  if (tasks.some((t) => t.listId !== listId || (t.parentId ?? null) !== parentId)) {
    return NextResponse.json({ error: 'All tasks must share one list and parent' }, { status: 400 });
  }

  // The list is checked once — it is the same list for all of them — and then each task's own
  // visibility against that context, because a task can be private inside a list you can see.
  const listResult = await ensureListAccess(listId, userId);
  if (!listResult) return NextResponse.json({ error: 'Not authorized for this list' }, { status: 403 });
  if (tasks.some((t) => !canSee(t, listResult.ctx))) {
    return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });
  }

  await prisma.$transaction(
    (ids as string[]).map((id, index) =>
      prisma.task.update({ where: { id }, data: { order: index } })
    )
  );

  // Deliberately no activity entries and no calendar sync. Position is not a property of the work —
  // it says nothing about what the task is, when it is due or who owns it — and a hundred "moved"
  // rows in the activity feed would bury the changes that do matter.
  return NextResponse.json({ ok: true, count: ids.length, ids });
}

async function reorderByGesture(
  draggedId: string,
  targetId: string,
  position: 'above' | 'below',
  userId: string
) {
  if (draggedId === targetId) return NextResponse.json({ error: 'A task cannot be moved relative to itself' }, { status: 400 });

  const [dragged, target] = await Promise.all([
    prisma.task.findUnique({ where: { id: draggedId }, select: { id: true, listId: true, parentId: true } }),
    prisma.task.findUnique({ where: { id: targetId }, select: { id: true, listId: true, parentId: true } }),
  ]);
  if (!dragged || !target) return NextResponse.json({ error: 'Unknown task' }, { status: 404 });
  // Position only means anything among true siblings. A different list or parent is a move, and
  // belongs to the routes that handle moving.
  if (dragged.listId !== target.listId || (dragged.parentId ?? null) !== (target.parentId ?? null)) {
    return NextResponse.json({ error: 'Tasks can only be reordered within the same list' }, { status: 400 });
  }

  const listResult = await ensureListAccess(dragged.listId, userId);
  if (!listResult) return NextResponse.json({ error: 'Not authorized for this list' }, { status: 403 });

  // The real sibling set, read from the database rather than taken from the caller. Sorted the same
  // way the board sorts: stored position first, creation time as the tie-break for everything that
  // has never been moved (they all sit at 0 until something is dragged).
  const siblings = await prisma.task.findMany({
    where: {
      listId: dragged.listId,
      parentId: dragged.parentId ?? null,
      deletedAt: null,
      archived: false,
    },
    select: { id: true, isPrivate: true, accessJson: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  // Tasks this person cannot see still hold a position, and renumbering has to keep them in the
  // sequence — otherwise reordering in a list containing someone else's private task would quietly
  // shuffle it. They just cannot be the thing being moved.
  if (!siblings.some((t) => t.id === draggedId) || !siblings.some((t) => t.id === targetId)) {
    return NextResponse.json({ error: 'Unknown task' }, { status: 404 });
  }
  const visible = (id: string) => {
    const t = siblings.find((s) => s.id === id);
    return !!t && canSee(t, listResult.ctx);
  };
  if (!visible(draggedId) || !visible(targetId)) {
    return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });
  }

  const without = siblings.filter((t) => t.id !== draggedId).map((t) => t.id);
  const targetIndex = without.indexOf(targetId);
  const insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
  const ordered = [...without.slice(0, insertAt), draggedId, ...without.slice(insertAt)];

  await prisma.$transaction(ordered.map((id, index) => prisma.task.update({ where: { id }, data: { order: index } })));

  // The caller applies this rather than its own prediction — it is what was actually stored.
  return NextResponse.json({ ok: true, count: ordered.length, ids: ordered });
}

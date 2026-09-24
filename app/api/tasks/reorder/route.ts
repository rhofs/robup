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

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
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
  return NextResponse.json({ ok: true, count: ids.length });
}

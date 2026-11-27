import { prisma } from '@/lib/prisma';
import { isDoneStatus } from '@/lib/doneStatus';

// "Om alle subtasks er gjort, blir hovedtask automatisk markert som done" (2026-11-27).
//
// Whenever something happens to a task's subtasks — one changes status, is checked away or reopened,
// is added, trashed, restored, or moved in or out — the server calls reconcileParent for the parent:
//   - every subtask (not in the trash) is in a done or closed status, or archived, and the parent is
//     not → the parent moves to the FIRST done status of its own set (never a closed one, which would
//     archive it and take it out of the list), and remembers the status it had in Task.autoCompletedFrom;
//   - a subtask is open again (reopened, or a new open one added) and the parent was completed by this
//     rule → it goes back to the status it had before. A parent someone set to done by hand is left
//     alone: autoCompletedFrom is cleared by every status change by hand (app/api/tasks/[id]), so it is
//     only ever set while the rule's own change still stands.
// Each change goes on up the chain, so finishing the last sub-subtask can finish the task above too.
//
// On by default; turned off per Space or List in "Edit statuses" (Space/List.autoCompleteParent).
// Going back is not gated by the setting: turning it off should not leave a parent stuck as done.
//
// Runs on the server so it holds wherever the change comes from — any device, the agent API, undo.
// The routes return the ids changed here in the x-siqt-tasks-changed header; lib/pendingWrites.ts sees
// it and refetches, so the tab that made the change shows the parent at once.

type StatusRow = { name: string; order: number; isDone: boolean; isClosed: boolean };

// The built-in set a List without statuses of its own uses (app/page.tsx DEFAULT_STATUSES).
const DEFAULT_STATUSES: StatusRow[] = [
  { name: 'To Do', order: 0, isDone: false, isClosed: false },
  { name: 'In Progress', order: 1, isDone: false, isClosed: false },
  { name: 'Review', order: 2, isDone: false, isClosed: false },
  { name: 'Done', order: 3, isDone: true, isClosed: false },
];

const statusSelect = { name: true, order: true, isDone: true, isClosed: true } as const;

// The set a task's subtasks use: the nearest task from `fromTaskId` upwards with a set of its own for
// its subtasks (Status.taskId), else the List's own, else the Space's, else the built-in one. The same
// order lib/listStatuses.ts statusesOfTask follows on the client.
async function statusSetFrom(fromTaskId: string | null, listId: string): Promise<StatusRow[]> {
  let id = fromTaskId;
  for (let guard = 0; id && guard < 30; guard++) {
    const own = await prisma.status.findMany({ where: { taskId: id }, select: statusSelect, orderBy: { order: 'asc' } });
    if (own.length) return own;
    id = (await prisma.task.findUnique({ where: { id }, select: { parentId: true } }))?.parentId ?? null;
  }
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { spaceId: true } });
  if (!list) return DEFAULT_STATUSES;
  const ofList = await prisma.status.findMany({ where: { listId }, select: statusSelect, orderBy: { order: 'asc' } });
  if (ofList.length) return ofList;
  const ofSpace = await prisma.status.findMany({ where: { spaceId: list.spaceId, listId: null, taskId: null }, select: statusSelect, orderBy: { order: 'asc' } });
  return ofSpace.length ? ofSpace : DEFAULT_STATUSES;
}

async function ruleOn(listId: string): Promise<boolean> {
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { autoCompleteParent: true, space: { select: { autoCompleteParent: true } } } });
  if (!list) return false;
  return list.autoCompleteParent ?? list.space.autoCompleteParent;
}

// Reconciles `parentId` and, when it changes, the tasks above it. Returns the ids it changed.
export async function reconcileParent(parentId: string | null | undefined, actorId: string): Promise<string[]> {
  const changed: string[] = [];
  let id = parentId ?? null;
  for (let guard = 0; id && guard < 30; guard++) {
    const parent = await prisma.task.findUnique({
      where: { id },
      select: { id: true, status: true, archived: true, deletedAt: true, listId: true, parentId: true, autoCompletedFrom: true },
    });
    if (!parent || parent.deletedAt) break;

    const children = await prisma.task.findMany({ where: { parentId: parent.id, deletedAt: null }, select: { status: true, archived: true } });
    if (children.length === 0) break;
    const childSet = await statusSetFrom(parent.id, parent.listId);
    const allDone = children.every((c) => c.archived || isDoneStatus(c.status, childSet));

    const ownSet = await statusSetFrom(parent.parentId, parent.listId);
    const parentDone = parent.archived || isDoneStatus(parent.status, ownSet);

    let next: { status: string; autoCompletedFrom: string | null; note: string } | null = null;
    if (allDone && !parentDone && (await ruleOn(parent.listId))) {
      // The first done status — not a closed one. A set that marks none falls back to the same
      // by-name / last-status rule isDoneStatus uses, minus closed ones.
      const target = ownSet.find((s) => s.isDone && !s.isClosed) ?? ownSet.find((s) => !s.isClosed && isDoneStatus(s.name, ownSet));
      if (target) next = { status: target.name, autoCompletedFrom: parent.status, note: `Fullført automatisk – alle underoppgaver er ferdige` };
    } else if (!allDone && parent.autoCompletedFrom !== null && !parent.archived) {
      next = { status: parent.autoCompletedFrom, autoCompletedFrom: null, note: `Åpnet igjen automatisk – en underoppgave er ikke ferdig lenger` };
    }
    if (!next) break;

    // Only if nobody changed it in the meantime: two subtasks finished at the same moment must not
    // both act on a status the other has already moved.
    const { count } = await prisma.task.updateMany({
      where: { id: parent.id, status: parent.status, autoCompletedFrom: parent.autoCompletedFrom },
      data: { status: next.status, autoCompletedFrom: next.autoCompletedFrom },
    });
    if (count === 0) break;
    changed.push(parent.id);
    await prisma.comment.create({
      data: {
        taskId: parent.id,
        body: `${next.note} (status "${parent.status}" → "${next.status}")`,
        type: 'activity',
        activityKind: 'status',
        authorId: actorId,
      },
    });
    id = parent.parentId;
  }
  return changed;
}

export const TASKS_CHANGED_HEADER = 'x-siqt-tasks-changed';

// Adds the header that tells the client other tasks changed than the one it wrote.
export function withChangedTasks<T extends Response>(res: T, ids: string[]): T {
  if (ids.length) res.headers.set(TASKS_CHANGED_HEADER, ids.join(','));
  return res;
}

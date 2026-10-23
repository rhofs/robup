import { prisma } from '@/lib/prisma';

// Saving a whole status set — a Space's, or one List's own — in one transaction. Used by "Apply
// changes" in the Edit statuses window (app/api/spaces/[id]/statuses).
//
// Statuses belong to a Space, and a List may opt out and keep its own (Status.listId). Tasks are filed
// under a status *name*, so which tasks a change reaches is the heart of it:
//   - a Space's set reaches the tasks of the Space's Lists that do NOT have their own statuses;
//   - a List's set reaches that List's tasks only.
// The second is what was asked for: "når vi endrer custom status i en liste, og applier, så applier han
// det for hele workspacet … det er da inni der at de endringene må endres" (2026-10-13). Before
// per-List statuses existed, the only set there was belonged to the whole Space.

export type IncomingStatus = { id?: string; name: string; color: string; kind: 'open' | 'done' | 'closed'; icon: string | null };

export function parseIncoming(raw: unknown): IncomingStatus[] {
  return (Array.isArray(raw) ? raw : [])
    .map((s: Record<string, unknown>) => ({
      id: typeof s.id === 'string' ? s.id : undefined,
      name: typeof s.name === 'string' ? s.name.trim().slice(0, 60) : '',
      color: typeof s.color === 'string' ? s.color.slice(0, 32) : '#94A3B8',
      kind: (s.kind === 'done' || s.kind === 'closed' ? s.kind : 'open') as IncomingStatus['kind'],
      icon: typeof s.icon === 'string' && s.icon ? s.icon.slice(0, 32) : null,
    }))
    .filter((s) => s.name);
}

// The Lists whose tasks a Space-level status change reaches: those without statuses of their own.
export async function inheritingListIds(spaceId: string): Promise<string[]> {
  return (await prisma.list.findMany({ where: { spaceId, statuses: { none: {} } }, select: { id: true } })).map((l) => l.id);
}

// Tasks under a task that has statuses of its own for its subtasks (Status.taskId) go by those, not by
// their List's — so a Space or List change must leave them alone. Every task below any such task.
async function idsUnderTaskSets(): Promise<Set<string>> {
  const owners = (await prisma.status.findMany({ where: { taskId: { not: null } }, distinct: ['taskId'], select: { taskId: true } }))
    .map((s) => s.taskId!)
    .filter(Boolean);
  const out = new Set<string>();
  let frontier = owners;
  for (let depth = 0; frontier.length && depth < 30; depth++) {
    const children = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = children.map((c) => c.id).filter((id) => !out.has(id));
    frontier.forEach((id) => out.add(id));
  }
  return out;
}

// The tasks that use one task's own set: its subtasks, and theirs, down to a subtask that has a set
// of its own (whose subtasks then use that one — it itself still uses this).
async function idsUsingTaskSet(taskId: string): Promise<string[]> {
  const owners = new Set(
    (await prisma.status.findMany({ where: { taskId: { not: null } }, distinct: ['taskId'], select: { taskId: true } })).map((s) => s.taskId!)
  );
  const out: string[] = [];
  let frontier = [taskId];
  for (let depth = 0; frontier.length && depth < 30; depth++) {
    const children = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    out.push(...children.map((c) => c.id));
    frontier = children.map((c) => c.id).filter((id) => !owners.has(id));
  }
  return out;
}

// The statuses a task's subtasks fall back to without a set of its own: the nearest task above it
// with one, else its List's own, else its Space's.
export async function fallbackNamesForTask(taskId: string): Promise<string[]> {
  let current = await prisma.task.findUnique({ where: { id: taskId }, select: { parentId: true, listId: true, list: { select: { spaceId: true } } } });
  const listId = current?.listId ?? null;
  const spaceId = current?.list.spaceId ?? null;
  for (let depth = 0; current?.parentId && depth < 30; depth++) {
    const own = await prisma.status.findMany({ where: { taskId: current.parentId }, select: { name: true } });
    if (own.length) return own.map((s) => s.name);
    current = await prisma.task.findUnique({ where: { id: current.parentId }, select: { parentId: true, listId: true, list: { select: { spaceId: true } } } });
  }
  if (listId) {
    const own = await prisma.status.findMany({ where: { listId }, select: { name: true } });
    if (own.length) return own.map((s) => s.name);
  }
  return spaceId ? (await prisma.status.findMany({ where: { spaceId, listId: null, taskId: null }, select: { name: true } })).map((s) => s.name) : [];
}

// Which set: listId and taskId both null — the Space's; listId — that List's own; taskId — that task's
// own set for its subtasks. With `inherit`, a List or task gives up its own and goes back to what it
// would use without (its statuses are deleted; `rename` moves its tasks onto those names).
export async function applyStatusSet(opts: {
  spaceId: string;
  listId: string | null;
  taskId?: string | null;
  inherit: boolean;
  incoming: IncomingStatus[];
  rename: [string, string][];
}) {
  const { spaceId, listId, inherit, incoming, rename } = opts;
  const taskId = opts.taskId ?? null;
  // The Space's own set says taskId: null too — a task's own statuses also have no listId, and without
  // it applying the Space's set would delete them.
  const scope = taskId ? { taskId } : listId ? { spaceId, listId } : { spaceId, listId: null, taskId: null };
  const existing = await prisma.status.findMany({ where: scope, select: { id: true } });
  const existingIds = new Set(existing.map((s) => s.id));
  const keepIds = new Set<string>(inherit ? [] : incoming.filter((s) => s.id && existingIds.has(s.id)).map((s) => s.id!));
  // The tasks whose status names move: a task's set — the subtasks that use it; otherwise the List's
  // (or the Space's inheriting Lists') tasks, less those under a task with a set of its own.
  const taskWhere = taskId
    ? { id: { in: await idsUsingTaskSet(taskId) } }
    : { listId: { in: listId ? [listId] : await inheritingListIds(spaceId) }, id: { notIn: [...(await idsUnderTaskSets())] } };

  await prisma.$transaction(async (tx) => {
    // Through a placeholder name first, so swapping two names (A→B, B→A) doesn't merge their tasks.
    const moves = rename.map(([from, to], i) => ({ from, to, tmp: `\u0000siqt-status-${i}` }));
    for (const m of moves) await tx.task.updateMany({ where: { ...taskWhere, status: m.from }, data: { status: m.tmp } });
    for (const m of moves) await tx.task.updateMany({ where: { ...taskWhere, status: m.tmp }, data: { status: m.to } });

    await tx.status.deleteMany({ where: { ...scope, id: { notIn: [...keepIds] } } });
    if (inherit) return;
    for (const [order, s] of incoming.entries()) {
      const data = { name: s.name, color: s.color, isDone: s.kind === 'done', isClosed: s.kind === 'closed', icon: s.icon, order };
      if (s.id && keepIds.has(s.id)) await tx.status.update({ where: { id: s.id }, data });
      else await tx.status.create({ data: { ...data, spaceId, listId: taskId ? null : listId, taskId } });
    }
  });

  return prisma.status.findMany({ where: scope, orderBy: { order: 'asc' } });
}

// A copied task (duplicate, "Create next…", a duplicated List) keeps its own statuses for its
// subtasks, or its copied subtasks would show statuses their set no longer has.
type StatusTx = Pick<typeof prisma, 'status'>;
export async function copyTaskStatuses(tx: StatusTx, fromTaskId: string, toTaskId: string) {
  const own = await tx.status.findMany({ where: { taskId: fromTaskId }, orderBy: { order: 'asc' } });
  if (own.length === 0) return;
  await tx.status.createMany({
    data: own.map((st) => ({ name: st.name, color: st.color, isDone: st.isDone, isClosed: st.isClosed, icon: st.icon, order: st.order, spaceId: st.spaceId, listId: null, taskId: toTaskId })),
  });
}

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

// listId null: the Space's set. listId with `inherit`: the List gives up its own and goes back to the
// Space's (its statuses are deleted; `rename` moves its tasks onto the Space's names).
export async function applyStatusSet(opts: {
  spaceId: string;
  listId: string | null;
  inherit: boolean;
  incoming: IncomingStatus[];
  rename: [string, string][];
}) {
  const { spaceId, listId, inherit, incoming, rename } = opts;
  const scope = listId ? { spaceId, listId } : { spaceId, listId: null };
  const existing = await prisma.status.findMany({ where: scope, select: { id: true } });
  const existingIds = new Set(existing.map((s) => s.id));
  const keepIds = new Set<string>(inherit ? [] : incoming.filter((s) => s.id && existingIds.has(s.id)).map((s) => s.id!));
  const taskListIds = listId ? [listId] : await inheritingListIds(spaceId);

  await prisma.$transaction(async (tx) => {
    // Through a placeholder name first, so swapping two names (A→B, B→A) doesn't merge their tasks.
    const moves = rename.map(([from, to], i) => ({ from, to, tmp: `\u0000siqt-status-${i}` }));
    for (const m of moves) await tx.task.updateMany({ where: { listId: { in: taskListIds }, status: m.from }, data: { status: m.tmp } });
    for (const m of moves) await tx.task.updateMany({ where: { listId: { in: taskListIds }, status: m.tmp }, data: { status: m.to } });

    await tx.status.deleteMany({ where: { ...scope, id: { notIn: [...keepIds] } } });
    if (inherit) return;
    for (const [order, s] of incoming.entries()) {
      const data = { name: s.name, color: s.color, isDone: s.kind === 'done', isClosed: s.kind === 'closed', icon: s.icon, order };
      if (s.id && keepIds.has(s.id)) await tx.status.update({ where: { id: s.id }, data });
      else await tx.status.create({ data: { ...data, spaceId, listId } });
    }
  });

  return prisma.status.findMany({ where: scope, orderBy: { order: 'asc' } });
}

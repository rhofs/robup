import { prisma } from '@/lib/prisma';
import type { VerifiedToken } from '@/lib/auth/apiToken';
import { ensureEventAccess, ensureListAccess, ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { isRichHtml, richToPlainText } from '@/lib/richText';
import { GET as workspacesGET } from '@/app/api/workspaces/route';
import { GET as tasksGET } from '@/app/api/tasks/route';
import { GET as eventsGET } from '@/app/api/events/route';

// What the agent operations share: the refusal type, reading arguments, dates, the shapes handed
// back to an agent, and — most importantly — which workspaces a key reaches (openWorkspaceIds).

export class AgentError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
  }
}

export type Json = Record<string, unknown>;

// One request from an agent. `memo` holds what has been read during it (the workspace tree, the
// task list) so a batch of fifty changes does not read them fifty times; cleared after every
// change that writes, so nothing is planned against a list that has since moved.
export type AgentCall = { token: VerifiedToken; baseUrl: string; memo: Map<string, Promise<unknown>> };

export const newCall = (token: VerifiedToken, baseUrl: string): AgentCall => ({ token, baseUrl, memo: new Map() });

const memo = <T>(call: AgentCall, key: string, load: () => Promise<T>): Promise<T> => {
  if (!call.memo.has(key)) call.memo.set(key, load());
  return call.memo.get(key) as Promise<T>;
};

// ---- calling the app's own route handlers ------------------------------------------------------

export const internal = (path: string, init?: { method: string; body?: unknown }) =>
  new Request(`http://siqt.internal${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

// A route handler's answer, as data — or its own error message, passed on rather than replaced: the
// handlers already say "Not authorized for this list", and an agent can act on that.
export async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new AgentError(message, res.status === 403 ? 403 : res.status === 404 ? 404 : 400);
  }
  return data as T;
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });

// ---- which workspaces a key reaches ------------------------------------------------------------

// Three things have to agree before a key touches a workspace: its owner is a member (the handlers
// check that anyway), the key was not limited to other workspaces when it was made, and the
// workspace has not switched agents off (Workspace.agentsAllowed — an owner's or admin's call, for
// everyone's agents at once). Every operation goes through here, reading or writing.
export const openWorkspaceIds = (call: AgentCall): Promise<Set<string>> =>
  memo(call, 'open', async () => {
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: call.token.userId, workspace: { agentsAllowed: true } },
      select: { workspaceId: true },
    });
    const limit = call.token.workspaceIds;
    return new Set(memberships.map((m) => m.workspaceId).filter((id) => !limit || limit.includes(id)));
  });

export async function requireOpen(workspaceId: string, call: AgentCall) {
  if (!(await openWorkspaceIds(call)).has(workspaceId)) {
    throw new AgentError(
      'This API key cannot work in that workspace: either the key was limited to other workspaces, or the workspace has switched AI agents off.',
      403
    );
  }
}

// ---- reading arguments -------------------------------------------------------------------------

export const str = (args: Json, key: string): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new AgentError(`"${key}" must be a string.`);
  return v;
};
export const requiredStr = (args: Json, key: string): string => {
  const v = str(args, key)?.trim();
  if (!v) throw new AgentError(`"${key}" is required.`);
  return v;
};
export const bool = (args: Json, key: string): boolean | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new AgentError(`"${key}" must be true or false.`);
  return v;
};
export const strList = (args: Json, key: string): string[] | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new AgentError(`"${key}" must be a list of ids.`);
  return v as string[];
};

// ---- dates -------------------------------------------------------------------------------------

const osloParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
};

// A wall-clock moment in Norway, as the instant it is. Norway is one or two hours ahead of UTC
// depending on the season; both are tried and the one that reads back as what was asked is kept.
function osloLocal(day: string, time: string): Date | null {
  for (const offset of ['+01:00', '+02:00']) {
    const d = new Date(`${day}T${time}:00${offset}`);
    if (Number.isNaN(d.getTime())) return null;
    const back = osloParts(d);
    if (back.day === day && back.time === time) return d;
  }
  return null;
}

// A day or a moment an agent gives.
//  - "2026-12-01" is that day the way the app's own date picker means it — midnight in Norway, the
//    app's convention for "no time" (lib/eventDates.ts) — so a task made by an agent and one made
//    by hand for the same day hold the same instant.
//  - "2026-12-01T10:00" is ten o'clock in Norway. An agent told "kl. 10" should not have to know
//    what the offset is this month.
//  - Anything with its own offset or a Z is taken as given.
export function parseWhen(v: string, key: string): { iso: string; hasTime: boolean } {
  const dayOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(v);
  if (dayOnly) {
    const d = osloLocal(dayOnly[1], '00:00');
    if (!d) throw new AgentError(`"${key}" is not a real date: ${v}`);
    return { iso: d.toISOString(), hasTime: false };
  }
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/.exec(v);
  if (local) {
    const d = osloLocal(local[1], local[2]);
    if (!d) throw new AgentError(`"${key}" is not a real date and time: ${v}`);
    return { iso: d.toISOString(), hasTime: local[2] !== '00:00' };
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AgentError(`"${key}" must look like "2026-12-01" or "2026-12-01T10:00".`);
  return { iso: d.toISOString(), hasTime: osloParts(d).time !== '00:00' };
}

// For an optional date field: `null` (or "") clears it; undefined leaves it alone.
export function dateArg(args: Json, key: string): string | null | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw new AgentError(`"${key}" must be a date like "2026-12-01", or null to clear it.`);
  return parseWhen(v, key).iso;
}

// How a stored instant reads in Norway — what the app shows for it.
export const osloDay = (iso: string | Date | null | undefined): string | null => (iso ? osloParts(new Date(iso)).day : null);
export const osloMoment = (iso: string | Date, allDay: boolean): string => {
  const p = osloParts(new Date(iso));
  return allDay ? p.day : `${p.day}T${p.time}`;
};

export const plain = (description: string | null | undefined): string | null => {
  if (!description) return null;
  const text = (isRichHtml(description) ? richToPlainText(description) : description).trim();
  return text || null;
};

// ---- what is read, and the shapes handed to an agent -------------------------------------------

export type RawStatus = { name: string; isDone: boolean; isClosed: boolean; order: number };
export type RawWorkspace = {
  id: string;
  name: string;
  isPersonal?: boolean;
  members: { id: string; name: string; username: string | null }[];
  spaces: {
    id: string;
    name: string;
    statuses: RawStatus[];
    folders: { id: string; name: string; parentId: string | null }[];
    lists: { id: string; name: string; folderId: string | null; archived: boolean; statuses: RawStatus[] }[];
  }[];
};
export type RawTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  listId: string;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  assignees: { id: string; name: string }[];
};
export type RawEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  workspaceId: string;
  spaceId: string | null;
  recurrence: string | null;
  assignees: { id: string; name: string }[];
};

// Only the workspaces this key reaches — so nothing downstream can list, search or name what is in
// the others.
export const loadWorkspaces = (call: AgentCall): Promise<RawWorkspace[]> =>
  memo(call, 'workspaces', async () => {
    const open = await openWorkspaceIds(call);
    const all = await unwrap<RawWorkspace[]>(await workspacesGET(internal('/api/workspaces')));
    return all.filter((ws) => open.has(ws.id));
  });

export const loadTasks = (call: AgentCall): Promise<RawTask[]> =>
  memo(call, 'tasks', async () => {
    const lists = new Set((await loadWorkspaces(call)).flatMap((ws) => ws.spaces.flatMap((s) => s.lists.map((l) => l.id))));
    const all = await unwrap<RawTask[]>(await tasksGET(internal('/api/tasks')));
    return all.filter((t) => lists.has(t.listId));
  });

export const loadEvents = (call: AgentCall): Promise<RawEvent[]> =>
  memo(call, 'events', async () => {
    const open = await openWorkspaceIds(call);
    const all = await unwrap<RawEvent[]>(await eventsGET(internal('/api/events')));
    return all.filter((e) => open.has(e.workspaceId));
  });

// "Space / Folder / List", for telling a person (or an agent) where something is.
export async function listPath(listId: string, call: AgentCall): Promise<string> {
  for (const ws of await loadWorkspaces(call)) {
    for (const space of ws.spaces) {
      const list = space.lists.find((l) => l.id === listId);
      if (!list) continue;
      return [space.name, ...folderPath(space.folders, list.folderId), list.name].join(' / ');
    }
  }
  return 'a List';
}

export function folderPath(folders: { id: string; name: string; parentId: string | null }[], folderId: string | null): string[] {
  const out: string[] = [];
  let cur = folders.find((f) => f.id === folderId);
  for (let guard = 0; cur && guard < 30; guard++) {
    out.unshift(cur.name);
    const parentId: string | null = cur.parentId;
    cur = folders.find((f) => f.id === parentId);
  }
  return out;
}

// What a Space that has never set up statuses of its own shows — the same four the app falls back
// to (FALLBACK_STATUSES in components/mobile/TaskCreateSheet.tsx and its copies). They exist only
// in client code, so they are repeated here; a fifth copy is not good, but an agent told "this List
// has no statuses" would be told something false.
export const BUILT_IN_STATUSES = ['To Do', 'In Progress', 'Review', 'Done'];

export const statusNames = (statuses: RawStatus[]) =>
  statuses.length === 0
    ? BUILT_IN_STATUSES.map((name) => ({ name, kind: name === 'Done' ? 'done' : 'open' }))
    : [...statuses]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ name: s.name, kind: s.isClosed ? 'closed' : s.isDone ? 'done' : 'open' }));

// The status names a task in this place may take: a subtask goes by the nearest task above it that
// has its own set for its subtasks, else the List's own, else the Space's (the same order as
// lib/statusSets.ts's fallbackNamesForTask, which starts from an existing task — this one has to
// answer for a task that does not exist yet). With none anywhere, the built-in four.
export async function allowedStatuses(listId: string, parentId: string | null): Promise<string[]> {
  let current = parentId;
  for (let depth = 0; current && depth < 30; depth++) {
    const own = await prisma.status.findMany({ where: { taskId: current }, orderBy: { order: 'asc' }, select: { name: true } });
    if (own.length) return own.map((s) => s.name);
    current = (await prisma.task.findUnique({ where: { id: current }, select: { parentId: true } }))?.parentId ?? null;
  }
  const ofList = await prisma.status.findMany({ where: { listId }, orderBy: { order: 'asc' }, select: { name: true } });
  if (ofList.length) return ofList.map((s) => s.name);
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { spaceId: true } });
  if (!list) return BUILT_IN_STATUSES;
  const ofSpace = await prisma.status.findMany({
    where: { spaceId: list.spaceId, listId: null, taskId: null },
    orderBy: { order: 'asc' },
    select: { name: true },
  });
  return ofSpace.length ? ofSpace.map((s) => s.name) : BUILT_IN_STATUSES;
}

// The name as it is really spelled, so "done" finds "Done" — or a refusal that lists what exists.
export function matchStatus(wanted: string, allowed: string[]): string {
  const hit = allowed.find((n) => n.toLowerCase() === wanted.trim().toLowerCase());
  if (!hit) throw new AgentError(`There is no status "${wanted}" here. The statuses are: ${allowed.map((n) => `"${n}"`).join(', ')}.`);
  return hit;
}

export function shapeTask(t: RawTask, call: AgentCall, opts: { subtaskCount?: number; fullDescription?: boolean } = {}) {
  const description = plain(t.description);
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    listId: t.listId,
    parentId: t.parentId,
    assignees: t.assignees.map((a) => ({ id: a.id, name: a.name })),
    startDate: osloDay(t.startDate),
    dueDate: osloDay(t.dueDate),
    archived: t.archived,
    description: description && !opts.fullDescription && description.length > 300 ? `${description.slice(0, 300)}…` : description,
    ...(opts.subtaskCount !== undefined ? { subtaskCount: opts.subtaskCount } : {}),
    updatedAt: t.updatedAt,
    url: `${call.baseUrl}/?modal=${t.id}`,
  };
}

export function shapeEvent(e: RawEvent, call: AgentCall) {
  return {
    id: e.id,
    title: e.title,
    start: osloMoment(e.startDate, e.allDay),
    end: osloMoment(e.endDate, e.allDay),
    allDay: e.allDay,
    location: e.location,
    description: plain(e.description),
    attendees: e.assignees.map((a) => ({ id: a.id, name: a.name })),
    workspaceId: e.workspaceId,
    ...(e.recurrence ? { repeats: true } : {}),
    url: `${call.baseUrl}/?event=${e.id}`,
  };
}

// ---- finding one thing, or refusing ------------------------------------------------------------

// A task this key's owner can see, that is not in the Trash, in a workspace the key reaches — or a
// refusal that does not say which of those it was, so a key cannot be used to find out whether a
// hidden task exists.
export async function visibleTask(id: string, call: AgentCall) {
  const access = await ensureTaskAccess(id, call.token.userId);
  if (!access || access.task.deletedAt || !(await openWorkspaceIds(call)).has(access.space.workspaceId)) {
    throw new AgentError(`No task with id "${id}" that you can see.`, 404);
  }
  return access;
}

export async function visibleList(id: string, call: AgentCall) {
  const access = await ensureListAccess(id, call.token.userId);
  if (!access || access.list.deletedAt || !(await openWorkspaceIds(call)).has(access.space.workspaceId)) {
    throw new AgentError(`No List with id "${id}" that you can see. Use list_workspaces to find it.`, 404);
  }
  return access;
}

export async function visibleEvent(id: string, call: AgentCall) {
  const access = await ensureEventAccess(id, call.token.userId);
  if (!access || access.event.deletedAt || !(await openWorkspaceIds(call)).has(access.event.workspaceId)) {
    throw new AgentError(`No event with id "${id}" that you can see.`, 404);
  }
  return access;
}

// Where links should point. AUTH_URL is this deployment's own public address; without it (local
// dev) the address the request came in on is the best there is.
export const baseUrlFor = (req: Request) => (process.env.AUTH_URL ?? new URL(req.url).origin).replace(/\/+$/, '');

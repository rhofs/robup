import { prisma } from '@/lib/prisma';
import { runAsUser } from '@/lib/auth/actAs';
import type { VerifiedToken } from '@/lib/auth/apiToken';
import { ensureListAccess, ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { isRichHtml, richToPlainText } from '@/lib/richText';
import { GET as workspacesGET } from '@/app/api/workspaces/route';
import { GET as tasksGET, POST as tasksPOST } from '@/app/api/tasks/route';
import { PATCH as taskPATCH } from '@/app/api/tasks/[id]/route';
import { GET as commentsGET, POST as commentsPOST } from '@/app/api/tasks/[id]/comments/route';

// Everything an AI agent can do in Siqt. This list IS the permission model: /api/mcp and /api/v1
// both go through `callTool` and nothing else, so what is not here cannot be done with an API key.
//
// Deliberately absent from this first version: deleting or trashing, moving a task to another List
// or parent, privacy/access settings, anything about Spaces, Lists, Docs, chat or accounts. An
// agent that misreads a request can do a lot quickly, so it starts with what is easy to see and
// easy to put right — creating, editing, finishing, commenting.
//
// Each operation calls the route handler the app itself uses, inside runAsUser() (see
// lib/auth/actAs.ts). The handlers do the access checks, the activity log, the notifications and
// the Google Calendar sync; nothing here re-implements them. What this file adds is only what an
// agent needs and a browser does not: input it can be told is wrong in words, and answers small
// enough to read (the app's own payloads are sized for a UI, not a context window).

export class AgentError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 = 400
  ) {
    super(message);
  }
}

export type AgentCall = { token: VerifiedToken; baseUrl: string };

type Json = Record<string, unknown>;

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Json;
  write: boolean;
  run: (args: Json, call: AgentCall) => Promise<unknown>;
};

// ---- small helpers ----------------------------------------------------------------------------

const internal = (path: string, init?: { method: string; body: unknown }) =>
  new Request(`http://siqt.internal${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init ? JSON.stringify(init.body) : undefined,
  });

// A route handler's answer, as data — or its own error message, passed on rather than replaced: the
// handlers already say "Not authorized for this list", and an agent can act on that.
async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new AgentError(message, res.status === 403 ? 403 : res.status === 404 ? 404 : 400);
  }
  return data as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const str = (args: Json, key: string): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new AgentError(`"${key}" must be a string.`);
  return v;
};
const requiredStr = (args: Json, key: string): string => {
  const v = str(args, key)?.trim();
  if (!v) throw new AgentError(`"${key}" is required.`);
  return v;
};
const bool = (args: Json, key: string): boolean | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new AgentError(`"${key}" must be true or false.`);
  return v;
};
const strList = (args: Json, key: string): string[] | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new AgentError(`"${key}" must be a list of ids.`);
  return v as string[];
};

// A date an agent gives. "2026-12-01" means that day the way the app's own date picker means it —
// midnight in Norway — so a task made by an agent and one made by hand for the same day hold the
// same instant, and neither shows up a day early in a list. A full timestamp is taken as given.
// `null` (or "") clears the date; undefined leaves it alone.
function dateArg(args: Json, key: string): string | null | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw new AgentError(`"${key}" must be a date like "2026-12-01", or null to clear it.`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    for (const offset of ['+01:00', '+02:00']) {
      const d = new Date(`${v}T00:00:00${offset}`);
      if (Number.isNaN(d.getTime())) break;
      const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(d);
      if (hour === '00') return d.toISOString();
    }
    throw new AgentError(`"${key}" is not a real date: ${v}`);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AgentError(`"${key}" must be a date like "2026-12-01" or an ISO timestamp.`);
  return d.toISOString();
}

// The day a stored instant falls on in Norway — what the app shows for it.
const osloDay = (iso: string | null | undefined): string | null =>
  iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date(iso)) : null;

const plain = (description: string | null | undefined): string | null => {
  if (!description) return null;
  const text = (isRichHtml(description) ? richToPlainText(description) : description).trim();
  return text || null;
};

// ---- the shapes handed to an agent -------------------------------------------------------------

type RawStatus = { name: string; isDone: boolean; isClosed: boolean; order: number };
type RawWorkspace = {
  id: string;
  name: string;
  members: { id: string; name: string; username: string | null }[];
  spaces: {
    id: string;
    name: string;
    statuses: RawStatus[];
    folders: { id: string; name: string; parentId: string | null }[];
    lists: { id: string; name: string; folderId: string | null; archived: boolean; statuses: RawStatus[] }[];
  }[];
};
type RawTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  listId: string;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  assignees: { id: string; name: string }[];
};
type RawComment = { id: string; body: string; type: string; createdAt: string; author: { id: string; name: string } | null };

const loadWorkspaces = async () => unwrap<RawWorkspace[]>(await workspacesGET(internal('/api/workspaces')));
const loadTasks = async () => unwrap<RawTask[]>(await tasksGET(internal('/api/tasks')));

// What a Space that has never set up statuses of its own shows — the same four the app falls back
// to (FALLBACK_STATUSES in components/mobile/TaskCreateSheet.tsx and its copies). They exist only
// in client code, so they are repeated here; a fifth copy is not good, but an agent told "this List
// has no statuses" would be told something false.
const BUILT_IN_STATUSES = ['To Do', 'In Progress', 'Review', 'Done'];

const statusNames = (statuses: RawStatus[]) =>
  statuses.length === 0
    ? BUILT_IN_STATUSES.map((name) => ({ name, kind: name === 'Done' ? 'done' : 'open' }))
    : [...statuses]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ name: s.name, kind: s.isClosed ? 'closed' : s.isDone ? 'done' : 'open' }));

function shapeTask(t: RawTask, call: AgentCall, opts: { subtaskCount?: number; fullDescription?: boolean } = {}) {
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

// The status names a task in this place may take: a subtask goes by the nearest task above it that
// has its own set for its subtasks, else the List's own, else the Space's (the same order as
// lib/statusSets.ts's fallbackNamesForTask, which starts from an existing task — this one has to
// answer for a task that does not exist yet). With none anywhere, the built-in four.
async function allowedStatuses(listId: string, parentId: string | null): Promise<string[]> {
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
function matchStatus(wanted: string, allowed: string[]): string {
  const hit = allowed.find((n) => n.toLowerCase() === wanted.trim().toLowerCase());
  if (!hit) throw new AgentError(`There is no status "${wanted}" here. The statuses are: ${allowed.map((n) => `"${n}"`).join(', ')}.`);
  return hit;
}

// What the agent just did shows up in the task's activity under its owner's name, because the
// agent acts as them. That is true but incomplete: "Robin changed the status" and "Robin's agent
// changed the status" are different facts to someone reading the history later. The handlers write
// the entries; this adds the key's name to the ones written during this call.
async function markViaAgent(call: AgentCall, taskIds: (string | null | undefined)[], since: Date) {
  const ids = taskIds.filter((id): id is string => !!id);
  if (ids.length === 0) return;
  const rows = await prisma.comment.findMany({
    where: { taskId: { in: ids }, authorId: call.token.userId, type: 'activity', createdAt: { gte: since } },
    select: { id: true, body: true },
  });
  await Promise.all(
    rows.map((r) => prisma.comment.update({ where: { id: r.id }, data: { body: `${r.body} (via ${call.token.name})` } }))
  );
}

// A task this key's owner can see and that is not in the Trash — or a refusal that does not say
// which of the two it was, so a key cannot be used to find out whether a hidden task exists.
async function visibleTask(id: string, userId: string) {
  const access = await ensureTaskAccess(id, userId);
  if (!access || access.task.deletedAt) throw new AgentError(`No task with id "${id}" that you can see.`, 404);
  return access;
}

// ---- the operations ----------------------------------------------------------------------------

const TOOLS: ToolDef[] = [
  {
    name: 'list_workspaces',
    description:
      'Start here. Lists every workspace the user is in, with its Spaces and Lists (each with its id, its path, and the statuses its tasks can have) and the workspace members (id and name, for assigning tasks). Use the ids from this in the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    run: async () => {
      const workspaces = await loadWorkspaces();
      return workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        members: ws.members.map((m) => ({ id: m.id, name: m.name, ...(m.username ? { username: m.username } : {}) })),
        spaces: ws.spaces.map((space) => {
          const folderPath = (folderId: string | null): string[] => {
            const out: string[] = [];
            let cur = space.folders.find((f) => f.id === folderId);
            for (let guard = 0; cur && guard < 30; guard++) {
              out.unshift(cur.name);
              const parentId: string | null = cur.parentId;
              cur = space.folders.find((f) => f.id === parentId);
            }
            return out;
          };
          return {
            id: space.id,
            name: space.name,
            lists: space.lists
              .filter((l) => !l.archived)
              .map((l) => ({
                id: l.id,
                name: l.name,
                path: [space.name, ...folderPath(l.folderId), l.name].join(' / '),
                statuses: statusNames(l.statuses.length ? l.statuses : space.statuses),
              })),
          };
        }),
      }));
    },
  },
  {
    name: 'search_tasks',
    description:
      'Finds tasks the user can see. All filters are optional and combine. Finished-and-archived tasks are left out unless includeArchived is true. Returns at most `limit` tasks (default 50), newest first, each with a url that opens it in Siqt.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for in the title or description.' },
        listId: { type: 'string', description: 'Only tasks in this List.' },
        workspaceId: { type: 'string', description: 'Only tasks in this workspace.' },
        status: { type: 'string', description: 'Only tasks with this status name.' },
        assignedToMe: { type: 'boolean', description: 'Only tasks assigned to the user.' },
        assigneeId: { type: 'string', description: 'Only tasks assigned to this member.' },
        dueFrom: { type: 'string', description: 'Only tasks due on or after this day (YYYY-MM-DD).' },
        dueTo: { type: 'string', description: 'Only tasks due on or before this day (YYYY-MM-DD).' },
        parentId: { type: 'string', description: 'Only the subtasks of this task.' },
        topLevelOnly: { type: 'boolean', description: 'Leave subtasks out.' },
        includeArchived: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    write: false,
    run: async (args, call) => {
      const query = str(args, 'query')?.trim().toLowerCase();
      const listId = str(args, 'listId');
      const workspaceId = str(args, 'workspaceId');
      const status = str(args, 'status')?.trim().toLowerCase();
      const assigneeId = bool(args, 'assignedToMe') ? call.token.userId : str(args, 'assigneeId');
      const dueFrom = str(args, 'dueFrom');
      const dueTo = str(args, 'dueTo');
      const parentId = str(args, 'parentId');
      const topLevelOnly = bool(args, 'topLevelOnly');
      const includeArchived = bool(args, 'includeArchived');
      const rawLimit = args.limit;
      const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 50;

      const all = await loadTasks();
      let listsInWorkspace: Set<string> | null = null;
      if (workspaceId) {
        const ws = (await loadWorkspaces()).find((w) => w.id === workspaceId);
        if (!ws) throw new AgentError(`No workspace with id "${workspaceId}" that you are in.`, 404);
        listsInWorkspace = new Set(ws.spaces.flatMap((s) => s.lists.map((l) => l.id)));
      }
      const childCount = new Map<string, number>();
      for (const t of all) if (t.parentId && !t.archived) childCount.set(t.parentId, (childCount.get(t.parentId) ?? 0) + 1);

      const matches = all.filter((t) => {
        if (!includeArchived && t.archived) return false;
        if (listId && t.listId !== listId) return false;
        if (listsInWorkspace && !listsInWorkspace.has(t.listId)) return false;
        if (status && t.status.toLowerCase() !== status) return false;
        if (assigneeId && !t.assignees.some((a) => a.id === assigneeId)) return false;
        if (parentId && t.parentId !== parentId) return false;
        if (topLevelOnly && t.parentId) return false;
        if (dueFrom || dueTo) {
          const due = osloDay(t.dueDate);
          if (!due) return false;
          if (dueFrom && due < dueFrom) return false;
          if (dueTo && due > dueTo) return false;
        }
        if (query) {
          const haystack = `${t.title}\n${plain(t.description) ?? ''}`.toLowerCase();
          if (!query.split(/\s+/).every((word) => haystack.includes(word))) return false;
        }
        return true;
      });
      return {
        total: matches.length,
        shown: Math.min(limit, matches.length),
        tasks: matches.slice(0, limit).map((t) => shapeTask(t, call, { subtaskCount: childCount.get(t.id) ?? 0 })),
      };
    },
  },
  {
    name: 'get_task',
    description: 'One task in full: its whole description, its subtasks, and its most recent comments.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false,
    },
    write: false,
    run: async (args, call) => {
      const taskId = requiredStr(args, 'taskId');
      await visibleTask(taskId, call.token.userId);
      const all = await loadTasks();
      const task = all.find((t) => t.id === taskId);
      if (!task) throw new AgentError(`No task with id "${taskId}" that you can see.`, 404);
      const comments = await unwrap<RawComment[]>(await commentsGET(internal(`/api/tasks/${taskId}/comments`), params(taskId)));
      return {
        ...shapeTask(task, call, { fullDescription: true }),
        subtasks: all.filter((t) => t.parentId === taskId).map((t) => shapeTask(t, call)),
        comments: comments
          .filter((c) => c.type === 'comment')
          .slice(-20)
          .map((c) => ({ author: c.author?.name ?? null, body: c.body, createdAt: c.createdAt })),
      };
    },
  },
  {
    name: 'create_task',
    description:
      'Creates a task in a List (or, with parentId, a subtask of another task in that List). It is added at the bottom. Only title and listId are required. Returns the new task with a url that opens it.',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'From list_workspaces.' },
        title: { type: 'string' },
        description: { type: 'string', description: 'Plain text.' },
        status: { type: 'string', description: 'One of the List’s status names. Left out, the task gets the List’s first status.' },
        startDate: { type: 'string', description: 'YYYY-MM-DD.' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD.' },
        assigneeIds: { type: 'array', items: { type: 'string' }, description: 'Member ids from list_workspaces.' },
        parentId: { type: 'string', description: 'Make it a subtask of this task (which must be in the same List).' },
      },
      required: ['listId', 'title'],
      additionalProperties: false,
    },
    write: true,
    run: async (args, call) => {
      const since = new Date();
      const listId = requiredStr(args, 'listId');
      const title = requiredStr(args, 'title');
      if (title.length > 500) throw new AgentError('The title is too long (at most 500 characters). Put the detail in the description.');
      const description = str(args, 'description');
      const parentId = str(args, 'parentId') ?? null;
      const startDate = dateArg(args, 'startDate');
      const dueDate = dateArg(args, 'dueDate');
      const assigneeIds = strList(args, 'assigneeIds');

      const listAccess = await ensureListAccess(listId, call.token.userId);
      if (!listAccess || listAccess.list.deletedAt) throw new AgentError(`No List with id "${listId}" that you can see. Use list_workspaces to find it.`, 404);
      if (parentId) {
        const parent = await visibleTask(parentId, call.token.userId);
        if (parent.task.listId !== listId) throw new AgentError('A subtask has to be in the same List as its parent task.');
      }
      const allowed = await allowedStatuses(listId, parentId);
      const wanted = str(args, 'status');
      const status = wanted ? matchStatus(wanted, allowed) : allowed[0];

      const created = await unwrap<{ id: string }>(
        await tasksPOST(
          internal('/api/tasks', {
            method: 'POST',
            body: { listId, title, parentId, ...(status ? { status } : {}), startDate: startDate ?? null, dueDate: dueDate ?? null },
          })
        )
      );
      // The create route takes the fields a new row in the app has; the rest go the way the app
      // sets them afterwards, so assigning still notifies and the calendar still syncs.
      const extra: Json = {};
      if (description?.trim()) extra.description = description;
      if (assigneeIds?.length) extra.assigneeIds = assigneeIds;
      if (Object.keys(extra).length > 0) {
        await unwrap(await taskPATCH(internal(`/api/tasks/${created.id}`, { method: 'PATCH', body: extra }), params(created.id)));
      }
      await markViaAgent(call, [created.id, parentId], since);
      const task = (await loadTasks()).find((t) => t.id === created.id);
      if (!task) throw new AgentError('The task was created but could not be read back.');
      return shapeTask(task, call, { fullDescription: true });
    },
  },
  {
    name: 'update_task',
    description:
      'Changes a task. Only the fields you send are changed. Set archived to true to mark it finished and move it to the archive (false brings it back). Dates take YYYY-MM-DD, or null to clear. assigneeIds replaces the whole list of assignees. It cannot delete a task or move it to another List.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string', description: 'Plain text. Replaces the description.' },
        status: { type: 'string', description: 'One of the status names of the task’s List.' },
        startDate: { type: ['string', 'null'] },
        dueDate: { type: ['string', 'null'] },
        assigneeIds: { type: 'array', items: { type: 'string' } },
        archived: { type: 'boolean' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    write: true,
    run: async (args, call) => {
      const since = new Date();
      const taskId = requiredStr(args, 'taskId');
      const access = await visibleTask(taskId, call.token.userId);
      const patch: Json = {};

      const title = str(args, 'title');
      if (title !== undefined) {
        if (!title.trim()) throw new AgentError('A task cannot have an empty title.');
        if (title.length > 500) throw new AgentError('The title is too long (at most 500 characters).');
        patch.title = title.trim();
      }
      const description = str(args, 'description');
      if (description !== undefined) {
        // Once someone has opened a task in the app, its description is a live document
        // (Doc.descriptionTaskId) and Task.description is only a copy of it, rewritten from the
        // document. Writing the copy would look like it worked and then be overwritten the next
        // time anyone typed in the real one — so it is refused, with the way that does work.
        const doc = await prisma.doc.findUnique({ where: { descriptionTaskId: taskId }, select: { id: true } });
        if (doc) {
          throw new AgentError(
            'This task’s description has been opened in Siqt and is now a live document that cannot be replaced from here. Add what you wanted to say as a comment instead (add_comment).'
          );
        }
        patch.description = description;
      }
      const wanted = str(args, 'status');
      if (wanted !== undefined) patch.status = matchStatus(wanted, await allowedStatuses(access.task.listId, access.task.parentId));
      const startDate = dateArg(args, 'startDate');
      if (startDate !== undefined) patch.startDate = startDate;
      const dueDate = dateArg(args, 'dueDate');
      if (dueDate !== undefined) patch.dueDate = dueDate;
      const assigneeIds = strList(args, 'assigneeIds');
      if (assigneeIds !== undefined) patch.assigneeIds = assigneeIds;
      const archived = bool(args, 'archived');
      if (archived !== undefined) patch.archived = archived;

      if (Object.keys(patch).length === 0) throw new AgentError('Nothing to change: send at least one field besides taskId.');
      await unwrap(await taskPATCH(internal(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch }), params(taskId)));
      await markViaAgent(call, [taskId], since);
      const task = (await loadTasks()).find((t) => t.id === taskId);
      if (!task) throw new AgentError('The task was changed but could not be read back.');
      return shapeTask(task, call, { fullDescription: true });
    },
  },
  {
    name: 'add_comment',
    description:
      'Posts a comment on a task, as the user. The comment ends with a line saying it was sent through this API key, so readers can tell it from one the user typed.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' }, body: { type: 'string' } },
      required: ['taskId', 'body'],
      additionalProperties: false,
    },
    write: true,
    run: async (args, call) => {
      const taskId = requiredStr(args, 'taskId');
      const body = requiredStr(args, 'body');
      if (body.length > 10_000) throw new AgentError('The comment is too long (at most 10 000 characters).');
      await visibleTask(taskId, call.token.userId);
      const comment = await unwrap<RawComment>(
        await commentsPOST(
          internal(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { body: `${body}\n\n— via ${call.token.name}` } }),
          params(taskId)
        )
      );
      return { id: comment.id, taskId, body: comment.body, createdAt: comment.createdAt, url: `${call.baseUrl}/?modal=${taskId}` };
    },
  },
];

// What this key may use: a read key is not shown the tools that change things, and cannot call
// them by name either (callTool checks again — hiding a tool is not the same as refusing it).
export const toolsFor = (token: VerifiedToken): ToolDef[] => TOOLS.filter((t) => !t.write || token.scope === 'write');

export async function callTool(name: string, args: unknown, call: AgentCall): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new AgentError(`Unknown tool "${name}".`, 404);
  if (tool.write && call.token.scope !== 'write') {
    throw new AgentError('This API key is read-only. Changing things needs a key made with write access (Siqt → Settings).', 403);
  }
  const input = args && typeof args === 'object' && !Array.isArray(args) ? (args as Json) : {};
  return runAsUser({ userId: call.token.userId, tokenId: call.token.tokenId, tokenName: call.token.name }, () => tool.run(input, call));
}

// Where links to tasks should point. AUTH_URL is this deployment's own public address; without it
// (local dev) the address the request came in on is the best there is.
export const baseUrlFor = (req: Request) => (process.env.AUTH_URL ?? new URL(req.url).origin).replace(/\/+$/, '');

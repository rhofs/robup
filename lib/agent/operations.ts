import { prisma } from '@/lib/prisma';
import { runAsUser } from '@/lib/auth/actAs';
import { GET as commentsGET } from '@/app/api/tasks/[id]/comments/route';
import { CHANGE_TYPES, MAX_CHANGES, performAction, undoAction } from '@/lib/agent/changes';
import {
  AgentError,
  bool,
  folderPath,
  internal,
  loadEvents,
  loadTasks,
  loadWorkspaces,
  openWorkspaceIds,
  osloDay,
  params,
  plain,
  requiredStr,
  shapeEvent,
  shapeTask,
  statusNames,
  str,
  unwrap,
  visibleTask,
  type AgentCall,
  type Json,
} from '@/lib/agent/shared';

export { AgentError, baseUrlFor, newCall } from '@/lib/agent/shared';

// Everything an AI agent can do in Siqt. This list IS the permission model: /api/mcp and /api/v1
// both go through `callTool` and nothing else, so what is not here cannot be done with an API key.
//
// Reading is done here. Changing is done in lib/agent/changes.ts, where every change belongs to an
// action that is recorded, announced once and can be undone — the single-change tools below
// (create_task and the rest) are an action of one, and apply_changes is an action of many.
//
// Still deliberately absent: deleting for good (the Trash is as far as it goes), privacy and access
// settings, and anything about Spaces, Lists, Docs, chat or accounts.

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Json;
  write: boolean;
  run: (args: Json, call: AgentCall) => Promise<unknown>;
};

type RawComment = { id: string; body: string; type: string; createdAt: string; author: { id: string; name: string } | null };

const REQUEST_ID = {
  type: 'string',
  description:
    'A unique id you make up for this request (any string). If the call is sent twice with the same requestId it is only carried out once — always send one, so a retry cannot create duplicates.',
};
const DAY = 'A day, "2026-12-01".';
const WHEN = 'A day ("2026-12-01", all day) or a time in Norway ("2026-12-01T10:00").';

// The fields of each kind of change, once: used by its own tool and inside apply_changes.
const CHANGE_FIELDS: Record<string, { title: string; properties: Json; required: string[] }> = {
  create_task: {
    title: 'Creates a task in a List — or, with parentId, a subtask. It is added at the bottom.',
    properties: {
      listId: { type: 'string', description: 'From list_workspaces.' },
      title: { type: 'string' },
      description: { type: 'string', description: 'Plain text.' },
      status: { type: 'string', description: 'One of the List’s status names. Left out, the task gets the first one.' },
      startDate: { type: 'string', description: DAY },
      dueDate: { type: 'string', description: DAY },
      assigneeIds: { type: 'array', items: { type: 'string' }, description: 'Member ids from list_workspaces.' },
      parentId: {
        type: 'string',
        description: 'Make it a subtask of this task (same List). In apply_changes it can be "$name", the ref of a task created earlier in the same call.',
      },
      ref: { type: 'string', description: 'Only in apply_changes: a name for this new task, so later changes in the same call can use "$name" as parentId.' },
    },
    required: ['listId', 'title'],
  },
  update_task: {
    title:
      'Changes a task. Only the fields sent are changed. archived: true marks it finished and archives it (false brings it back). Dates: a day, or null to clear. assigneeIds replaces the whole list.',
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
  },
  move_task: {
    title:
      'Moves a task: to a place in the order (beforeTaskId or afterTaskId — it joins that task’s List and level), in under another task (parentId), out to the top level (parentId: null), or to another List (listId). To sort a List, send one move per task in apply_changes.',
    properties: {
      taskId: { type: 'string' },
      beforeTaskId: { type: 'string', description: 'Place it directly above this task.' },
      afterTaskId: { type: 'string', description: 'Place it directly below this task.' },
      parentId: { type: ['string', 'null'], description: 'Make it a subtask of this task; null moves it out to the top level.' },
      listId: { type: 'string', description: 'Move it to this List (same workspace; not for a task that has subtasks).' },
    },
    required: ['taskId'],
  },
  trash_task: {
    title: 'Moves a task (and its subtasks) to the Trash. It can be restored; nothing is deleted for good.',
    properties: { taskId: { type: 'string' } },
    required: ['taskId'],
  },
  add_comment: {
    title: 'Posts a comment on a task, as the user. A last line says it was sent through this API key.',
    properties: { taskId: { type: 'string' }, body: { type: 'string' } },
    required: ['taskId', 'body'],
  },
  create_event: {
    title:
      'Creates a calendar event (a meeting, an appointment) in a workspace. With only a day it is all-day; with a time and no end it lasts one hour.',
    properties: {
      workspaceId: { type: 'string', description: 'From list_workspaces.' },
      title: { type: 'string' },
      start: { type: 'string', description: WHEN },
      end: { type: 'string', description: WHEN },
      location: { type: 'string' },
      description: { type: 'string' },
      attendeeIds: { type: 'array', items: { type: 'string' }, description: 'Member ids from list_workspaces — who takes part.' },
    },
    required: ['workspaceId', 'title', 'start'],
  },
  update_event: {
    title: 'Changes a calendar event. Only the fields sent are changed. Moving only the start keeps its length. attendeeIds replaces the whole list.',
    properties: {
      eventId: { type: 'string' },
      title: { type: 'string' },
      start: { type: 'string', description: WHEN },
      end: { type: 'string', description: WHEN },
      location: { type: 'string' },
      description: { type: 'string' },
      attendeeIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['eventId'],
  },
  trash_event: {
    title: 'Moves a calendar event to the Trash. It can be restored.',
    properties: { eventId: { type: 'string' } },
    required: ['eventId'],
  },
};

// A tool that makes one change: an action of one.
const singleChangeTool = (type: string): ToolDef => {
  const def = CHANGE_FIELDS[type];
  // `ref` only means something inside apply_changes.
  const { ref: _ref, ...properties } = def.properties as Record<string, unknown>;
  void _ref;
  return {
    name: type,
    description: `${def.title} For more than one change at a time, use apply_changes instead: it is one step for the user, one notification, and one thing to undo.`,
    inputSchema: { type: 'object', properties: { ...properties, requestId: REQUEST_ID }, required: def.required, additionalProperties: false },
    write: true,
    run: async (args, call) => {
      const { requestId, ...rest } = args;
      const out = (await performAction({ requestId: typeof requestId === 'string' ? requestId : undefined, changes: [{ type, args: rest }] }, call)) as Json;
      // One change: hand back the thing itself, with how to undo it.
      const first = Array.isArray(out.results) ? (out.results[0] as Json | undefined) : undefined;
      if (out.error) throw new AgentError(String(out.error));
      return { ...(first ?? {}), actionId: out.actionId, ...(out.repeated ? { repeated: true, note: out.note } : {}) };
    },
  };
};

const TOOLS: ToolDef[] = [
  {
    name: 'list_workspaces',
    description:
      'Start here. Lists the workspaces this key reaches, with their Spaces and Lists (each with its id, its path, and the statuses its tasks can have) and the members (id and name, for assigning tasks and inviting to events). Use the ids from this in the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    run: async (_args, call) => {
      const workspaces = await loadWorkspaces(call);
      return workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        members: ws.members.map((m) => ({ id: m.id, name: m.name, ...(m.username ? { username: m.username } : {}), ...(m.id === call.token.userId ? { you: true } : {}) })),
        spaces: ws.spaces.map((space) => ({
          id: space.id,
          name: space.name,
          lists: space.lists
            .filter((l) => !l.archived)
            .map((l) => ({
              id: l.id,
              name: l.name,
              path: [space.name, ...folderPath(space.folders, l.folderId), l.name].join(' / '),
              statuses: statusNames(l.statuses.length ? l.statuses : space.statuses),
            })),
        })),
      }));
    },
  },
  {
    name: 'search_tasks',
    description:
      'Finds tasks the user can see. All filters are optional and combine. Finished-and-archived tasks are left out unless includeArchived is true. Within one List the tasks come in the order the board shows them; otherwise newest first. At most `limit` (default 50), each with a url that opens it in Siqt.',
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

      const all = await loadTasks(call);
      let listsInWorkspace: Set<string> | null = null;
      if (workspaceId) {
        const ws = (await loadWorkspaces(call)).find((w) => w.id === workspaceId);
        if (!ws) throw new AgentError(`No workspace with id "${workspaceId}" that this key reaches.`, 404);
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
      // An agent asked to sort a List has to see the order it is in now.
      if (listId || parentId) {
        matches.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      return {
        total: matches.length,
        shown: Math.min(limit, matches.length),
        tasks: matches.slice(0, limit).map((t) => shapeTask(t, call, { subtaskCount: childCount.get(t.id) ?? 0 })),
      };
    },
  },
  {
    name: 'get_task',
    description: 'One task in full: its whole description, its subtasks in order, and its most recent comments.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false },
    write: false,
    run: async (args, call) => {
      const taskId = requiredStr(args, 'taskId');
      await visibleTask(taskId, call);
      const all = await loadTasks(call);
      const task = all.find((t) => t.id === taskId);
      if (!task) throw new AgentError(`No task with id "${taskId}" that you can see.`, 404);
      const comments = await unwrap<RawComment[]>(await commentsGET(internal(`/api/tasks/${taskId}/comments`), params(taskId)));
      return {
        ...shapeTask(task, call, { fullDescription: true }),
        subtasks: all
          .filter((t) => t.parentId === taskId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map((t) => shapeTask(t, call)),
        comments: comments
          .filter((c) => c.type === 'comment')
          .slice(-20)
          .map((c) => ({ author: c.author?.name ?? null, body: c.body, createdAt: c.createdAt })),
      };
    },
  },
  {
    name: 'search_events',
    description:
      'Finds calendar events (meetings, appointments) the user can see, soonest first. All filters are optional. A repeating event is listed once, at its first occurrence, marked repeats.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for in the title, description or location.' },
        workspaceId: { type: 'string' },
        from: { type: 'string', description: 'Only events that end on or after this day (YYYY-MM-DD).' },
        to: { type: 'string', description: 'Only events that start on or before this day (YYYY-MM-DD).' },
        attendingMe: { type: 'boolean', description: 'Only events the user takes part in.' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    write: false,
    run: async (args, call) => {
      const query = str(args, 'query')?.trim().toLowerCase();
      const workspaceId = str(args, 'workspaceId');
      const from = str(args, 'from');
      const to = str(args, 'to');
      const attendingMe = bool(args, 'attendingMe');
      const rawLimit = args.limit;
      const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 50;
      const matches = (await loadEvents(call)).filter((e) => {
        if (workspaceId && e.workspaceId !== workspaceId) return false;
        if (attendingMe && !e.assignees.some((a) => a.id === call.token.userId)) return false;
        if (from && (osloDay(e.endDate) ?? '') < from) return false;
        if (to && (osloDay(e.startDate) ?? '') > to) return false;
        if (query) {
          const haystack = `${e.title}\n${plain(e.description) ?? ''}\n${e.location ?? ''}`.toLowerCase();
          if (!query.split(/\s+/).every((word) => haystack.includes(word))) return false;
        }
        return true;
      });
      return { total: matches.length, shown: Math.min(limit, matches.length), events: matches.slice(0, limit).map((e) => shapeEvent(e, call)) };
    },
  },
  ...['create_task', 'update_task', 'move_task', 'trash_task', 'add_comment', 'create_event', 'update_event', 'trash_event'].map(singleChangeTool),
  {
    name: 'apply_changes',
    description: `Makes several changes as ONE step: one entry in the workspace’s agent log, one notification per person involved, and one thing to undo. Use it whenever the user’s request means more than one change (creating a task with subtasks, updating many tasks, sorting a List). All changes must be in the same workspace; at most ${MAX_CHANGES} per call. Everything is checked first — if any change is not possible, nothing is done. Send dryRun: true to get the list of what would change without changing anything; do that and show it to the user before a large or risky set of changes.`,
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One sentence, in the user’s language, saying what this is for. It is what people see in the log and in the notification.' },
        dryRun: { type: 'boolean', description: 'true: only report what would change.' },
        requestId: REQUEST_ID,
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_CHANGES,
          description: `Carried out in order. Each has a "type" (${CHANGE_TYPES.join(', ')}) and that type’s own fields.`,
          items: {
            oneOf: CHANGE_TYPES.map((type) => ({
              type: 'object',
              description: CHANGE_FIELDS[type].title,
              properties: { type: { const: type }, ...CHANGE_FIELDS[type].properties },
              required: ['type', ...CHANGE_FIELDS[type].required],
              additionalProperties: false,
            })),
          },
        },
      },
      required: ['summary', 'changes'],
      additionalProperties: false,
    },
    write: true,
    run: async (args, call) => {
      const summary = requiredStr(args, 'summary');
      const raw = args.changes;
      if (!Array.isArray(raw)) throw new AgentError('"changes" must be a list.');
      const changes = raw.map((c, i) => {
        if (!c || typeof c !== 'object' || Array.isArray(c) || typeof (c as Json).type !== 'string') {
          throw new AgentError(`Change ${i + 1} needs a "type".`);
        }
        const { type, ...rest } = c as Json;
        return { type: type as string, args: rest };
      });
      return performAction({ summary, changes, dryRun: bool(args, 'dryRun'), requestId: str(args, 'requestId') }, call);
    },
  },
  {
    name: 'list_my_actions',
    description: 'What this user’s agents have changed recently (newest first), with the actionId needed to undo each.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false },
    write: false,
    run: async (args, call) => {
      const rawLimit = args.limit;
      const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 10;
      const open = [...(await openWorkspaceIds(call))];
      const actions = await prisma.agentAction.findMany({
        where: { userId: call.token.userId, workspaceId: { in: open }, status: { not: 'running' } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return actions.map((a) => ({
        actionId: a.id,
        summary: a.summary,
        when: a.createdAt,
        key: a.tokenName,
        status: a.status,
        changes: (JSON.parse(a.changesJson) as { label: string }[]).map((c) => c.label),
      }));
    },
  },
  {
    name: 'undo_action',
    description:
      'Undoes one earlier action by this user’s agents, as a whole: created things go to the Trash, changed fields get their old values back, moved tasks go back. Anything a person has changed since is left alone, and the answer says so.',
    inputSchema: { type: 'object', properties: { actionId: { type: 'string' } }, required: ['actionId'], additionalProperties: false },
    write: true,
    run: async (args, call) => {
      const actionId = requiredStr(args, 'actionId');
      const action = await prisma.agentAction.findUnique({ where: { id: actionId }, select: { userId: true, workspaceId: true } });
      // An agent undoes its own user's actions only — a workspace admin undoing someone else's
      // agent is a decision for a person, made in Settings.
      if (!action || action.userId !== call.token.userId || !(await openWorkspaceIds(call)).has(action.workspaceId)) {
        throw new AgentError(`No action with id "${actionId}" that you can undo. Use list_my_actions.`, 404);
      }
      return undoAction(actionId, call.token.userId);
    },
  },
];

// What this key may use: a read key is not shown the tools that change things, and cannot call
// them by name either (callTool checks again — hiding a tool is not the same as refusing it).
export const toolsFor = (call: AgentCall): ToolDef[] => TOOLS.filter((t) => !t.write || call.token.scope === 'write');

export async function callTool(name: string, args: unknown, call: AgentCall): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new AgentError(`Unknown tool "${name}".`, 404);
  if (tool.write && call.token.scope !== 'write') {
    throw new AgentError('This API key is read-only. Changing things needs a key made with write access (Siqt → Settings).', 403);
  }
  const input = args && typeof args === 'object' && !Array.isArray(args) ? (args as Json) : {};
  // Reading runs as the key's owner here. Changing sets up its own (it has notifications to hold).
  return tool.write ? tool.run(input, call) : runAsUser({ userId: call.token.userId, tokenId: call.token.tokenId, tokenName: call.token.name }, () => tool.run(input, call));
}

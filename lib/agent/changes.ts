import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runAsUser, type HeldNotification } from '@/lib/auth/actAs';
import { deliverNotification } from '@/lib/notifications';
import { canManageWorkspace, getWorkspaceRole } from '@/lib/auth/access';
import { POST as tasksPOST } from '@/app/api/tasks/route';
import { PATCH as taskPATCH, DELETE as taskDELETE } from '@/app/api/tasks/[id]/route';
import { POST as reorderPOST } from '@/app/api/tasks/reorder/route';
import { POST as commentsPOST } from '@/app/api/tasks/[id]/comments/route';
import { POST as eventsPOST } from '@/app/api/events/route';
import { PATCH as eventPATCH, DELETE as eventDELETE } from '@/app/api/events/[id]/route';
import { POST as seriesPOST } from '@/app/api/tasks/[id]/series/route';
import { POST as listsPOST } from '@/app/api/lists/route';
import { DELETE as listDELETE } from '@/app/api/lists/[id]/route';
import { POST as foldersPOST } from '@/app/api/folders/route';
import { DELETE as folderDELETE } from '@/app/api/folders/[id]/route';
import { POST as taskDocsPOST } from '@/app/api/tasks/[id]/docs/route';
import { POST as spaceDocsPOST } from '@/app/api/spaces/[id]/docs/route';
import { DELETE as docDELETE } from '@/app/api/docs/[id]/route';
import { contentFromJSON } from '@/lib/collab/docContent';
import { normalizeRecurrence } from '@/lib/recurrence';
import { markdownToDocJSON } from '@/lib/agent/markdown';
import {
  AgentError,
  BUILT_IN_STATUSES,
  allowedStatuses,
  bool,
  dateArg,
  fieldValues,
  fieldsByList,
  internal,
  listPath,
  loadEvents,
  loadTasks,
  matchStatus,
  osloDay,
  osloMoment,
  params,
  parseWhen,
  requireOpen,
  requiredStr,
  shapeEvent,
  shapeTask,
  str,
  strList,
  unwrap,
  visibleEvent,
  visibleFolder,
  visibleList,
  visibleSpace,
  visibleTask,
  type AgentCall,
  type Json,
} from '@/lib/agent/shared';

// Everything an agent can CHANGE, and how each change is undone.
//
// The unit is the action: one call from the agent, holding one change or a hundred. An action is
//   - planned in full before anything is touched, so a mistake in change 40 stops it before change
//     1 happens, and so it can be shown without being done (`dryRun`);
//   - recorded (AgentAction) with what each change replaced;
//   - announced once per person, not once per task (the handlers' notifications are held while it
//     runs — lib/auth/actAs.ts);
//   - undone as a whole, from the workspace's agent log or by the agent itself.
//
// Each change still goes through the route handler the app itself uses, so access rules, the
// activity log and Google Calendar sync are the app's own. What is new here is only the bookkeeping
// around them.
//
// Undo puts back what the agent changed, field by field, and only where the value is still the one
// the agent left. If a person has since changed that field, their change wins and the undo says so
// — putting back an old value over someone's newer work would be a second mistake, not a repair.

export const MAX_CHANGES = 100;

// ---- what is remembered about each change ------------------------------------------------------

type TaskFields = {
  title?: string;
  description?: string | null;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  assigneeIds?: string[];
  archived?: boolean;
  // Only the fields that were touched, by field id. '' is "empty".
  customFields?: Record<string, string>;
};
type EventFields = {
  title?: string;
  description?: string | null;
  location?: string | null;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
  assigneeIds?: string[];
  recurrence?: string | null;
  workspaceId?: string;
  spaceId?: string | null;
};
type Place = { listId: string; parentId: string | null };

export type UndoRecord =
  | { kind: 'task_created'; taskId: string }
  | { kind: 'task_updated'; taskId: string; before: TaskFields; after: TaskFields }
  | { kind: 'task_moved'; taskId: string; before: Place & { order: string[] }; after: Place }
  | { kind: 'task_trashed'; taskId: string }
  // taskId: the task that was repeated; taskIds: the copies made of it.
  | { kind: 'tasks_copied'; taskId: string; taskIds: string[] }
  | { kind: 'list_created'; listId: string }
  | { kind: 'folder_created'; folderId: string }
  | { kind: 'doc_created'; docId: string }
  | { kind: 'comment_added'; taskId: string; commentId: string }
  | { kind: 'event_created'; eventId: string }
  | { kind: 'event_updated'; eventId: string; before: EventFields; after: EventFields }
  | { kind: 'event_trashed'; eventId: string };

// One row of AgentAction.changesJson. `mentions`: other tasks the label names besides the one that
// was changed — "Move A above B" names B, "Create subtask under P" names P. The log only describes
// a change to someone who could open everything it names (app/api/workspaces/[id]/agent-actions):
// found by testing with a private task, whose title showed up in the line about its neighbour.
export type RecordedChange = { type: string; label: string; undo: UndoRecord; mentions?: string[]; undone?: string };

type Done = { undo: UndoRecord; result: unknown; mentions?: string[] };
type Planned = {
  type: string;
  label: string;
  workspaceId: string;
  details?: Json;
  run: (refs: Map<string, string>) => Promise<Done>;
};
// `pending`: tasks an earlier change in the same action will create, by the name the agent gave
// them (`ref`), so a later change can make subtasks under a task that does not exist yet.
// A pending List or folder (created earlier in the same call) can likewise be named as "$ref".
type Pending = { kind: 'task' | 'list' | 'folder'; listId?: string; spaceId: string; workspaceId: string; title: string };
type PlanCtx = { call: AgentCall; pending: Map<string, Pending> };

function claimRef(ref: string | undefined, pending: Map<string, Pending>, value: Pending) {
  if (!ref) return;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(ref)) throw new AgentError('"ref" may only use letters, digits, - and _.');
  if (pending.has(ref)) throw new AgentError(`ref "${ref}" is used twice in this call.`);
  pending.set(ref, value);
}
const fromRef = (refs: Map<string, string>, value: string): string => {
  if (!value.startsWith('$')) return value;
  const id = refs.get(value.slice(1));
  if (!id) throw new AgentError(`What "${value}" refers to was not created.`);
  return id;
};

// What an agent sends for custom fields — { "Field name or id": value } — as field id → stored
// string, checked against the fields this List really has. null or "" empties a field.
async function resolveCustomFields(raw: unknown, listId: string, call: AgentCall): Promise<Record<string, string> | undefined> {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new AgentError('"customFields" must be an object like { "Field name": "value" }.');
  const defs = (await fieldsByList(call)).get(listId) ?? [];
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Json)) {
    const def = defs.find((d) => d.id === key) ?? defs.find((d) => d.name.toLowerCase() === key.trim().toLowerCase());
    if (!def) {
      throw new AgentError(
        defs.length ? `This List has no custom field "${key}". Its fields are: ${defs.map((d) => `"${d.name}"`).join(', ')}.` : `This List has no custom fields, so "${key}" cannot be set.`
      );
    }
    if (value === null || value === '') {
      out[def.id] = '';
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') throw new AgentError(`The value for "${def.name}" must be text or a number.`);
    const text = String(value).trim();
    if (def.type === 'dropdown') {
      const hit = def.options.find((o) => o.label.toLowerCase() === text.toLowerCase());
      if (!hit) throw new AgentError(`"${def.name}" has no option "${text}". The options are: ${def.options.map((o) => `"${o.label}"`).join(', ')}.`);
      out[def.id] = hit.label;
    } else if (def.type === 'number') {
      if (!Number.isFinite(Number(text))) throw new AgentError(`"${def.name}" is a number field; "${text}" is not a number.`);
      out[def.id] = text;
    } else if (def.type === 'date') {
      const when = parseWhen(text, def.name);
      // A plain day is stored as the day itself — what the app's own picker stores without a time.
      out[def.id] = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : when.iso;
    } else {
      out[def.id] = text;
    }
  }
  return out;
}

// { every: 'week', interval?: 2, until?: '2027-06-30', times?: 10 } → what the app stores
// (lib/recurrence.ts). null stops the repeating.
function repeatArg(args: Json): string | null | undefined {
  const raw = args.repeat;
  if (raw === undefined) return undefined;
  if (raw === null || raw === false) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new AgentError('"repeat" must be like { "every": "week" }, or null to stop it repeating.');
  const r = raw as Json;
  const freq = ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' } as Record<string, string>)[String(r.every)];
  if (!freq) throw new AgentError('"repeat.every" must be "day", "week", "month" or "year".');
  const rule = normalizeRecurrence({ freq, interval: r.interval ?? 1, until: r.until ?? null, count: r.until ? null : r.times ?? null });
  if (!rule) throw new AgentError('That repeat rule could not be understood.');
  return rule;
}

const sameSet = (a: string[] | undefined, b: string[] | undefined) =>
  !!a && !!b && a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---- reading the current state, in the form it is remembered in ---------------------------------

async function taskFields(taskId: string) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      description: true,
      status: true,
      startDate: true,
      dueDate: true,
      archived: true,
      listId: true,
      parentId: true,
      deletedAt: true,
      customFieldValues: true,
      assignees: { select: { id: true, name: true } },
    },
  });
  if (!t) return null;
  return {
    ...t,
    fields: {
      title: t.title,
      description: t.description,
      status: t.status,
      startDate: t.startDate?.toISOString() ?? null,
      dueDate: t.dueDate?.toISOString() ?? null,
      archived: t.archived,
      assigneeIds: t.assignees.map((a) => a.id).sort(),
      customFields: fieldValues(t.customFieldValues),
    } satisfies TaskFields,
  };
}

async function eventFields(eventId: string) {
  const e = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      description: true,
      location: true,
      startDate: true,
      endDate: true,
      allDay: true,
      deletedAt: true,
      workspaceId: true,
      spaceId: true,
      recurrence: true,
      assignees: { select: { id: true, name: true } },
    },
  });
  if (!e) return null;
  return {
    ...e,
    fields: {
      title: e.title,
      description: e.description,
      location: e.location,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate.toISOString(),
      allDay: e.allDay,
      assigneeIds: e.assignees.map((a) => a.id).sort(),
      recurrence: e.recurrence,
      workspaceId: e.workspaceId,
      spaceId: e.spaceId,
    } satisfies EventFields,
  };
}

// The tasks sharing a List and a parent, in the order the board shows them.
async function siblingOrder(place: Place): Promise<string[]> {
  const rows = await prisma.task.findMany({
    where: { listId: place.listId, parentId: place.parentId, deletedAt: null },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const readTask = async (id: string, call: AgentCall) => {
  call.memo.clear();
  const task = (await loadTasks(call)).find((t) => t.id === id);
  return task ? shapeTask(task, call, { fullDescription: true, fields: await fieldsByList(call) }) : { id };
};
const readEvent = async (id: string, call: AgentCall) => {
  call.memo.clear();
  const event = (await loadEvents(call)).find((e) => e.id === id);
  return event ? shapeEvent(event, call) : { id };
};

// For a preview and a log line: only what would actually differ.
const diff = (before: Json, after: Json) => {
  const out: Json = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const same = Array.isArray(a) && Array.isArray(b) ? sameSet(a as string[], b as string[]) : a === b;
    if (!same) out[key] = { from: a ?? null, to: b ?? null };
  }
  return out;
};

const readable = (fields: TaskFields | EventFields, names: Map<string, string>, allDay = true): Json => {
  const out: Json = { ...fields };
  delete out.customFields;
  delete out.spaceId;
  if ('recurrence' in out) out.recurrence = out.recurrence ? 'repeats' : 'does not repeat';
  for (const key of ['startDate', 'dueDate', 'endDate'] as const) {
    const v = (fields as Record<string, unknown>)[key];
    if (typeof v === 'string') out[key] = key === 'dueDate' ? osloDay(v) : osloMoment(v, allDay);
  }
  if (fields.assigneeIds) out.assigneeIds = fields.assigneeIds.map((id) => names.get(id) ?? id);
  if (typeof fields.description === 'string' && fields.description.length > 120) out.description = `${fields.description.slice(0, 120)}…`;
  return out;
};

async function memberNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

// ---- planning each kind of change ---------------------------------------------------------------

const planners: Record<string, (args: Json, ctx: PlanCtx) => Promise<Planned>> = {
  async create_task(args, { call, pending }) {
    const listId = requiredStr(args, 'listId');
    const title = requiredStr(args, 'title');
    if (title.length > 500) throw new AgentError('The title is too long (at most 500 characters). Put the detail in the description.');
    const description = str(args, 'description');
    const parentArg = str(args, 'parentId') ?? null;
    const startDate = dateArg(args, 'startDate');
    const dueDate = dateArg(args, 'dueDate');
    const assigneeIds = strList(args, 'assigneeIds');
    const ref = str(args, 'ref');

    // The List: a real one, or one an earlier change in this call will create.
    const newList = listId.startsWith('$') ? pending.get(listId.slice(1)) : undefined;
    if (listId.startsWith('$') && newList?.kind !== 'list') throw new AgentError(`listId "${listId}" does not match the ref of an earlier create_list in this call.`);
    const list = newList ? null : await visibleList(listId, call);
    const workspaceId = newList?.workspaceId ?? list!.space.workspaceId;
    let parentTitle: string | null = null;
    let realParent: string | null = null;
    if (parentArg?.startsWith('$')) {
      const waiting = pending.get(parentArg.slice(1));
      if (waiting?.kind !== 'task') throw new AgentError(`parentId "${parentArg}" does not match the ref of an earlier create_task in this call.`);
      if (waiting.listId !== listId) throw new AgentError('A subtask has to be in the same List as its parent task.');
      parentTitle = waiting.title;
    } else if (parentArg) {
      const parent = await visibleTask(parentArg, call);
      if (parent.task.listId !== listId) throw new AgentError('A subtask has to be in the same List as its parent task.');
      parentTitle = parent.task.title;
      realParent = parentArg;
    }
    // A List that does not exist yet has no statuses of its own: its Space's, or the built-in four.
    const allowed = newList
      ? await prisma.status
          .findMany({ where: { spaceId: newList.spaceId, listId: null, taskId: null }, orderBy: { order: 'asc' }, select: { name: true } })
          .then((rows) => (rows.length ? rows.map((r) => r.name) : BUILT_IN_STATUSES))
      : await allowedStatuses(listId, realParent);
    const wanted = str(args, 'status');
    const status = wanted ? matchStatus(wanted, allowed) : allowed[0];
    if (newList && args.customFields !== undefined) throw new AgentError('Custom fields cannot be set on a task in a List created in the same call. Set them in a second call.');
    const customFields = newList ? undefined : await resolveCustomFields(args.customFields, listId, call);
    claimRef(ref, pending, { kind: 'task', listId, spaceId: newList?.spaceId ?? list!.space.id, workspaceId, title });
    const where = newList ? `the new List "${newList.title}"` : await listPath(listId, call);
    return {
      type: 'create_task',
      label: parentTitle ? `Create subtask "${title}" under "${parentTitle}"` : `Create task "${title}" in ${where}`,
      workspaceId,
      details: { status, ...(startDate ? { startDate: osloDay(startDate) } : {}), ...(dueDate ? { dueDate: osloDay(dueDate) } : {}) },
      run: async (refs) => {
        const parentId = parentArg ? fromRef(refs, parentArg) : null;
        const realListId = fromRef(refs, listId);
        const created = await unwrap<{ id: string }>(
          await tasksPOST(
            internal('/api/tasks', {
              method: 'POST',
              body: { listId: realListId, title, parentId, ...(status ? { status } : {}), startDate: startDate ?? null, dueDate: dueDate ?? null },
            })
          )
        );
        if (ref) refs.set(ref, created.id);
        // The create route takes the fields a new row in the app has; the rest go the way the app
        // sets them afterwards, so assigning still notifies and the calendar still syncs.
        const extra: Json = {};
        if (description?.trim()) extra.description = description;
        if (assigneeIds?.length) extra.assigneeIds = assigneeIds;
        if (customFields && Object.keys(customFields).length) extra.customFieldValues = JSON.stringify(customFields);
        if (Object.keys(extra).length > 0) {
          await unwrap(await taskPATCH(internal(`/api/tasks/${created.id}`, { method: 'PATCH', body: extra }), params(created.id)));
        }
        return { undo: { kind: 'task_created', taskId: created.id }, result: await readTask(created.id, call), mentions: parentId ? [parentId] : [] };
      },
    };
  },

  async update_task(args, { call }) {
    const taskId = requiredStr(args, 'taskId');
    const access = await visibleTask(taskId, call);
    const patch: TaskFields = {};

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
          `The description of "${access.task.title}" has been opened in Siqt and is now a live document that cannot be replaced from here. Add what you wanted to say as a comment instead (add_comment).`
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
    const customFields = await resolveCustomFields(args.customFields, access.task.listId, call);
    if (customFields && Object.keys(customFields).length) patch.customFields = customFields;
    if (Object.keys(patch).length === 0) throw new AgentError('Nothing to change: send at least one field besides taskId.');

    const current = await taskFields(taskId);
    const names = await memberNames([...(current?.fields.assigneeIds ?? []), ...(patch.assigneeIds ?? [])]);
    const changes = diff(readable(current?.fields ?? {}, names), readable(patch, names));
    if (patch.customFields) {
      const defs = (await fieldsByList(call)).get(access.task.listId) ?? [];
      for (const [id, to] of Object.entries(patch.customFields)) {
        const from = current?.fields.customFields[id] ?? '';
        if (from !== to) changes[defs.find((d) => d.id === id)?.name ?? id] = { from: from || null, to: to || null };
      }
    }
    return {
      type: 'update_task',
      label: `Change "${access.task.title}": ${Object.keys(changes).join(', ') || 'no difference'}`,
      workspaceId: access.space.workspaceId,
      details: changes,
      run: async () => {
        const was = await taskFields(taskId);
        // Custom fields are stored as one JSON object on the task, so the touched ones are merged
        // into what is there now rather than replacing the lot.
        const { customFields: touched, ...plainPatch } = patch;
        const body: Json = { ...plainPatch };
        if (touched) body.customFieldValues = JSON.stringify({ ...(was?.fields.customFields ?? {}), ...touched });
        await unwrap(await taskPATCH(internal(`/api/tasks/${taskId}`, { method: 'PATCH', body }), params(taskId)));
        const now = await taskFields(taskId);
        // Only the fields that were sent, as they stood and as they stand — what the server kept,
        // which is not always what was asked (an assignee who is not a member is dropped).
        const before: TaskFields = {};
        const after: TaskFields = {};
        for (const key of Object.keys(plainPatch) as (keyof TaskFields)[]) {
          (before as Json)[key] = was?.fields[key];
          (after as Json)[key] = now?.fields[key];
        }
        if (touched) {
          before.customFields = {};
          after.customFields = {};
          for (const id of Object.keys(touched)) {
            before.customFields[id] = was?.fields.customFields[id] ?? '';
            after.customFields[id] = now?.fields.customFields[id] ?? '';
          }
        }
        return { undo: { kind: 'task_updated', taskId, before, after }, result: await readTask(taskId, call) };
      },
    };
  },

  async move_task(args, { call }) {
    const taskId = requiredStr(args, 'taskId');
    const access = await visibleTask(taskId, call);
    const task = access.task;
    const toList = str(args, 'listId') ?? task.listId;
    const beforeId = str(args, 'beforeTaskId');
    const afterId = str(args, 'afterTaskId');
    if (beforeId && afterId) throw new AgentError('Send beforeTaskId or afterTaskId, not both.');
    const anchorId = beforeId ?? afterId;

    // Where it should end up. Naming a task to sit next to says it all: its List and its parent.
    let target: Place;
    let anchorTitle: string | null = null;
    if (anchorId) {
      if (anchorId === taskId) throw new AgentError('A task cannot be placed next to itself.');
      const anchor = await visibleTask(anchorId, call);
      if (anchor.task.archived) throw new AgentError('The task to place it next to is archived, so it has no position in the list.');
      target = { listId: anchor.task.listId, parentId: anchor.task.parentId };
      anchorTitle = anchor.task.title;
      if (args.listId !== undefined && toList !== target.listId) throw new AgentError('listId does not match the List of the task to place it next to.');
    } else {
      const parentArg = args.parentId;
      if (parentArg !== undefined && parentArg !== null && typeof parentArg !== 'string') throw new AgentError('"parentId" must be a task id, or null for the top level.');
      // Another List without a parent named means the top level there, not "under the same parent".
      target = { listId: toList, parentId: parentArg === undefined ? (toList === task.listId ? task.parentId : null) : (parentArg as string | null) };
    }
    const moves = target.listId !== task.listId || target.parentId !== task.parentId;
    if (!moves && !anchorId) throw new AgentError('Nothing to move: say where it should go (beforeTaskId, afterTaskId, parentId or listId).');

    let workspaceId = access.space.workspaceId;
    if (target.listId !== task.listId) {
      const list = await visibleList(target.listId, call);
      if (list.space.workspaceId !== workspaceId) throw new AgentError('A task cannot be moved to a List in another workspace.');
      workspaceId = list.space.workspaceId;
      // Its subtasks go with it: the task route moves the whole subtree (and undo, going through
      // the same route, brings it back).
    }
    if (target.parentId && target.parentId !== task.parentId) {
      const parent = await visibleTask(target.parentId, call);
      if (parent.task.listId !== target.listId) throw new AgentError('A subtask has to be in the same List as its parent task.');
      // Not under itself, at any depth.
      let cur: string | null = target.parentId;
      for (let guard = 0; cur && guard < 30; guard++) {
        if (cur === taskId) throw new AgentError('A task cannot be moved in under itself.');
        cur = (await prisma.task.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
      }
    }
    const subtaskCount = target.listId !== task.listId ? await prisma.task.count({ where: { parentId: taskId, deletedAt: null } }) : 0;
    const where = anchorTitle
      ? `${beforeId ? 'above' : 'below'} "${anchorTitle}"`
      : target.parentId && target.parentId !== task.parentId
        ? 'in under another task'
        : target.listId !== task.listId
          ? `to ${await listPath(target.listId, call)}${subtaskCount ? ` (with its ${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'})` : ''}`
          : 'out to the top level';
    return {
      type: 'move_task',
      label: `Move "${task.title}" ${where}`,
      workspaceId,
      run: async () => {
        const from: Place = { listId: task.listId, parentId: task.parentId };
        const order = await siblingOrder(from);
        if (moves) {
          const body: Json = {};
          if (target.parentId !== from.parentId) body.parentId = target.parentId;
          if (target.listId !== from.listId) body.listId = target.listId;
          await unwrap(await taskPATCH(internal(`/api/tasks/${taskId}`, { method: 'PATCH', body }), params(taskId)));
        }
        if (anchorId) {
          await unwrap(
            await reorderPOST(
              internal('/api/tasks/reorder', { method: 'POST', body: { draggedId: taskId, targetId: anchorId, position: beforeId ? 'above' : 'below' } })
            )
          );
        }
        return {
          undo: { kind: 'task_moved', taskId, before: { ...from, order }, after: target },
          result: await readTask(taskId, call),
          mentions: anchorId ? [anchorId] : [],
        };
      },
    };
  },

  async trash_task(args, { call }) {
    const taskId = requiredStr(args, 'taskId');
    const access = await visibleTask(taskId, call);
    const children = await prisma.task.count({ where: { parentId: taskId, deletedAt: null } });
    return {
      type: 'trash_task',
      label: `Move "${access.task.title}" to the Trash${children ? ` (with its ${children} subtask${children === 1 ? '' : 's'})` : ''}`,
      workspaceId: access.space.workspaceId,
      run: async () => {
        await unwrap(await taskDELETE(internal(`/api/tasks/${taskId}`, { method: 'DELETE' }), params(taskId)));
        return { undo: { kind: 'task_trashed', taskId }, result: { id: taskId, trashed: true } };
      },
    };
  },

  async add_comment(args, { call }) {
    const taskId = requiredStr(args, 'taskId');
    const body = requiredStr(args, 'body');
    if (body.length > 10_000) throw new AgentError('The comment is too long (at most 10 000 characters).');
    const access = await visibleTask(taskId, call);
    return {
      type: 'add_comment',
      label: `Comment on "${access.task.title}"`,
      workspaceId: access.space.workspaceId,
      details: { body: body.length > 200 ? `${body.slice(0, 200)}…` : body },
      run: async () => {
        const comment = await unwrap<{ id: string; body: string; createdAt: string }>(
          await commentsPOST(
            internal(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { body: `${body}\n\n— via ${call.token.name}` } }),
            params(taskId)
          )
        );
        return {
          undo: { kind: 'comment_added', taskId, commentId: comment.id },
          result: { id: comment.id, taskId, body: comment.body, createdAt: comment.createdAt, url: `${call.baseUrl}/?modal=${taskId}` },
        };
      },
    };
  },

  async create_event(args, { call }) {
    const workspaceId = requiredStr(args, 'workspaceId');
    await requireOpen(workspaceId, call);
    const title = requiredStr(args, 'title');
    if (title.length > 500) throw new AgentError('The title is too long (at most 500 characters).');
    const range = eventRange(requiredStr(args, 'start'), str(args, 'end'));
    const description = str(args, 'description');
    const location = str(args, 'location');
    const assigneeIds = strList(args, 'attendeeIds');
    const recurrence = repeatArg(args) ?? null;
    return {
      type: 'create_event',
      label: `Create ${recurrence ? 'repeating ' : ''}event "${title}" on ${osloMoment(range.startDate, range.allDay).replace('T', ' at ')}`,
      workspaceId,
      details: { start: osloMoment(range.startDate, range.allDay), end: osloMoment(range.endDate, range.allDay), allDay: range.allDay },
      run: async () => {
        const created = await unwrap<{ id: string }>(
          await eventsPOST(
            internal('/api/events', {
              method: 'POST',
              body: { workspaceId, title, description: description ?? null, location: location ?? null, ...range, assigneeIds: assigneeIds ?? [], recurrence },
            })
          )
        );
        return { undo: { kind: 'event_created', eventId: created.id }, result: await readEvent(created.id, call) };
      },
    };
  },

  async update_event(args, { call }) {
    const eventId = requiredStr(args, 'eventId');
    const access = await visibleEvent(eventId, call);
    const current = await eventFields(eventId);
    if (!current) throw new AgentError(`No event with id "${eventId}" that you can see.`, 404);
    const patch: EventFields = {};
    const title = str(args, 'title');
    if (title !== undefined) {
      if (!title.trim()) throw new AgentError('An event cannot have an empty title.');
      patch.title = title.trim();
    }
    const description = str(args, 'description');
    if (description !== undefined) patch.description = description;
    const location = str(args, 'location');
    if (location !== undefined) patch.location = location;
    const start = str(args, 'start');
    const end = str(args, 'end');
    if (start !== undefined || end !== undefined) {
      // One end given: the other stays where it is, said the way it was stored.
      const range = eventRange(start ?? osloMoment(current.startDate, current.allDay), end ?? (start ? undefined : osloMoment(current.endDate, current.allDay)), {
        keepLength: start !== undefined && end === undefined ? current.endDate.getTime() - current.startDate.getTime() : undefined,
      });
      Object.assign(patch, range);
    }
    const assigneeIds = strList(args, 'attendeeIds');
    if (assigneeIds !== undefined) patch.assigneeIds = assigneeIds;
    const recurrence = repeatArg(args);
    if (recurrence !== undefined) patch.recurrence = recurrence;
    // To another workspace — typically the personal one, which is how an event is made private.
    const toWorkspace = str(args, 'workspaceId');
    const moving = !!toWorkspace && toWorkspace !== current.workspaceId;
    let movedTo: string | null = null;
    if (moving) {
      await requireOpen(toWorkspace, call);
      patch.workspaceId = toWorkspace;
      patch.spaceId = null;
      movedTo = (await prisma.workspace.findUnique({ where: { id: toWorkspace }, select: { name: true, isPersonal: true } }).then((w) => (w?.isPersonal ? 'the personal workspace (private)' : w?.name))) ?? 'another workspace';
    }
    if (Object.keys(patch).length === 0) throw new AgentError('Nothing to change: send at least one field besides eventId.');

    const names = await memberNames([...current.fields.assigneeIds, ...(patch.assigneeIds ?? [])]);
    const changes = diff(readable(current.fields, names, current.allDay), readable(patch, names, patch.allDay ?? current.allDay));
    if (movedTo) {
      delete changes.workspaceId;
      changes.workspace = { to: movedTo, note: 'People who are not members there are taken off the event.' };
    }
    return {
      type: 'update_event',
      label: movedTo
        ? `Move event "${access.event.title}" to ${movedTo}`
        : `Change event "${access.event.title}": ${Object.keys(changes).join(', ') || 'no difference'}`,
      workspaceId: access.event.workspaceId,
      details: changes,
      run: async () => {
        const was = await eventFields(eventId);
        await unwrap(await eventPATCH(internal(`/api/events/${eventId}`, { method: 'PATCH', body: patch }), params(eventId)));
        const now = await eventFields(eventId);
        const before: EventFields = {};
        const after: EventFields = {};
        // A move also drops attendees who are not members of the new workspace, so they are
        // remembered too — putting the event back puts them back.
        for (const key of [...Object.keys(patch), ...(moving ? ['assigneeIds'] : [])] as (keyof EventFields)[]) {
          (before as Json)[key] = was?.fields[key];
          (after as Json)[key] = now?.fields[key];
        }
        return { undo: { kind: 'event_updated', eventId, before, after }, result: await readEvent(eventId, call) };
      },
    };
  },

  async trash_event(args, { call }) {
    const eventId = requiredStr(args, 'eventId');
    const access = await visibleEvent(eventId, call);
    return {
      type: 'trash_event',
      label: `Move event "${access.event.title}" to the Trash`,
      workspaceId: access.event.workspaceId,
      run: async () => {
        await unwrap(await eventDELETE(internal(`/api/events/${eventId}`, { method: 'DELETE' }), params(eventId)));
        return { undo: { kind: 'event_trashed', eventId }, result: { id: eventId, trashed: true } };
      },
    };
  },

  async repeat_task(args, { call }) {
    const taskId = requiredStr(args, 'taskId');
    const access = await visibleTask(taskId, call);
    const times = Math.floor(Number(args.times));
    const everyDays = Math.round(Number(args.everyDays));
    if (!Number.isFinite(times) || times < 1 || times > 60) throw new AgentError('"times" must be between 1 and 60 — how many more copies to make.');
    if (!Number.isFinite(everyDays) || everyDays < 1 || everyDays > 3650) throw new AgentError('"everyDays" must be a whole number of days between the copies (7 for weekly).');
    const children = await prisma.task.count({ where: { parentId: taskId, deletedAt: null } });
    return {
      type: 'repeat_task',
      label: `Repeat "${access.task.title}" ${times} more time${times === 1 ? '' : 's'}, every ${everyDays === 1 ? 'day' : everyDays === 7 ? 'week' : `${everyDays} days`}${children ? ' (with its subtasks)' : ''}`,
      workspaceId: access.space.workspaceId,
      run: async () => {
        // The app's own "repeat this task": copies of it (and its subtasks) with every date moved.
        const made = await unwrap<{ ids: string[] }>(
          await seriesPOST(internal(`/api/tasks/${taskId}/series`, { method: 'POST', body: { count: times, shiftDays: everyDays, timeZone: 'Europe/Oslo' } }), params(taskId))
        );
        call.memo.clear();
        const all = await loadTasks(call);
        const fields = await fieldsByList(call);
        return {
          undo: { kind: 'tasks_copied', taskId, taskIds: made.ids },
          result: { repeated: taskId, copies: made.ids.map((id) => all.find((t) => t.id === id)).filter((t) => !!t).map((t) => shapeTask(t!, call, { fields })) },
        };
      },
    };
  },

  async create_list(args, { call, pending }) {
    const spaceId = requiredStr(args, 'spaceId');
    const name = requiredStr(args, 'name');
    if (name.length > 200) throw new AgentError('The name is too long (at most 200 characters).');
    const folderArg = str(args, 'folderId') ?? null;
    const space = await visibleSpace(spaceId, call);
    let folderName: string | null = null;
    if (folderArg?.startsWith('$')) {
      const waiting = pending.get(folderArg.slice(1));
      if (waiting?.kind !== 'folder') throw new AgentError(`folderId "${folderArg}" does not match the ref of an earlier create_folder in this call.`);
      if (waiting.spaceId !== spaceId) throw new AgentError('The folder is in another Space.');
      folderName = waiting.title;
    } else if (folderArg) {
      const folder = await visibleFolder(folderArg, call);
      if (folder.space.id !== spaceId) throw new AgentError('The folder is in another Space.');
      folderName = folder.folder.name;
    }
    claimRef(str(args, 'ref'), pending, { kind: 'list', spaceId, workspaceId: space.space.workspaceId, title: name });
    const ref = str(args, 'ref');
    return {
      type: 'create_list',
      label: `Create List "${name}" in ${space.space.name}${folderName ? ` / ${folderName}` : ''}`,
      workspaceId: space.space.workspaceId,
      run: async (refs) => {
        const folderId = folderArg ? fromRef(refs, folderArg) : null;
        const list = await unwrap<{ id: string; name: string }>(await listsPOST(internal('/api/lists', { method: 'POST', body: { spaceId, name, folderId } })));
        if (ref) refs.set(ref, list.id);
        return { undo: { kind: 'list_created', listId: list.id }, result: { id: list.id, name: list.name, spaceId, folderId } };
      },
    };
  },

  async create_folder(args, { call, pending }) {
    const spaceId = requiredStr(args, 'spaceId');
    const name = requiredStr(args, 'name');
    if (name.length > 200) throw new AgentError('The name is too long (at most 200 characters).');
    const parentArg = str(args, 'parentFolderId') ?? null;
    const space = await visibleSpace(spaceId, call);
    let parentName: string | null = null;
    if (parentArg?.startsWith('$')) {
      const waiting = pending.get(parentArg.slice(1));
      if (waiting?.kind !== 'folder') throw new AgentError(`parentFolderId "${parentArg}" does not match the ref of an earlier create_folder in this call.`);
      parentName = waiting.title;
    } else if (parentArg) {
      const parent = await visibleFolder(parentArg, call);
      if (parent.space.id !== spaceId) throw new AgentError('The parent folder is in another Space.');
      parentName = parent.folder.name;
    }
    const ref = str(args, 'ref');
    claimRef(ref, pending, { kind: 'folder', spaceId, workspaceId: space.space.workspaceId, title: name });
    return {
      type: 'create_folder',
      label: `Create folder "${name}" in ${space.space.name}${parentName ? ` / ${parentName}` : ''}`,
      workspaceId: space.space.workspaceId,
      run: async (refs) => {
        const parentId = parentArg ? fromRef(refs, parentArg) : null;
        const folder = await unwrap<{ id: string; name: string }>(await foldersPOST(internal('/api/folders', { method: 'POST', body: { spaceId, name, parentId } })));
        if (ref) refs.set(ref, folder.id);
        return { undo: { kind: 'folder_created', folderId: folder.id }, result: { id: folder.id, name: folder.name, spaceId, parentFolderId: parentId } };
      },
    };
  },

  async create_doc(args, { call, pending }) {
    const title = requiredStr(args, 'title');
    if (title.length > 300) throw new AgentError('The title is too long (at most 300 characters).');
    const content = str(args, 'content') ?? '';
    if (content.length > 200_000) throw new AgentError('The content is too long (at most 200 000 characters).');
    const taskArg = str(args, 'taskId');
    const spaceId = str(args, 'spaceId');
    if (!!taskArg === !!spaceId) throw new AgentError('Say where the doc goes: taskId (a doc on that task) or spaceId (a doc in that Space\u2019s Docs) — one of them.');
    let workspaceId: string;
    let where: string;
    if (taskArg?.startsWith('$')) {
      const waiting = pending.get(taskArg.slice(1));
      if (waiting?.kind !== 'task') throw new AgentError(`taskId "${taskArg}" does not match the ref of an earlier create_task in this call.`);
      workspaceId = waiting.workspaceId;
      where = `on the task "${waiting.title}"`;
    } else if (taskArg) {
      const task = await visibleTask(taskArg, call);
      workspaceId = task.space.workspaceId;
      where = `on the task "${task.task.title}"`;
    } else {
      const space = await visibleSpace(spaceId!, call);
      workspaceId = space.space.workspaceId;
      where = `in ${space.space.name}`;
    }
    return {
      type: 'create_doc',
      label: `Create doc "${title}" ${where}`,
      workspaceId,
      run: async (refs) => {
        const taskId = taskArg ? fromRef(refs, taskArg) : null;
        const doc = taskId
          ? await unwrap<{ id: string }>(await taskDocsPOST(internal(`/api/tasks/${taskId}/docs`, { method: 'POST', body: { title } }), params(taskId)))
          : await unwrap<{ id: string }>(await spaceDocsPOST(internal(`/api/spaces/${spaceId}/docs`, { method: 'POST', body: { title } }), params(spaceId!)));
        // The text goes in as a real document (headings, lists…), not as a block of Markdown. Safe
        // to write straight to the row here and only here: the doc is seconds old and nobody has it
        // open, so there is no live editing session whose copy this could be overwritten by.
        if (content.trim()) await prisma.doc.update({ where: { id: doc.id }, data: contentFromJSON(markdownToDocJSON(content)) });
        return {
          undo: { kind: 'doc_created', docId: doc.id },
          result: { id: doc.id, title, ...(taskId ? { taskId, url: `${call.baseUrl}/?modal=${taskId}` } : { spaceId, url: `${call.baseUrl}/?doc=${doc.id}` }) },
          mentions: taskId ? [taskId] : [],
        };
      },
    };
  },
};

export const CHANGE_TYPES = Object.keys(planners);

// What to store for an event that starts at `start` and ends at `end` — the app's own rule
// (lib/eventDates.ts): all day unless a time was given, never an end before its start, and a timed
// event with no end lasts an hour. `keepLength`: when only the start of an existing event moves,
// it keeps its length rather than collapsing to an hour.
function eventRange(start: string, end: string | undefined, opts: { keepLength?: number } = {}) {
  const s = parseWhen(start, 'start');
  const e = end ? parseWhen(end, 'end') : null;
  const allDay = !s.hasTime && !(e?.hasTime ?? false);
  const startMs = new Date(s.iso).getTime();
  let endMs = e ? new Date(e.iso).getTime() : opts.keepLength !== undefined ? startMs + opts.keepLength : allDay ? startMs : startMs + 60 * 60 * 1000;
  if (e && endMs < startMs) throw new AgentError('The event would end before it starts.');
  if (endMs < startMs) endMs = startMs;
  return { startDate: s.iso, endDate: new Date(endMs).toISOString(), allDay };
}

// ---- doing an action ----------------------------------------------------------------------------

export type ActionInput = { summary?: string; requestId?: string; dryRun?: boolean; changes: { type: string; args: Json }[] };

const acting = (call: AgentCall, held?: HeldNotification[]) => ({
  userId: call.token.userId,
  tokenId: call.token.tokenId,
  tokenName: call.token.name,
  held,
});

export async function performAction(input: ActionInput, call: AgentCall): Promise<unknown> {
  if (call.token.scope !== 'write') {
    throw new AgentError('This API key is read-only. Changing things needs a key made with write access (Siqt → Settings).', 403);
  }
  if (input.changes.length === 0) throw new AgentError('No changes were sent.');
  if (input.changes.length > MAX_CHANGES) throw new AgentError(`At most ${MAX_CHANGES} changes in one call. Split it up.`);
  const requestId = input.requestId?.trim() || null;
  if (requestId && requestId.length > 100) throw new AgentError('requestId is too long (at most 100 characters).');

  // The same request, sent again: answered with what the first one did. Checked before planning —
  // a retry of "create these tasks" must not be refused because the tasks now exist.
  if (requestId && !input.dryRun) {
    const earlier = await prisma.agentAction.findFirst({ where: { tokenId: call.token.tokenId, requestId } });
    if (earlier) return replay(earlier);
  }

  // Plan everything first. A refusal here means nothing at all was changed.
  const planned: Planned[] = await runAsUser(acting(call), async () => {
    const ctx: PlanCtx = { call, pending: new Map() };
    const out: Planned[] = [];
    for (const [i, change] of input.changes.entries()) {
      const planner = planners[change.type];
      try {
        if (!planner) throw new AgentError(`Unknown change type "${change.type}". The types are: ${CHANGE_TYPES.join(', ')}.`);
        out.push(await planner(change.args, ctx));
      } catch (err) {
        if (err instanceof AgentError && input.changes.length > 1) {
          throw new AgentError(`Change ${i + 1} of ${input.changes.length} (${change.type}): ${err.message} Nothing was changed.`, err.status);
        }
        throw err;
      }
    }
    return out;
  });
  const workspaceId = planned[0].workspaceId;
  // One action, one workspace: the log it lands in, and the people who can undo it, belong to one.
  if (planned.some((p) => p.workspaceId !== workspaceId)) {
    throw new AgentError('All the changes in one call have to be in the same workspace. Send one call per workspace. Nothing was changed.');
  }
  await requireOpen(workspaceId, call);
  const summary = (input.summary?.trim() || (planned.length === 1 ? planned[0].label : `${planned.length} changes`)).slice(0, 300);

  if (input.dryRun) {
    return {
      dryRun: true,
      note: 'Nothing has been changed. This is what the same call would do without dryRun.',
      summary,
      changes: planned.map((p) => ({ type: p.type, change: p.label, ...(p.details && Object.keys(p.details).length ? { details: p.details } : {}) })),
    };
  }

  // The row goes in before the work starts, so a second copy of the same request arriving while
  // the first is still running meets the unique index instead of running alongside it.
  let action;
  try {
    action = await prisma.agentAction.create({
      data: { tokenId: call.token.tokenId, tokenName: call.token.name, userId: call.token.userId, workspaceId, summary, requestId, changesJson: '[]', status: 'running' },
    });
  } catch (err) {
    if (requestId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const earlier = await prisma.agentAction.findFirst({ where: { tokenId: call.token.tokenId, requestId } });
      if (earlier) return replay(earlier);
    }
    throw err;
  }

  const since = new Date();
  const held: HeldNotification[] = [];
  const recorded: RecordedChange[] = [];
  const results: unknown[] = [];
  let failure: string | null = null;
  await runAsUser(acting(call, held), async () => {
    const refs = new Map<string, string>();
    for (const [i, p] of planned.entries()) {
      try {
        const done = await p.run(refs);
        recorded.push({ type: p.type, label: p.label, undo: done.undo, ...(done.mentions?.length ? { mentions: done.mentions } : {}) });
        results.push(done.result);
      } catch (err) {
        // Planning passed and doing it still failed — something changed in between, or the server
        // broke. What was done stays done and is recorded, so it can be seen and undone.
        failure = `Stopped at change ${i + 1} of ${planned.length} ("${p.label}"): ${err instanceof AgentError ? err.message : 'something went wrong on the server'}`;
        if (!(err instanceof AgentError)) console.error('Agent action failed part-way', err);
        break;
      }
      call.memo.clear();
    }
  });

  await markViaAgent(call.token.userId, recorded, since, `via ${call.token.name}`);
  const result = {
    actionId: action.id,
    summary,
    done: recorded.length,
    ...(failure ? { error: failure, note: `${recorded.length} of ${planned.length} changes were made before it stopped. They are recorded and can be undone.` } : {}),
    results,
    undo: 'This can be undone as a whole: in Siqt under Settings → Workspace → Agent activity, or with undo_action.',
  };
  await prisma.agentAction.update({
    where: { id: action.id },
    data: { changesJson: JSON.stringify(recorded), resultJson: JSON.stringify(result), status: failure ? 'partial' : 'done' },
  });
  await deliverHeld(held, call, summary, recorded.length);
  return result;
}

function replay(action: { status: string; resultJson: string | null }) {
  if (action.status === 'running' || !action.resultJson) {
    throw new AgentError('A request with this requestId is already being carried out. Wait and ask again; do not send it under a new id.', 409);
  }
  return { ...(JSON.parse(action.resultJson) as Json), repeated: true, note: 'This requestId was already carried out; nothing was done again. This is the result from the first time.' };
}

// One notification per person for the whole action. Someone the action touched once gets the
// ordinary notification for that one thing ("assigned you a task", which opens it); someone it
// touched several times gets a single line saying what the agent was doing, instead of a row each.
async function deliverHeld(held: HeldNotification[], call: AgentCall, summary: string, changeCount: number) {
  const perUser = new Map<string, HeldNotification[]>();
  for (const n of held) for (const id of new Set(n.userIds)) perUser.set(id, [...(perUser.get(id) ?? []), n]);
  if (perUser.size === 0) return;
  const actor = await prisma.user.findUnique({ where: { id: call.token.userId }, select: { name: true } });
  for (const [userId, items] of perUser) {
    const one = items.length === 1 ? items[0] : null;
    await deliverNotification(
      one
        ? { ...one, userIds: [userId] }
        : {
            userIds: [userId],
            actorId: call.token.userId,
            type: 'agent_action',
            title: `${actor?.name ?? 'Someone'}’s agent made ${changeCount} changes involving you`,
            body: summary,
          }
    ).catch((err) => console.error('Agent notification failed', err));
  }
}

// What the agent did shows up in a task's activity under its owner's name, because the agent acts
// as them. That is true but incomplete: "Robin changed the status" and "Robin's agent changed the
// status" are different facts to someone reading the history later. The handlers write the
// entries; this adds how it happened to the ones written during this action.
async function markViaAgent(userId: string, changes: RecordedChange[], since: Date, how: string) {
  const taskIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const c of changes) {
    if ('taskId' in c.undo) taskIds.add(c.undo.taskId);
    if ('eventId' in c.undo) eventIds.add(c.undo.eventId);
  }
  if (taskIds.size) {
    // A subtask being added or removed is also written on its parent.
    const parents = await prisma.task.findMany({ where: { id: { in: [...taskIds] } }, select: { parentId: true } });
    for (const p of parents) if (p.parentId) taskIds.add(p.parentId);
    for (const c of changes) if (c.undo.kind === 'task_moved' && c.undo.before.parentId) taskIds.add(c.undo.before.parentId);
  }
  if (taskIds.size === 0 && eventIds.size === 0) return;
  const rows = await prisma.comment.findMany({
    where: {
      authorId: userId,
      type: 'activity',
      createdAt: { gte: since },
      OR: [{ taskId: { in: [...taskIds] } }, { eventId: { in: [...eventIds] } }],
    },
    select: { id: true, body: true },
  });
  await Promise.all(rows.map((r) => prisma.comment.update({ where: { id: r.id }, data: { body: `${r.body} (${how})` } })));
}

// ---- undoing an action --------------------------------------------------------------------------

// Who may undo: the person whose agent did it, and the workspace's owner and admins — the people
// who would be asked to sort it out anyway. It is carried out as the person whose agent did it, so
// it reaches exactly what the agent reached.
export async function undoAction(actionId: string, byUserId: string) {
  const action = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!action) throw new AgentError('No such agent action.', 404);
  const role = await getWorkspaceRole(action.workspaceId, byUserId);
  if (!role) throw new AgentError('No such agent action.', 404);
  if (action.userId !== byUserId && !canManageWorkspace(role)) {
    throw new AgentError('Only the person whose agent did this, or a workspace owner or admin, can undo it.', 403);
  }
  if (action.status === 'undone') throw new AgentError('This has already been undone.', 409);
  if (action.status === 'running') throw new AgentError('This action is still being carried out.', 409);

  const changes = JSON.parse(action.changesJson) as RecordedChange[];
  const since = new Date();
  // Notifications from an undo are dropped: telling someone they were assigned a task, because an
  // assignment an agent removed by mistake was put back, is noise about a correction.
  await runAsUser({ userId: action.userId, tokenId: action.tokenId, tokenName: action.tokenName, held: [] }, async () => {
    for (let i = changes.length - 1; i >= 0; i--) {
      try {
        changes[i].undone = await undoOne(changes[i].undo);
      } catch (err) {
        changes[i].undone = `Could not be undone: ${err instanceof AgentError ? err.message : 'something went wrong on the server'}`;
        if (!(err instanceof AgentError)) console.error('Undo of agent change failed', err);
      }
    }
  });
  await markViaAgent(action.userId, changes, since, 'agent action undone');
  const report = changes.map((c) => ({ change: c.label, outcome: c.undone ?? '' }));
  await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: 'undone', undoneAt: new Date(), undoneById: byUserId, changesJson: JSON.stringify(changes), undoReport: JSON.stringify(report) },
  });
  return { actionId, summary: action.summary, undone: true, changes: report };
}

const patchTask = async (taskId: string, body: Json) =>
  unwrap(await taskPATCH(internal(`/api/tasks/${taskId}`, { method: 'PATCH', body }), params(taskId)));

async function undoOne(undo: UndoRecord): Promise<string> {
  switch (undo.kind) {
    case 'task_created': {
      const task = await prisma.task.findUnique({ where: { id: undo.taskId }, select: { deletedAt: true } });
      if (!task) return 'Already gone.';
      if (task.deletedAt) return 'Already in the Trash.';
      await unwrap(await taskDELETE(internal(`/api/tasks/${undo.taskId}`, { method: 'DELETE' }), params(undo.taskId)));
      return 'Moved to the Trash.';
    }
    case 'task_trashed': {
      const task = await prisma.task.findUnique({ where: { id: undo.taskId }, select: { deletedAt: true } });
      if (!task) return 'It has been deleted for good and cannot be brought back.';
      if (!task.deletedAt) return 'Already restored.';
      await patchTask(undo.taskId, { restore: true });
      return 'Restored from the Trash.';
    }
    case 'task_updated': {
      const now = await taskFields(undo.taskId);
      if (!now) return 'The task no longer exists.';
      const back: Json = {};
      const kept: string[] = [];
      for (const key of Object.keys(undo.after) as (keyof TaskFields)[]) {
        if (key === 'customFields') continue;
        const current = now.fields[key];
        const left = undo.after[key];
        const untouched = Array.isArray(current) ? sameSet(current, left as string[]) : current === left;
        const was = undo.before[key];
        if (Array.isArray(was) ? sameSet(was, current as string[]) : was === current) continue;
        if (untouched) back[key] = was ?? null;
        else kept.push(key);
      }
      if (undo.after.customFields) {
        const values = { ...now.fields.customFields };
        let any = false;
        for (const [id, left] of Object.entries(undo.after.customFields)) {
          const current = values[id] ?? '';
          const was = undo.before.customFields?.[id] ?? '';
          if (was === current) continue;
          if (current === left) {
            values[id] = was;
            any = true;
          } else if (!kept.includes('a custom field')) kept.push('a custom field');
        }
        if (any) back.customFieldValues = JSON.stringify(values);
      }
      if (Object.keys(back).length > 0) await patchTask(undo.taskId, back);
      const put = Object.keys(back).map((k) => (k === 'customFieldValues' ? 'custom fields' : k));
      return [
        put.length ? `Put back: ${put.join(', ')}.` : 'Nothing needed putting back.',
        kept.length ? `Left alone because someone changed it afterwards: ${kept.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    case 'tasks_copied': {
      let trashed = 0;
      for (const id of undo.taskIds) {
        const task = await prisma.task.findUnique({ where: { id }, select: { deletedAt: true } });
        if (!task || task.deletedAt) continue;
        await unwrap(await taskDELETE(internal(`/api/tasks/${id}`, { method: 'DELETE' }), params(id)));
        trashed++;
      }
      return `${trashed} of the ${undo.taskIds.length} copies moved to the Trash.`;
    }
    case 'list_created': {
      const list = await prisma.list.findUnique({ where: { id: undo.listId }, select: { deletedAt: true } });
      if (!list) return 'Already gone.';
      if (list.deletedAt) return 'Already in the Trash.';
      await unwrap(await listDELETE(internal(`/api/lists/${undo.listId}`, { method: 'DELETE' }), params(undo.listId)));
      return 'List moved to the Trash, with what is in it.';
    }
    case 'folder_created': {
      const folder = await prisma.folder.findUnique({ where: { id: undo.folderId }, select: { deletedAt: true } });
      if (!folder) return 'Already gone.';
      if (folder.deletedAt) return 'Already in the Trash.';
      await unwrap(await folderDELETE(internal(`/api/folders/${undo.folderId}`, { method: 'DELETE' }), params(undo.folderId)));
      return 'Folder moved to the Trash, with what is in it.';
    }
    case 'doc_created': {
      const doc = await prisma.doc.findUnique({ where: { id: undo.docId }, select: { deletedAt: true } });
      if (!doc) return 'Already gone.';
      if (doc.deletedAt) return 'Already in the Trash.';
      await unwrap(await docDELETE(internal(`/api/docs/${undo.docId}`, { method: 'DELETE' }), params(undo.docId)));
      return 'Doc moved to the Trash.';
    }
    case 'task_moved': {
      const task = await prisma.task.findUnique({ where: { id: undo.taskId }, select: { listId: true, parentId: true, deletedAt: true } });
      if (!task) return 'The task no longer exists.';
      const stillThere = task.listId === undo.after.listId && task.parentId === undo.after.parentId;
      if (!stillThere) return 'Left alone because someone moved it again afterwards.';
      const body: Json = {};
      if (task.parentId !== undo.before.parentId) body.parentId = undo.before.parentId;
      if (task.listId !== undo.before.listId) body.listId = undo.before.listId;
      if (Object.keys(body).length > 0) await patchTask(undo.taskId, body);
      // Its old neighbours in their old order — those of them that are still there.
      const here = new Set(await siblingOrder(undo.before));
      const ids = undo.before.order.filter((id) => here.has(id));
      if (ids.length > 1) await unwrap(await reorderPOST(internal('/api/tasks/reorder', { method: 'POST', body: { ids } })));
      return 'Moved back to where it was.';
    }
    case 'comment_added': {
      const { count } = await prisma.comment.deleteMany({ where: { id: undo.commentId, taskId: undo.taskId } });
      return count ? 'Comment removed.' : 'The comment was already gone.';
    }
    case 'event_created': {
      const event = await prisma.event.findUnique({ where: { id: undo.eventId }, select: { deletedAt: true } });
      if (!event) return 'Already gone.';
      if (event.deletedAt) return 'Already in the Trash.';
      await unwrap(await eventDELETE(internal(`/api/events/${undo.eventId}`, { method: 'DELETE' }), params(undo.eventId)));
      return 'Moved to the Trash.';
    }
    case 'event_trashed': {
      const event = await prisma.event.findUnique({ where: { id: undo.eventId }, select: { deletedAt: true } });
      if (!event) return 'It has been deleted for good and cannot be brought back.';
      if (!event.deletedAt) return 'Already restored.';
      await unwrap(await eventPATCH(internal(`/api/events/${undo.eventId}`, { method: 'PATCH', body: { restore: true } }), params(undo.eventId)));
      return 'Restored from the Trash.';
    }
    case 'event_updated': {
      const now = await eventFields(undo.eventId);
      if (!now) return 'The event no longer exists.';
      const back: Json = {};
      const kept: string[] = [];
      for (const key of Object.keys(undo.after) as (keyof EventFields)[]) {
        const current = now.fields[key];
        const left = undo.after[key];
        const untouched = Array.isArray(current) ? sameSet(current, left as string[]) : current === left;
        const was = undo.before[key];
        if (Array.isArray(was) ? sameSet(was, current as string[]) : was === current) continue;
        if (untouched) back[key] = was ?? null;
        else kept.push(key);
      }
      if (Object.keys(back).length > 0) {
        await unwrap(await eventPATCH(internal(`/api/events/${undo.eventId}`, { method: 'PATCH', body: back }), params(undo.eventId)));
      }
      const put = Object.keys(back);
      return [
        put.length ? `Put back: ${put.join(', ')}.` : 'Nothing needed putting back.',
        kept.length ? `Left alone because someone changed it afterwards: ${kept.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
  }
}

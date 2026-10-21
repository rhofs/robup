import type { CustomFieldDef, HierarchyWorkspace, Task } from '../store/useTaskStore';

// What decides where a task's dates show (2026-10-21):
//
//  - whether the Planner shows a task at all: the task's own choice (the Planner switch in its date
//    picker, Task.showInPlanner), else its List's default, else its Space's — "om en liste har annen
//    default enn Space, så er det List som bestemmer";
//  - which custom date fields show in the Planner as items of their own, and which count in My
//    Assigned Tasks (CustomField.showInPlanner / showInMyTasks, set in "Edit field").

// listId → whether its tasks show in the Planner when they have not said.
export function plannerDefaults(workspaces: HierarchyWorkspace[]): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const ws of workspaces)
    for (const space of ws.spaces)
      for (const list of space.lists) out.set(list.id, list.plannerDefault ?? space.plannerDefault ?? true);
  return out;
}

export function isTaskInPlanner(task: Pick<Task, 'listId' | 'showInPlanner'>, defaults: Map<string, boolean>): boolean {
  return task.showInPlanner ?? defaults.get(task.listId) ?? true;
}

// listId → the date fields with that switch on that apply to its tasks: the Space's own fields and the
// List's.
export function dateFieldsByList(workspaces: HierarchyWorkspace[], flag: 'showInPlanner' | 'showInMyTasks'): Map<string, CustomFieldDef[]> {
  const out = new Map<string, CustomFieldDef[]>();
  for (const ws of workspaces)
    for (const space of ws.spaces) {
      const fields = space.customFields.filter((f) => f.type === 'date' && f[flag]);
      if (fields.length === 0) continue;
      for (const list of space.lists) {
        const own = fields.filter((f) => !f.listId || f.listId === list.id);
        if (own.length) out.set(list.id, own);
      }
    }
  return out;
}

// A custom date value as an instant: `YYYY-MM-DD` is local midnight that day; anything else is read as
// a date. Null when it is not one.
export function customDateValue(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function fieldValues(task: Pick<Task, 'customFieldValues'>): Record<string, unknown> {
  try {
    const v = JSON.parse(task.customFieldValues || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// A custom date in the Planner is drawn as a task of its own — the same bar, named "Task · Field",
// one day long — so it needs an id the Planner can tell apart and trace back.
const MARKER_SEP = '::';
export const plannerMarkerId = (taskId: string, fieldId: string) => `${taskId}${MARKER_SEP}${fieldId}`;
export function parsePlannerMarkerId(id: string): { taskId: string; fieldId: string } | null {
  const i = id.indexOf(MARKER_SEP);
  return i === -1 ? null : { taskId: id.slice(0, i), fieldId: id.slice(i + MARKER_SEP.length) };
}

export function plannerMarkers(tasks: Task[], fieldsByList: Map<string, CustomFieldDef[]>): Task[] {
  const out: Task[] = [];
  for (const task of tasks) {
    const fields = fieldsByList.get(task.listId);
    if (!fields) continue;
    const values = fieldValues(task);
    for (const field of fields) {
      const date = customDateValue(values[field.id]);
      if (!date) continue;
      const iso = date.toISOString() as unknown as Task['startDate'];
      out.push({ ...task, id: plannerMarkerId(task.id, field.id), title: `${task.title} · ${field.name}`, startDate: iso, dueDate: iso, calendarLane: null });
    }
  }
  return out;
}

// The date My Assigned Tasks sorts a task by and shows: the next one coming among its due date and the
// date fields counted there — or, when all of them have passed, the latest. A task with only a due
// date gets exactly that, as before.
export type MyTasksDate = { date: Date; label: string | null; kind: 'deadline' | 'event' };
export function myTasksDate(task: Pick<Task, 'dueDate' | 'customFieldValues'>, fields: CustomFieldDef[] | undefined, now = new Date()): MyTasksDate | null {
  const candidates: MyTasksDate[] = [];
  if (task.dueDate) {
    const d = new Date(task.dueDate as unknown as string);
    if (!isNaN(d.getTime())) candidates.push({ date: d, label: null, kind: 'deadline' });
  }
  if (fields?.length) {
    const values = fieldValues(task);
    for (const f of fields) {
      const d = customDateValue(values[f.id]);
      if (d) candidates.push({ date: d, label: f.name, kind: f.dateKind === 'event' ? 'event' : 'deadline' });
    }
  }
  if (candidates.length === 0) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const upcoming = candidates.filter((c) => dayOf(c.date) >= today).sort((a, b) => a.date.getTime() - b.date.getTime());
  if (upcoming.length) return upcoming[0];
  return candidates.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
}

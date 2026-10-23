import type { HierarchySpace, HierarchyWorkspace, StatusDef } from '../store/useTaskStore';

// Which statuses a List's tasks use: the List's own when it has chosen custom ones, else its Space's.
// Every place that needs "this task's statuses" goes through here, so a List with its own set is never
// shown, sorted, celebrated or bulk-edited with its Space's by mistake.
//
// Returns the store's own arrays (or undefined when neither has any — callers fall back to the built-in
// defaults), so a zustand selector built on it only changes when those statuses do.
export function statusesOfList(workspaces: HierarchyWorkspace[], listId: string): StatusDef[] | undefined {
  for (const ws of workspaces) {
    for (const space of ws.spaces) {
      const list = space.lists.find((l) => l.id === listId);
      if (!list) continue;
      if (list.statuses?.length) return list.statuses;
      return space.statuses?.length ? space.statuses : undefined;
    }
  }
  return undefined;
}

export function spaceOfListId(workspaces: HierarchyWorkspace[], listId: string): HierarchySpace | undefined {
  for (const ws of workspaces) for (const space of ws.spaces) if (space.lists.some((l) => l.id === listId)) return space;
  return undefined;
}

// Sorted, with the built-in fallback — for menus.
export function sortedStatusesOfList(workspaces: HierarchyWorkspace[], listId: string, fallback: StatusDef[]): StatusDef[] {
  const own = statusesOfList(workspaces, listId);
  return own ? [...own].sort((a, b) => a.order - b.order) : fallback;
}

// What tapping a task's circle does, and whether done tasks are struck through, for a List's tasks:
// the List's own choice (its "Edit statuses" window), else its Space's.
export function circleSettingsOfList(workspaces: HierarchyWorkspace[], listId: string): { circle: 'menu' | 'close'; strikeDone: boolean } {
  for (const ws of workspaces) {
    for (const space of ws.spaces) {
      const list = space.lists.find((l) => l.id === listId);
      if (!list) continue;
      const mode = list.checkMode ?? space.checkMode;
      return { circle: mode === 'close' ? 'close' : 'menu', strikeDone: list.strikeDone ?? !!space.strikeDone };
    }
  }
  return { circle: 'menu', strikeDone: false };
}

// Which statuses a task uses: a subtask goes by the nearest task above it that has a set of its own
// for its subtasks (Status.taskId — "Ha forskjellige status fra liste og inne i subtasks",
// 2026-10-23), else by its List's (statusesOfList). A task's own set is for its subtasks only: the
// task itself still uses its List's.
//
// Like statusesOfList, it returns arrays the store already holds, so a selector built on it only
// changes when those statuses do. The tasks are looked up through an index built once per tasks
// array, because rows ask this on every store change.
type TaskLike = { id: string; listId: string; parentId: string | null; subtaskStatuses?: StatusDef[] };
const taskIndexes = new WeakMap<readonly TaskLike[], Map<string, TaskLike>>();
function taskIndex(tasks: readonly TaskLike[]): Map<string, TaskLike> {
  let index = taskIndexes.get(tasks);
  if (!index) {
    index = new Map(tasks.map((t) => [t.id, t]));
    taskIndexes.set(tasks, index);
  }
  return index;
}

// The task whose own set a task uses, if any.
export function statusOwnerOf(tasks: readonly TaskLike[], task: Pick<TaskLike, 'parentId'>): TaskLike | undefined {
  const index = taskIndex(tasks);
  let parentId = task.parentId;
  for (let guard = 0; parentId && guard < 30; guard++) {
    const parent = index.get(parentId);
    if (!parent) return undefined;
    if (parent.subtaskStatuses?.length) return parent;
    parentId = parent.parentId;
  }
  return undefined;
}

export function statusesOfTask(
  workspaces: HierarchyWorkspace[],
  tasks: readonly TaskLike[],
  task: Pick<TaskLike, 'listId' | 'parentId'>
): StatusDef[] | undefined {
  return statusOwnerOf(tasks, task)?.subtaskStatuses ?? statusesOfList(workspaces, task.listId);
}

export function sortedStatusesOfTask(
  workspaces: HierarchyWorkspace[],
  tasks: readonly TaskLike[],
  task: Pick<TaskLike, 'listId' | 'parentId'>,
  fallback: StatusDef[]
): StatusDef[] {
  const own = statusesOfTask(workspaces, tasks, task);
  return own ? [...own].sort((a, b) => a.order - b.order) : fallback;
}

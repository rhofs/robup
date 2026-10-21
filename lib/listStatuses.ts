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

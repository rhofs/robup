import type { Event, HierarchySpace, HierarchyWorkspace, Task } from '../store/useTaskStore';

// Where a task or an event belongs, said the same way everywhere — the event and task windows, the
// Planner's bars and their tooltips. "Vi må ha et system som gjør at vi vet hvilket workspace eller om
// det er privat": a thing in the Personal workspace is private (only you see it); a private task in a
// shared workspace is also marked, by its own lock.

export type Home = {
  workspace: HierarchyWorkspace | undefined;
  space: HierarchySpace | undefined;
  listName?: string;
  // Only you can see it: it lives in your Personal workspace.
  personal: boolean;
};

export function homeOfEvent(workspaces: HierarchyWorkspace[], event: Pick<Event, 'workspaceId' | 'spaceId'>): Home {
  const workspace = workspaces.find((w) => w.id === event.workspaceId);
  const space = event.spaceId ? workspace?.spaces.find((s) => s.id === event.spaceId) : undefined;
  return { workspace, space, personal: !!workspace?.isPersonal };
}

export function homeOfTask(workspaces: HierarchyWorkspace[], task: Pick<Task, 'listId'>): Home {
  for (const workspace of workspaces) {
    for (const space of workspace.spaces) {
      const list = space.lists.find((l) => l.id === task.listId);
      if (list) return { workspace, space, listName: list.name, personal: !!workspace.isPersonal };
    }
  }
  return { workspace: undefined, space: undefined, personal: false };
}

export const workspaceLabel = (ws: HierarchyWorkspace | undefined) => (!ws ? 'Unknown workspace' : ws.isPersonal ? 'Private' : ws.name);

// "New Game Media › Bleep Show", or "Private › …" — for tooltips and the one-line chips.
export function homeLabel(home: Home): string {
  return [workspaceLabel(home.workspace), home.space?.name, home.listName].filter(Boolean).join(' › ');
}

// A workspace's own colour, or one picked from its id so two uncoloured workspaces still differ.
const FALLBACK_COLORS = ['#618cd1', '#cb6798', '#31a0b3', '#c89642', '#9a61d1', '#349f7c', '#e0803a', '#cd6565'];
export function workspaceColor(ws: HierarchyWorkspace | undefined): string {
  if (!ws) return '#6b7280';
  if (ws.color) return ws.color;
  let h = 0;
  for (const ch of ws.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

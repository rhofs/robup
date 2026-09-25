import type { Event, Task } from '../store/useTaskStore';

// Who the assignee picker suggests: the people most often put on things in the same place.
//
// "The same place" is the List for a task — a List is usually one kind of work done by the same few
// people ("Planlagt" is the editors, "Timeplan" is whoever runs the schedule), which is exactly what
// a suggestion should know. For an event it is the workspace, since events do not live in Lists.
//
// Only the most recent RECENT_WINDOW items count, so the suggestions follow the team as it changes
// instead of being pinned forever by whoever did the work two years ago. Computed from what the
// store already holds — no request, and nothing new to keep in sync.
const RECENT_WINDOW = 150;
const MAX_SUGGESTIONS = 3;

function rank(itemsNewestFirst: { assignees: { id: string }[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const item of itemsNewestFirst.slice(0, RECENT_WINDOW)) {
    for (const a of item.assignees) counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUGGESTIONS + 1) // +1: the picker drops you from here, since "Me" is always first
    .map(([id]) => id);
}

const newestFirst = (a: { createdAt: string | Date }, b: { createdAt: string | Date }) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export function suggestTaskAssignees(tasks: Task[], listId: string, excludeTaskId?: string): string[] {
  return rank(tasks.filter((t) => t.listId === listId && t.id !== excludeTaskId && !t.deletedAt).sort(newestFirst));
}

export function suggestEventAttendees(events: Event[], workspaceId: string | null, excludeEventId?: string): string[] {
  if (!workspaceId) return [];
  return rank(events.filter((e) => e.workspaceId === workspaceId && e.id !== excludeEventId && !e.deletedAt).sort(newestFirst));
}

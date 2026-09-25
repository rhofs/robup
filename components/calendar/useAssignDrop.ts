'use client';

import { useTaskStore, type Event, type Task } from '../../store/useTaskStore';
import { usePersonDrop } from '../../lib/personDrag';
import { taskAudience, workspaceIdForList } from '../../lib/workspaceMembers';

// The Planner's drop targets for "drag a face onto a bar to assign" (see lib/personDrag.ts).
// A person is accepted only if they are a member of the bar's own workspace — the Planner can show
// several workspaces at once, and the team strip is one of them — can open the task if it is
// private, and are not on it already. The same rule the pickers and the server apply; this just
// says "no" during the hover instead of after.

export function useTaskAssignDrop(task: Task) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const setAssignees = useTaskStore((s) => s.optimisticSetAssignees);
  const ws = workspaces.find((w) => w.id === workspaceIdForList(workspaces, task.listId));
  return usePersonDrop(
    // Worked out during the hover, only when a face is actually over this bar — not on every render
    // of every bar in the month.
    (uid) => {
      if (!ws?.members.some((m) => m.id === uid) || task.assignees.some((a) => a.id === uid)) return false;
      const audience = taskAudience(workspaces, task);
      return !audience || audience.has(uid);
    },
    (uid) => setAssignees(task.id, [...task.assignees.map((a) => a.id), uid])
  );
}

export function useEventAssignDrop(event: Event) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const setAssignees = useTaskStore((s) => s.optimisticSetEventAssignees);
  const ws = workspaces.find((w) => w.id === event.workspaceId);
  return usePersonDrop(
    (uid) => !!ws?.members.some((m) => m.id === uid) && !event.assignees.some((a) => a.id === uid),
    (uid) => setAssignees(event.id, [...event.assignees.map((a) => a.id), uid])
  );
}

// The look of a bar while a face is held over it, and for a moment after the drop. Classes live in
// app/globals.css (.siqt-assign-*).
export const assignDropClass = (isOver: boolean, justAssigned: boolean) =>
  `${isOver ? 'siqt-assign-over' : ''} ${justAssigned ? 'siqt-assign-pop' : ''}`;

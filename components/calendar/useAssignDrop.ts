'use client';

import { useTaskStore, type Event, type Task } from '../../store/useTaskStore';
import { usePersonDrop } from '../../lib/personDrag';
import { taskAudience, workspaceIdForList } from '../../lib/workspaceMembers';

// The Planner's drop targets for "drag a face onto a bar to assign" (see lib/personDrag.ts).
// A person is accepted only if they are a member of the bar's own workspace — the Planner can show
// several workspaces at once, and the team strip is one of them — can open the task if it is
// private, and are not on it already. The same rule the pickers and the server apply; this just
// says "no" during the hover instead of after.

// Each hook's first argument says why a person cannot be put on the bar, in words for the toast — or
// null if they can. A person's first name, for those messages.
function memberName(users: { id: string; name: string }[], uid: string) {
  return users.find((u) => u.id === uid)?.name.split(' ')[0] ?? 'They';
}

export function useTaskAssignDrop(task: Task) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const users = useTaskStore((s) => s.users);
  const setAssignees = useTaskStore((s) => s.optimisticSetAssignees);
  const ws = workspaces.find((w) => w.id === workspaceIdForList(workspaces, task.listId));
  return usePersonDrop(
    // Worked out during the hover, only when a face is actually over this bar — not on every render
    // of every bar in the month.
    (uid) => {
      const name = memberName(users, uid);
      if (task.assignees.some((a) => a.id === uid)) return `${name} is already on “${task.title}”.`;
      if (!ws?.members.some((m) => m.id === uid)) return `${name} isn't in ${ws ? `the ${ws.name} workspace` : "this task's workspace"}, so can't be put on “${task.title}”.`;
      const audience = taskAudience(workspaces, task);
      if (audience && !audience.has(uid)) return `“${task.title}” is private, and ${name} doesn't have access to it.`;
      return null;
    },
    (uid) => setAssignees(task.id, [...task.assignees.map((a) => a.id), uid])
  );
}

export function useEventAssignDrop(event: Event) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const users = useTaskStore((s) => s.users);
  const setAssignees = useTaskStore((s) => s.optimisticSetEventAssignees);
  const ws = workspaces.find((w) => w.id === event.workspaceId);
  return usePersonDrop(
    (uid) => {
      const name = memberName(users, uid);
      if (event.assignees.some((a) => a.id === uid)) return `${name} is already on “${event.title}”.`;
      if (!ws?.members.some((m) => m.id === uid)) return `${name} isn't in ${ws ? `the ${ws.name} workspace` : "this event's workspace"}, so can't be put on “${event.title}”.`;
      return null;
    },
    (uid) => setAssignees(event.id, [...event.assignees.map((a) => a.id), uid])
  );
}

// The look of a bar while a face is held over it, and for a moment after the drop. Classes live in
// app/globals.css (.siqt-assign-*).
export const assignDropClass = (isOver: boolean, justAssigned: boolean, refused = false) =>
  `${isOver ? (refused ? 'siqt-assign-no' : 'siqt-assign-over') : ''} ${justAssigned ? 'siqt-assign-pop' : ''}`;

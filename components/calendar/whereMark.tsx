'use client';

import { Lock } from 'lucide-react';
import { useTaskStore, type Event, type Task } from '../../store/useTaskStore';
import { homeLabel, homeOfEvent, homeOfTask, workspaceColor } from '../../lib/whereIs';

// Where a Planner bar belongs, at a glance and on hover — the Planner shows every workspace at once,
// and nothing on a bar said which one a thing was in, or that it was private ("Vi må ha et system som
// gjør at vi vet hvilket workspace eller om det er privat").
//
//   - private (your Personal workspace): a small lock in front of the title;
//   - in a shared workspace: a dot in that workspace's colour — only when you are in more than one
//     shared workspace, since otherwise there is nothing to tell apart;
//   - always: "Title — Workspace › Space" as the bar's tooltip.
export function useWhere(item: { task: Task } | { event: Event }) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const home = 'task' in item ? homeOfTask(workspaces, item.task) : homeOfEvent(workspaces, item.event);
  const title = 'task' in item ? item.task.title : item.event.title;
  const sharedCount = workspaces.filter((w) => !w.isPersonal).length;
  const mark = home.personal ? (
    <Lock className="w-2.5 h-2.5 shrink-0" aria-label="Private" />
  ) : home.workspace && sharedCount > 1 ? (
    <span className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-black/20" style={{ backgroundColor: workspaceColor(home.workspace) }} />
  ) : null;
  const tooltip = home.workspace ? `${title} — ${homeLabel(home)}${home.personal ? ' (only you)' : ''}` : title;
  return { home, mark, tooltip };
}

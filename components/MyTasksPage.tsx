'use client';

import { useMemo } from 'react';
import { HierarchyWorkspace, AppUser, Task, StatusDef } from '../store/useTaskStore';

// "Assigned to me, in this workspace" — the sidebar Me zone's "My assigned tasks" entry. Narrowed
// (this session) from an earlier version that spanned every workspace the person belonged to —
// now scoped to whichever workspace is currently active, matching exactly what was asked. A
// direct port of OfficePage.tsx's myTasks/listSpaceById pattern, minus the "pick any team member"
// wrapper (this always means the current session identity).
type MyTasksPageProps = {
  currentUser: AppUser | null;
  currentWorkspace: HierarchyWorkspace | undefined;
  tasks: Task[];
  statuses: StatusDef[];
  onOpenTask: (taskId: string) => void;
};

export default function MyTasksPage({ currentUser, currentWorkspace, tasks, statuses, onOpenTask }: MyTasksPageProps) {
  const listLocationById = useMemo(() => {
    const map = new Map<string, { spaceName: string; listName: string }>();
    if (!currentWorkspace) return map;
    for (const space of currentWorkspace.spaces) {
      for (const list of space.lists) {
        map.set(list.id, { spaceName: space.name, listName: list.name });
      }
    }
    return map;
  }, [currentWorkspace]);

  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Sign in to see your tasks.
      </div>
    );
  }

  const myTasks = tasks
    .filter((t) => !t.archived && t.assignees.some((a) => a.id === currentUser.id) && listLocationById.has(t.listId))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-sm font-semibold text-white">My Assigned Tasks</h2>
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
          In {currentWorkspace?.name ?? 'this workspace'} ({myTasks.length})
        </h3>
        {myTasks.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
            No assigned tasks.
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
            {myTasks.map((t) => {
              const loc = listLocationById.get(t.listId);
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-neutral-800/30 transition cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-200 truncate">{t.title}</div>
                    {loc && (
                      <div className="text-[10px] text-neutral-500 truncate">
                        {loc.spaceName} / {loc.listName}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded border shrink-0"
                    style={{ color: statusColorOf(t.status), borderColor: statusColorOf(t.status) + '55', backgroundColor: statusColorOf(t.status) + '20' }}
                  >
                    {t.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

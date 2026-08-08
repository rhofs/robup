'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { AppUser, Task, StatusDef } from '../store/useTaskStore';

type PersonalTasksPageProps = {
  currentUser: AppUser | null;
  tasks: Task[];
  statuses: StatusDef[];
  ensurePersonalWorkspace: (userId: string) => Promise<{ workspaceId: string; spaceId: string; listId: string }>;
  onCreateTask: (title: string, listId: string, spaceId: string) => Promise<void>;
  onOpenTask: (taskId: string) => void;
};

// The private personal quick-list — "My tasks" in the new sidebar zone, only ever visible to the
// current identity (its Space/List live inside that person's own single-member "personal"
// workspace, resolved lazily here rather than at app startup). Deliberately bypasses
// CreateTaskModal.tsx entirely (it always requires an explicit Space+List picker with no prop to
// hide them) — a personal task is still a completely normal Task row under the hood, just created
// with a fixed listId, so clicking one opens the same universal task modal with every existing
// capability (comments, docs, status, dates) working for free.
export default function PersonalTasksPage({ currentUser, tasks, statuses, ensurePersonalWorkspace, onCreateTask, onOpenTask }: PersonalTasksPageProps) {
  const [target, setTarget] = useState<{ workspaceId: string; spaceId: string; listId: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    ensurePersonalWorkspace(currentUser.id).then((result) => {
      if (!cancelled) setTarget(result);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, ensurePersonalWorkspace]);

  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Pick "You are: ..." in the sidebar to see your tasks.
      </div>
    );
  }

  const myPersonalTasks = target ? tasks.filter((t) => t.listId === target.listId && !t.archived) : [];

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !target || creating) return;
    setCreating(true);
    setDraft('');
    await onCreateTask(trimmed, target.listId, target.spaceId);
    setCreating(false);
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-sm font-semibold text-white">My Tasks</h2>
      <p className="text-[10px] text-neutral-500">Private — only you ever see this, across every workspace.</p>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          disabled={!target}
          placeholder="Add a personal task..."
          className="flex-1 bg-neutral-900/60 border border-neutral-800/80 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          onClick={commit}
          disabled={!target || !draft.trim()}
          className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white p-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {myPersonalTasks.length === 0 ? (
        <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
          Nothing here yet.
        </div>
      ) : (
        <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
          {myPersonalTasks.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-neutral-800/30 transition cursor-pointer"
            >
              <div className="text-xs text-neutral-200 truncate">{t.title}</div>
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded border shrink-0"
                style={{ color: statusColorOf(t.status), borderColor: statusColorOf(t.status) + '55', backgroundColor: statusColorOf(t.status) + '20' }}
              >
                {t.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

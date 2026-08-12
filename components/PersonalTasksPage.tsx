'use client';

import { useEffect, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { AppUser, Task, StatusDef } from '../store/useTaskStore';

type PersonalTasksPageProps = {
  currentUser: AppUser | null;
  tasks: Task[];
  statuses: StatusDef[];
  ensurePersonalWorkspace: (userId: string) => Promise<{ workspaceId: string; spaceId: string; listId: string }>;
  onCreateTask: (title: string, listId: string, spaceId: string) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  // Reuses the board's own drag-between-status-columns action — this app has no separate
  // "done" boolean, so checking a task off sets its status to the list's own last status
  // (typically "Done"), unchecking sets it back to the first one. Per explicit user confirmation:
  // reuse the existing status field rather than adding a new one.
  onSetStatus: (taskId: string, status: string) => void;
};

// The private personal quick-list — "My tasks" in the new sidebar zone, only ever visible to the
// current identity (its Space/List live inside that person's own single-member "personal"
// workspace, resolved lazily here rather than at app startup). Deliberately bypasses
// CreateTaskModal.tsx entirely (it always requires an explicit Space+List picker with no prop to
// hide them) — a personal task is still a completely normal Task row under the hood, just created
// with a fixed listId, so clicking one opens the same universal task modal with every existing
// capability (comments, docs, status, dates) working for free.
export default function PersonalTasksPage({ currentUser, tasks, statuses, ensurePersonalWorkspace, onCreateTask, onOpenTask, onSetStatus }: PersonalTasksPageProps) {
  const [target, setTarget] = useState<{ workspaceId: string; spaceId: string; listId: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  // Done tasks stay in the underlying list (still a normal Task row, findable everywhere else in
  // the app) — just hidden from this quick-list by default, like a to-do app, with a toggle to
  // bring them back rather than losing them from view entirely.
  const [showDone, setShowDone] = useState(false);

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
  // "Done" is the last status in this list's own ordered set (typically named "Done," but not
  // assumed by name — a Space can rename/reorder its statuses freely), "not done" is the first.
  const orderedStatuses = [...statuses].sort((a, b) => a.order - b.order);
  const doneStatus = orderedStatuses[orderedStatuses.length - 1]?.name;
  const notDoneStatus = orderedStatuses[0]?.name;

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Sign in to see your tasks.
      </div>
    );
  }

  const allPersonalTasks = target ? tasks.filter((t) => t.listId === target.listId && !t.archived) : [];
  const doneCount = doneStatus !== undefined ? allPersonalTasks.filter((t) => t.status === doneStatus).length : 0;
  const myPersonalTasks = showDone ? allPersonalTasks : allPersonalTasks.filter((t) => t.status !== doneStatus);

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
          {doneCount > 0 && !showDone ? 'All done — nice work.' : 'Nothing here yet.'}
        </div>
      ) : (
        <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
          {myPersonalTasks.map((t) => {
            const isDone = doneStatus !== undefined && t.status === doneStatus;
            return (
              <div key={t.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/30 transition group">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!doneStatus || !notDoneStatus) return;
                    onSetStatus(t.id, isDone ? notDoneStatus : doneStatus);
                  }}
                  title={isDone ? 'Mark not done' : 'Mark done'}
                  className={`shrink-0 w-3.5 h-3.5 rounded-xs border flex items-center justify-center cursor-pointer transition ${
                    isDone ? 'bg-blue-500/20 border-blue-500/60 text-blue-400' : 'border-neutral-600'
                  }`}
                >
                  {isDone && <Check className="w-2.5 h-2.5" />}
                </button>
                <button
                  onClick={() => onOpenTask(t.id)}
                  className="flex-1 min-w-0 text-left flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className={`text-xs truncate ${isDone ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{t.title}</div>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded border shrink-0"
                    style={{ color: statusColorOf(t.status), borderColor: statusColorOf(t.status) + '55', backgroundColor: statusColorOf(t.status) + '20' }}
                  >
                    {t.status}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {doneCount > 0 && (
        <button
          onClick={() => setShowDone((v) => !v)}
          className="text-[10px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
        >
          {showDone ? 'Hide completed' : `Show completed (${doneCount})`}
        </button>
      )}
    </div>
  );
}

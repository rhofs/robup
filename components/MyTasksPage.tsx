'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Check } from 'lucide-react';
import { HierarchyWorkspace, AppUser, Task, StatusDef } from '../store/useTaskStore';
import { isDoneStatus } from '../lib/taskDoneDust';

// "Assigned to me, in this workspace" — the sidebar Me zone's "My assigned tasks" entry, scoped to the
// active workspace.
//
// What is finished stays out of it: a task that is archived, or in a Done or Closed status ("tasks
// som er closed eller finished … ikke vises, for da er noe ferdig"). They are one tap away under
// "Show finished", not gone.
//
// Each row carries its whole path — Space › Folders › List › parent tasks — because a subtask is
// usually a step like "Thumbnail" that means nothing without the episode it belongs to ("så må du da
// kunne se hele pathen. Så man vet hvilken episode … ikke bare thumbnail"). It used to show only
// "Space / List".
type MyTasksPageProps = {
  currentUser: AppUser | null;
  currentWorkspace: HierarchyWorkspace | undefined;
  tasks: Task[];
  // The statuses a Space without its own shows (page.tsx's DEFAULT_STATUSES).
  fallbackStatuses: StatusDef[];
  onOpenTask: (taskId: string) => void;
};

type SortKey = 'due' | 'start' | 'assigned' | 'created';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'due', label: 'Due date' },
  { key: 'start', label: 'Start date' },
  { key: 'assigned', label: 'Recently assigned' },
  { key: 'created', label: 'Newest' },
];
const SORT_KEY = 'siqt.myTasksSort';
const SHOW_DONE_KEY = 'siqt.myTasksShowDone';

const readLocal = (key: string) => {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeLocal = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);
const shortDate = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function MyTasksPage({ currentUser, currentWorkspace, tasks, fallbackStatuses, onOpenTask }: MyTasksPageProps) {
  const [sort, setSort] = useState<SortKey>(() => (readLocal(SORT_KEY) as SortKey) || 'due');
  const [showDone, setShowDone] = useState(() => readLocal(SHOW_DONE_KEY) === '1');
  const [assignedAt, setAssignedAt] = useState<Record<string, string>>({});

  // Only needed for the "Recently assigned" order — fetched once the page is open.
  useEffect(() => {
    let alive = true;
    fetch('/api/me/assigned-at')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => alive && setAssignedAt(d ?? {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Where each List is: its Space, the Folder chain above it, and the Space's statuses.
  const listInfo = useMemo(() => {
    const map = new Map<string, { path: string[]; statuses: StatusDef[] }>();
    if (!currentWorkspace) return map;
    for (const space of currentWorkspace.spaces) {
      const spaceStatuses = space.statuses?.length ? space.statuses : fallbackStatuses;
      for (const list of space.lists) {
        // The List's own statuses when it has them (lib/listStatuses.ts), else the Space's.
        const statuses = list.statuses?.length ? list.statuses : spaceStatuses;
        const folders: string[] = [];
        let folderId = list.folderId;
        for (let guard = 0; folderId && guard < 20; guard++) {
          const folder = space.folders.find((f) => f.id === folderId);
          if (!folder) break;
          folders.unshift(folder.name);
          folderId = folder.parentId;
        }
        map.set(list.id, { path: [space.name, ...folders, list.name], statuses });
      }
    }
    return map;
  }, [currentWorkspace, fallbackStatuses]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const pathOf = (t: Task) => {
    const parents: string[] = [];
    let parentId = t.parentId;
    for (let guard = 0; parentId && guard < 20; guard++) {
      const parent = taskById.get(parentId);
      if (!parent) break;
      parents.unshift(parent.title);
      parentId = parent.parentId;
    }
    return [...(listInfo.get(t.listId)?.path ?? []), ...parents];
  };

  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Sign in to see your tasks.
      </div>
    );
  }

  const isFinished = (t: Task) => t.archived || isDoneStatus(t.status, listInfo.get(t.listId)?.statuses ?? fallbackStatuses);
  const mine = tasks.filter((t) => !t.deletedAt && t.assignees.some((a) => a.id === currentUser.id) && listInfo.has(t.listId));
  const finishedCount = mine.filter(isFinished).length;
  const shown = (showDone ? mine : mine.filter((t) => !isFinished(t))).slice();

  // Undated last, whichever way.
  const byAsc = (a: number, b: number) => (isNaN(a) ? 1 : 0) - (isNaN(b) ? 1 : 0) || (isNaN(a) || isNaN(b) ? 0 : a - b);
  const byDesc = (a: number, b: number) => (isNaN(a) ? 1 : 0) - (isNaN(b) ? 1 : 0) || (isNaN(a) || isNaN(b) ? 0 : b - a);
  shown.sort((a, b) => {
    if (sort === 'due') return byAsc(time(a.dueDate), time(b.dueDate));
    if (sort === 'start') return byAsc(time(a.startDate), time(b.startDate));
    if (sort === 'assigned') return byDesc(time(assignedAt[a.id] ?? a.createdAt), time(assignedAt[b.id] ?? b.createdAt));
    return byDesc(time(a.createdAt), time(b.createdAt));
  });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-app-strong">My Assigned Tasks</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <ArrowDownUp className="w-3.5 h-3.5" />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                writeLocal(SORT_KEY, e.target.value);
              }}
              className="bg-neutral-900 border border-neutral-700 rounded-md px-1.5 py-1 text-[11px] text-app-strong focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {finishedCount > 0 && (
            <button
              onClick={() => {
                setShowDone((v) => !v);
                writeLocal(SHOW_DONE_KEY, showDone ? '0' : '1');
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] cursor-pointer ${
                showDone ? 'border-blue-500/50 text-blue-400 bg-blue-500/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Check className="w-3.5 h-3.5" /> Show finished ({finishedCount})
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
          In {currentWorkspace?.name ?? 'this workspace'} ({shown.length})
        </h3>
        {shown.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
            {finishedCount > 0 && !showDone ? 'Nothing left to do — everything assigned to you is finished.' : 'No assigned tasks.'}
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
            {shown.map((t) => {
              const statuses = listInfo.get(t.listId)?.statuses ?? fallbackStatuses;
              const color = statuses.find((s) => s.name === t.status)?.color || '#94a3b8';
              const finished = isFinished(t);
              const date = sort === 'start' ? t.startDate : t.dueDate;
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-neutral-800/30 transition cursor-pointer ${finished ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <div className={`text-xs text-neutral-200 truncate ${finished ? 'line-through' : ''}`}>{t.title}</div>
                    <div className="text-[10px] text-neutral-500 break-words">{pathOf(t).join(' › ')}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {date && <span className="text-[10px] text-neutral-500">{shortDate(date)}</span>}
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded border"
                      style={{ color, borderColor: color + '55', backgroundColor: color + '20' }}
                    >
                      {t.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

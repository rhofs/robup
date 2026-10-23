'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Check } from 'lucide-react';
import { HierarchyWorkspace, AppUser, Task, StatusDef } from '../store/useTaskStore';
import { isDoneStatus } from '../lib/taskDoneDust';
import { circleSettingsOfList, statusesOfList, statusesOfTask } from '../lib/listStatuses';
import { dueDateColor } from '../lib/dateBadgeColor';
import { dateFieldsByList, myTasksDate } from '../lib/taskDates';
import { useIsMobile } from '../hooks/useIsMobile';
import StatusCircle from './StatusCircle';

// "Assigned to me, in this workspace" — the sidebar Me zone's "My assigned tasks" entry, scoped to the
// active workspace.
//
// One card per top-level task, with what is yours in it as a checklist (option 2 of the sketches in
// public/ideas/my-assigned.html, picked 2026-10-14: "Jeg liker 2"). It used to be a flat list, where a
// task and two of its subtasks read as three unrelated tasks ("Så det ikke ser ut som 3 separate tasks,
// når det er 1 task med 2 subtasks du har fått tildelt"):
//
//   - the card's head is the top-level task — yours (circle, status, date) or, when only subtasks
//     are, muted context showing who owns it;
//   - your tasks under it keep the List's own order — "det er et system" — not the sort order;
//   - the other subtasks are one tap away ("+ N other subtasks"), muted;
//   - progress counts the head's direct subtasks.
//
// What is finished stays out (archived, or in a Done or Closed status), behind "Show finished".
type MyTasksPageProps = {
  currentUser: AppUser | null;
  workspaces: HierarchyWorkspace[];
  // Where it opens: the real workspace in use (page.tsx's realSheetWorkspace) — not the personal one,
  // which "My Tasks" makes active and where everything is yours by definition. The header switches.
  defaultWorkspaceId: string | null;
  tasks: Task[];
  // The statuses a Space without its own shows (page.tsx's DEFAULT_STATUSES).
  fallbackStatuses: StatusDef[];
  onOpenTask: (taskId: string) => void;
};

type SortKey = 'all' | 'due' | 'start' | 'assigned' | 'created';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'due', label: 'Due date' },
  { key: 'start', label: 'Start date' },
  { key: 'assigned', label: 'Recently assigned' },
  { key: 'created', label: 'Newest' },
];
// A new key with "All dates" (2026-10-21): it is meant to be where everyone starts, and the old key
// held "Due date" for anyone who had ever picked an order.
const SORT_KEY = 'siqt.myTasksSort.v2';
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
const byOrder = (a: Task, b: Task) => (a.order ?? 0) - (b.order ?? 0) || time(a.createdAt) - time(b.createdAt);

type Card = {
  head: Task;
  headMine: boolean;
  // Yours under the head, in the List's own (tree) order, each with the path between it and the head.
  rows: { task: Task; via: string[] }[];
  // The head's direct subtasks, for progress.
  children: Task[];
  // Subtasks in the card that are not yours (any depth), for "+ N other subtasks".
  others: { task: Task; via: string[] }[];
  // The card's place in the chosen sort.
  sortValue: number;
};

export default function MyTasksPage({ currentUser, workspaces: allWorkspaces, defaultWorkspaceId, tasks, fallbackStatuses, onOpenTask }: MyTasksPageProps) {
  const isMobile = useIsMobile();
  // Picked in the header for this visit; otherwise the default.
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | null>(null);
  const currentWorkspace =
    allWorkspaces.find((w) => w.id === (pickedWorkspaceId ?? defaultWorkspaceId)) ?? allWorkspaces.find((w) => !w.isPersonal) ?? allWorkspaces[0];
  const [sort, setSort] = useState<SortKey>(() => {
    const stored = readLocal(SORT_KEY) as SortKey | null;
    return stored && SORTS.some((s) => s.key === stored) ? stored : 'all';
  });
  const [showDone, setShowDone] = useState(() => readLocal(SHOW_DONE_KEY) === '1');
  const [assignedAt, setAssignedAt] = useState<Record<string, string>>({});
  // Cards whose other subtasks are folded out.
  const [openOthers, setOpenOthers] = useState<Set<string>>(() => new Set());

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

  const workspaces = useMemo(() => (currentWorkspace ? [currentWorkspace] : []), [currentWorkspace]);

  // Where each List is: its Space, the Folder chain above it, the statuses its tasks use, and what its
  // Space's task circle does.
  const listInfo = useMemo(() => {
    const map = new Map<string, { path: string[]; statuses: StatusDef[]; circle: 'menu' | 'close' }>();
    if (!currentWorkspace) return map;
    for (const space of currentWorkspace.spaces) {
      for (const list of space.lists) {
        const folders: string[] = [];
        let folderId = list.folderId;
        for (let guard = 0; folderId && guard < 20; guard++) {
          const folder = space.folders.find((f) => f.id === folderId);
          if (!folder) break;
          folders.unshift(folder.name);
          folderId = folder.parentId;
        }
        map.set(list.id, {
          path: [space.name, ...folders, list.name],
          statuses: statusesOfList(workspaces, list.id) ?? fallbackStatuses,
          circle: circleSettingsOfList(workspaces, list.id).circle,
        });
      }
    }
    return map;
  }, [currentWorkspace, workspaces, fallbackStatuses]);

  // Date fields switched on for My Assigned Tasks ("Edit field"), per List: with the "All dates" order a
  // task goes by the next of its start, due and these dates (lib/taskDates.ts myTasksDate), and shows
  // which it is. "Due date" and "Start date" are those dates alone.
  const myDateFields = useMemo(() => dateFieldsByList(workspaces, 'showInMyTasks'), [workspaces]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.parentId || t.deletedAt) continue;
      const arr = m.get(t.parentId);
      if (arr) arr.push(t);
      else m.set(t.parentId, [t]);
    }
    for (const arr of m.values()) arr.sort(byOrder);
    return m;
  }, [tasks]);

  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Sign in to see your tasks.
      </div>
    );
  }

  // Its own List's, or — for a subtask — those of a task above it that has its own (statusesOfTask).
  const statusesFor = (t: Task) => (t.parentId ? statusesOfTask(workspaces, tasks, t) : undefined) ?? listInfo.get(t.listId)?.statuses ?? fallbackStatuses;
  const isFinished = (t: Task) => t.archived || isDoneStatus(t.status, statusesFor(t));
  const assignedToMe = (t: Task) => t.assignees.some((a) => a.id === currentUser.id);
  const mineAll = tasks.filter((t) => !t.deletedAt && assignedToMe(t) && listInfo.has(t.listId));
  const finishedCount = mineAll.filter(isFinished).length;
  const mine = new Set((showDone ? mineAll : mineAll.filter((t) => !isFinished(t))).map((t) => t.id));

  // The top-level task above one — as far up as this person can see (a private parent they cannot open
  // is not loaded, and then the highest one that is becomes the head).
  const headOf = (t: Task) => {
    let cur = t;
    for (let guard = 0; cur.parentId && guard < 20; guard++) {
      const parent = taskById.get(cur.parentId);
      if (!parent || parent.deletedAt) break;
      cur = parent;
    }
    return cur;
  };

  const sortKeyOf = (t: Task) =>
    sort === 'all'
      ? time(myTasksDate(t, myDateFields.get(t.listId))?.date)
      : sort === 'due'
      ? time(t.dueDate)
      : sort === 'start'
        ? time(t.startDate)
        : sort === 'assigned'
          ? -time(assignedAt[t.id] ?? t.createdAt)
          : -time(t.createdAt);

  // Build the cards: walk each head's tree once, in the List's own order.
  const cards = new Map<string, Card>();
  for (const id of mine) {
    const head = headOf(taskById.get(id)!);
    if (cards.has(head.id)) continue;
    const rows: Card['rows'] = [];
    const others: Card['others'] = [];
    const walk = (parent: Task, via: string[], depth: number) => {
      if (depth > 12) return;
      for (const child of childrenOf.get(parent.id) ?? []) {
        if (mine.has(child.id)) rows.push({ task: child, via });
        else if (showDone || !isFinished(child)) others.push({ task: child, via });
        walk(child, [...via, child.title], depth + 1);
      }
    };
    walk(head, [], 0);
    const counted = [...(mine.has(head.id) ? [head] : []), ...rows.map((r) => r.task)];
    // Undated last, whichever way: NaN sorts after any number below.
    const values = counted.map(sortKeyOf).filter((v) => !isNaN(v));
    cards.set(head.id, {
      head,
      headMine: mine.has(head.id),
      rows,
      children: childrenOf.get(head.id) ?? [],
      others,
      sortValue: values.length ? Math.min(...values) : NaN,
    });
  }
  const ordered = [...cards.values()].sort((a, b) => {
    const an = isNaN(a.sortValue);
    const bn = isNaN(b.sortValue);
    if (an !== bn) return an ? 1 : -1;
    return (an ? 0 : a.sortValue - b.sortValue) || byOrder(a.head, b.head);
  });

  const statusPill = (t: Task) => {
    const color = statusesFor(t).find((s) => s.name === t.status)?.color || '#94a3b8';
    return (
      <span
        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md shrink-0"
        style={{ color, backgroundColor: color + '22' }}
      >
        {t.status}
      </span>
    );
  };
  const dateOf = (t: Task) => {
    if (sort === 'start') {
      return t.startDate ? <span className="text-[11px] shrink-0 text-neutral-500">{shortDate(t.startDate)}</span> : null;
    }
    if (sort !== 'all') {
      if (!t.dueDate) return null;
      const late = !isFinished(t) && dueDateColor(t.dueDate) === 'red';
      return <span className={`text-[11px] shrink-0 ${late ? 'text-red-400' : 'text-neutral-500'}`}>{shortDate(t.dueDate)}</span>;
    }
    const next = myTasksDate(t, myDateFields.get(t.listId));
    if (!next) return null;
    // Late: a deadline (the due date, or a date field of that kind) that has passed. An event's date
    // having passed only means it happened.
    const late = !isFinished(t) && next.kind === 'deadline' && dueDateColor(next.date.toISOString()) === 'red';
    return (
      <span className={`text-[11px] shrink-0 ${late ? 'text-red-400' : 'text-neutral-500'}`}>
        {next.label && <span className="text-neutral-600">{next.label} · </span>}
        {shortDate(next.date)}
      </span>
    );
  };
  const circle = (t: Task) => (
    <StatusCircle task={t} statuses={statusesFor(t)} mode={listInfo.get(t.listId)?.circle ?? 'menu'} size={isMobile ? 'md' : 'sm'} />
  );

  const shownCount = mine.size;

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

      <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider">
        <span>In</span>
        {/* Which workspace — the real ones first, Private last. */}
        <select
          value={currentWorkspace?.id ?? ''}
          onChange={(e) => setPickedWorkspaceId(e.target.value)}
          className="bg-transparent border-b border-dashed border-neutral-600 text-xs font-bold uppercase tracking-wider text-neutral-300 focus:outline-none cursor-pointer"
        >
          {[...allWorkspaces]
            .sort((a, b) => Number(a.isPersonal) - Number(b.isPersonal))
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.isPersonal ? 'Private' : w.name}
              </option>
            ))}
        </select>
        <span>({shownCount})</span>
      </div>

      {ordered.length === 0 ? (
        <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
          {finishedCount > 0 && !showDone ? 'Nothing left to do — everything assigned to you is finished.' : 'No assigned tasks.'}
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((card) => {
            const { head, headMine, rows, children, others } = card;
            const path = listInfo.get(head.listId)?.path ?? [];
            const doneChildren = children.filter(isFinished).length;
            const othersOpen = openOthers.has(head.id);
            const headFinished = isFinished(head);
            const owners = head.assignees.filter((a) => a.id !== currentUser.id);
            const toggleOthers = () =>
              setOpenOthers((s) => {
                const n = new Set(s);
                if (n.has(head.id)) n.delete(head.id);
                else n.add(head.id);
                return n;
              });
            return (
              <div key={head.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
                {/* Head: the top-level task. Yours — with its circle, status and date — or muted context. */}
                <div className="px-3.5 pt-3 pb-2.5 bg-neutral-950/30">
                  <div className="text-[10.5px] text-neutral-500 mb-1.5 break-words">{path.join(' › ')}</div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {headMine && circle(head)}
                    <button
                      onClick={() => onOpenTask(head.id)}
                      className={`flex-1 min-w-0 text-left truncate cursor-pointer hover:underline ${
                        headMine ? 'text-[13.5px] font-semibold text-app-strong' : 'text-[13px] font-medium text-neutral-500'
                      } ${headFinished ? 'line-through opacity-70' : ''}`}
                    >
                      {head.title}
                    </button>
                    {headMine ? (
                      <>
                        <span className="hidden sm:inline text-[10px] font-bold text-blue-400 bg-blue-500/10 rounded-full px-1.5 py-px shrink-0">you</span>
                        <span className="hidden sm:inline-flex">{statusPill(head)}</span>
                        {dateOf(head)}
                      </>
                    ) : (
                      owners.length > 0 && (
                        <span className="flex items-center -space-x-1 shrink-0" title={`Owned by ${owners.map((o) => o.name).join(', ')}`}>
                          {owners.slice(0, 3).map((o) => (
                            <span
                              key={o.id}
                              className="w-5 h-5 rounded-full text-[8.5px] font-bold text-white flex items-center justify-center ring-2 ring-neutral-900"
                              style={{ backgroundColor: o.color }}
                            >
                              {o.initials}
                            </span>
                          ))}
                        </span>
                      )
                    )}
                  </div>
                  {children.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-neutral-500">
                      <span className="flex-1 max-w-[200px] h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                        <span className="block h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round((doneChildren / children.length) * 100)}%` }} />
                      </span>
                      {doneChildren}/{children.length} subtasks done
                      {rows.length === 0 && others.length > 0 && (
                        <button onClick={toggleOthers} className="text-blue-400 hover:text-blue-300 cursor-pointer">
                          · {othersOpen ? 'hide' : 'show'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Yours under it — a checklist, in the List's own order. */}
                {rows.map(({ task, via }) => (
                  <ChecklistRow key={task.id} task={task} via={via} circle={circle(task)} pill={statusPill(task)} date={dateOf(task)} finished={isFinished(task)} onOpen={onOpenTask} />
                ))}

                {/* Everyone else's subtasks in this task, folded away. */}
                {others.length > 0 && rows.length > 0 && (
                  <button
                    onClick={toggleOthers}
                    className="w-full text-left px-3.5 py-2 text-[11.5px] text-neutral-500 border-t border-dashed border-neutral-800 hover:text-neutral-300 cursor-pointer"
                  >
                    {othersOpen ? 'Hide' : `+ ${others.length} other subtask${others.length === 1 ? '' : 's'}`}
                    {!othersOpen && <span className="text-blue-400"> · show</span>}
                  </button>
                )}
                {othersOpen &&
                  others.map(({ task, via }) => (
                    <ChecklistRow key={task.id} task={task} via={via} circle={null} pill={statusPill(task)} date={dateOf(task)} finished={isFinished(task)} onOpen={onOpenTask} muted />
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  task,
  via,
  circle,
  pill,
  date,
  finished,
  muted = false,
  onOpen,
}: {
  task: Task;
  // Subtasks between this one and the card's head, for one nested more than a level down.
  via: string[];
  circle: React.ReactNode;
  pill: React.ReactNode;
  date: React.ReactNode;
  finished: boolean;
  // Someone else's subtask, shown for context: no circle, no "you".
  muted?: boolean;
  onOpen: (taskId: string) => void;
}) {
  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-2.5 md:py-2 border-t border-neutral-800/70 ${muted ? 'opacity-60' : ''}`}>
      {circle ?? <span className="w-4 h-4 shrink-0" />}
      <button onClick={() => onOpen(task.id)} className="flex-1 min-w-0 text-left cursor-pointer group">
        {via.length > 0 && <span className="block text-[10px] text-neutral-500 truncate">{via.join(' › ')}</span>}
        <span className={`block truncate text-[12.5px] md:text-xs text-neutral-200 group-hover:underline ${finished ? 'line-through opacity-70' : ''}`}>
          {task.title}
        </span>
      </button>
      {muted && task.assignees.length > 0 && (
        <span className="flex items-center -space-x-1 shrink-0">
          {task.assignees.slice(0, 2).map((a) => (
            <span key={a.id} className="w-4 h-4 rounded-full text-[7.5px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: a.color }}>
              {a.initials}
            </span>
          ))}
        </span>
      )}
      <span className="hidden sm:inline-flex">{pill}</span>
      {date}
    </div>
  );
}

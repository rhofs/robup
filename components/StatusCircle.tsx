'use client';

import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import FloatingPopover from './FloatingPopover';
import { useTaskStore, type StatusDef, type Task } from '../store/useTaskStore';

// The circle in front of a task, ClickUp's way: it shows the task's status — a dashed ring in the
// status colour while open, filled with a tick once done or closed — and a tap opens the statuses to
// choose from instead of a single "check". "for noen tasks trenger vi at vi ser at den er gjort, ikke
// bare borte":
//
//   - an open or done status sets the status; a done one turns the circle solid, and the task stays;
//   - a closed status ("Slett") checks the task away — it is archived and leaves the list.
//
// A Space with no closed status of its own still gets one way to check a task away: "Close task"
// (archive, status unchanged), the behaviour the circle always had. Picking an open or done status for
// an archived task brings it back.
//
// The menu holds statuses only. "Edit statuses" was here for one round and was moved to the status
// group's "···" (and the Status column's and Space's menus): "Vi kan ikke ha den inne i sirkelen" — the
// circle may one day close a task directly, with no menu at all.

export default function StatusCircle({
  task,
  statuses,
  size,
}: {
  task: Task;
  statuses: StatusDef[];
  size: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const moveTask = useTaskStore((s) => s.optimisticMoveTask);
  const archiveTask = useTaskStore((s) => s.optimisticArchiveTask);

  const ordered = [...statuses].sort((a, b) => a.order - b.order);
  const current = ordered.find((s) => s.name === task.status);
  const closed = task.archived || !!current?.isClosed;
  const done = !closed && !!current?.isDone;
  const q = query.trim().toLowerCase();
  const match = (s: StatusDef) => !q || s.name.toLowerCase().includes(q);
  const active = ordered.filter((s) => !s.isClosed && match(s));
  const closedOnes = ordered.filter((s) => s.isClosed && match(s));

  const pick = (s: StatusDef | null) => {
    setOpen(false);
    setQuery('');
    if (s === null || s.isClosed) {
      if (s && task.status !== s.name) moveTask(task.id, s.name);
      if (!task.archived) archiveTask(task.id, true);
      return;
    }
    if (task.archived) archiveTask(task.id, false);
    if (task.status !== s.name) moveTask(task.id, s.name);
  };

  const dim = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const tick = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  const glyph = (s: StatusDef | undefined, isClosed: boolean, isDone: boolean, cls: string, tickCls: string) =>
    isClosed || isDone ? (
      <span className={`${cls} rounded-full flex items-center justify-center text-white shrink-0`} style={{ backgroundColor: isClosed && !s ? '#10b981' : s?.color ?? '#10b981' }}>
        <Check className={tickCls} strokeWidth={3} />
      </span>
    ) : (
      <span className={`${cls} rounded-full border-2 border-dashed shrink-0`} style={{ borderColor: s?.color ?? '#94a3b8' }} />
    );

  const row = (s: StatusDef) => (
    <button
      key={s.id}
      onClick={() => pick(s)}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-neutral-800 cursor-pointer"
    >
      {glyph(s, !!s.isClosed, !!s.isDone, 'w-3.5 h-3.5', 'w-2 h-2')}
      <span className="flex-1 min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-neutral-200">{s.name}</span>
      {s.name === task.status && !(task.archived && !s.isClosed) && <Check className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
    </button>
  );

  return (
    <FloatingPopover
      open={open}
      onClose={() => {
        setOpen(false);
        setQuery('');
      }}
      panelClassName="w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1.5"
      anchor={
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          title={closed ? 'Closed' : current?.name ?? task.status}
          className={`rounded-full flex items-center justify-center cursor-pointer transition-transform duration-200 active:scale-90 hover:scale-110 shrink-0 ${dim}`}
        >
          {glyph(current, closed, done, dim, tick)}
        </button>
      }
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 h-8 px-2 mb-1 rounded-lg border border-neutral-700 focus-within:border-blue-500">
          <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 min-w-0 bg-transparent text-[12px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
          />
        </div>
        <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-neutral-500">Statuses</p>
        {active.map(row)}
        <div className="border-t border-neutral-800 my-1" />
        <p className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold text-neutral-500">Closed</p>
        {closedOnes.length > 0
          ? closedOnes.map(row)
          : (!q || 'close task'.includes(q)) && (
              <button
                onClick={() => pick(null)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-neutral-800 cursor-pointer"
              >
                {glyph(undefined, true, false, 'w-3.5 h-3.5', 'w-2 h-2')}
                <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-neutral-200">Close task</span>
                {task.archived && <Check className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
              </button>
            )}
      </div>
    </FloatingPopover>
  );
}

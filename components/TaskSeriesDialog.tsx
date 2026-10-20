'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Repeat, X } from 'lucide-react';
import { closeOnBackdrop } from '../lib/backdrop';
import { useTaskStore, type Task } from '../store/useTaskStore';

// "Create next episodes": copies of a task, each one step on — its dates and its subtasks' dates moved
// by the same number of days per copy, and the numbers in its title counted up — like dragging a series
// in Excel. "Lag de 13 neste tasksa … så det fungerer som en duplicate, men med da forskøvet datoer, med
// det mønsteret" (2026-10-20). The server makes them (app/api/tasks/[id]/series); this works out the
// step and the titles and shows what will be made.
//
// The step is read off the task before this one in its List: the number of days between their dates,
// whichever dates both have (start, due, date columns), the most common difference winning. 7 if there
// is nothing to read it from. Always editable.

const DAY_MS = 86_400_000;

// A date as a whole local calendar day, for differences in days that ignore time and clock changes.
function dayNumber(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (plain) return Math.round(Date.UTC(+plain[1], +plain[2] - 1, +plain[3]) / DAY_MS);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}
const fromDayNumber = (n: number) => {
  const d = new Date(n * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined });

// The numbers in a title, where they are and how wide (a leading zero is kept: G044662 → G044663).
type NumToken = { start: number; end: number; text: string };
const numberTokens = (title: string): NumToken[] => [...title.matchAll(/\d+/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, text: m[0] }));
function titleFor(title: string, tokens: NumToken[], on: boolean[], n: number) {
  let out = '';
  let last = 0;
  tokens.forEach((t, i) => {
    out += title.slice(last, t.start);
    if (on[i]) {
      const next = String(Number(t.text) + n);
      out += t.text.length > 1 && t.text.startsWith('0') ? next.padStart(t.text.length, '0') : next;
    } else {
      out += t.text;
    }
    last = t.end;
  });
  return out + title.slice(last);
}

export default function TaskSeriesDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const workspaces = useTaskStore((s) => s.workspaces);
  const createTaskSeries = useTaskStore((s) => s.createTaskSeries);

  const space = workspaces.flatMap((w) => w.spaces).find((sp) => sp.lists.some((l) => l.id === task.listId));
  const dateFields = (space?.customFields ?? []).filter((f) => f.type === 'date' && (f.listId === null || f.listId === task.listId));
  const values = (t: Task): Record<string, string> => {
    try {
      return JSON.parse(t.customFieldValues || '{}') ?? {};
    } catch {
      return {};
    }
  };
  // Every date a task has, by name, as calendar days.
  const datesOf = (t: Task) => {
    const v = values(t);
    const out: { key: string; label: string; day: number }[] = [];
    const s = dayNumber(t.startDate);
    const d = dayNumber(t.dueDate);
    if (s !== null) out.push({ key: 'start', label: 'Start', day: s });
    if (d !== null) out.push({ key: 'due', label: 'Due', day: d });
    for (const f of dateFields) {
      const n = dayNumber(v[f.id]);
      if (n !== null) out.push({ key: f.id, label: f.name, day: n });
    }
    return out;
  };

  // The step, from the task before this one among its siblings.
  const detected = useMemo(() => {
    const siblings = tasks
      .filter((t) => t.listId === task.listId && (t.parentId ?? null) === (task.parentId ?? null) && !t.deletedAt && !t.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const at = siblings.findIndex((t) => t.id === task.id);
    const prev = at > 0 ? siblings[at - 1] : undefined;
    if (!prev) return null;
    const mine = datesOf(task);
    const theirs = new Map(datesOf(prev).map((x) => [x.key, x]));
    const diffs = mine.flatMap((x) => (theirs.has(x.key) ? [{ label: x.label, diff: x.day - theirs.get(x.key)!.day }] : [])).filter((x) => x.diff > 0);
    if (diffs.length === 0) return null;
    const counts = new Map<number, number>();
    for (const x of diffs) counts.set(x.diff, (counts.get(x.diff) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    return { days: best, from: prev.title, label: diffs.find((x) => x.diff === best)!.label };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, task.id]);

  const [count, setCount] = useState(1);
  const [step, setStep] = useState<number>(() => detected?.days ?? 7);
  const tokens = useMemo(() => numberTokens(task.title), [task.title]);
  const [countUp, setCountUp] = useState<boolean[]>(() => tokens.map(() => true));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Math.max(1, Math.min(60, Math.floor(count) || 1));
  const titles = Array.from({ length: n }, (_, i) => titleFor(task.title, tokens, countUp, i + 1));
  const subtaskCount = (() => {
    let c = 0;
    const walk = (id: string, depth: number) => {
      if (depth > 12) return;
      for (const t of tasks) if (t.parentId === id && !t.deletedAt) {
        c++;
        walk(t.id, depth + 1);
      }
    };
    walk(task.id, 0);
    return c;
  })();
  const ownDates = datesOf(task);
  const previewDates = (k: number) =>
    ownDates
      .slice(0, 3)
      .map((x) => `${x.label} ${short(fromDayNumber(x.day + k * step))}`)
      .join(' · ');
  const previewRows = n <= 4 ? titles.map((t, i) => ({ i, t })) : [...titles.slice(0, 3).map((t, i) => ({ i, t })), { i: n - 1, t: titles[n - 1] }];

  const create = async () => {
    setSaving(true);
    setError(null);
    const err = await createTaskSeries(task.id, { count: n, shiftDays: Math.round(step) || 0, titles });
    if (err) {
      setSaving(false);
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-scrim/70 backdrop-blur-xs p-4 md:pt-[10vh] overflow-y-auto" {...closeOnBackdrop(onClose)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold text-[15px] text-app-strong">
            <Repeat className="w-4 h-4 text-blue-400" /> Create next tasks
          </h3>
          <button onClick={onClose} title="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-5">
          <p className="text-[12px] text-neutral-400 -mt-1">
            Copies of <span className="text-app-strong font-medium">{task.title}</span>
            {subtaskCount > 0 && ` with its ${subtaskCount} subtasks`}, each one step further on.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">How many</span>
              <input
                type="number"
                min={1}
                max={60}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full h-10 bg-neutral-950 border border-neutral-700 rounded-lg px-3 text-[13px] text-app-strong focus:outline-none focus:border-blue-500"
              />
              <span className="flex gap-1.5 mt-1.5">
                {[1, 4, 13].map((q) => (
                  <button
                    key={q}
                    onClick={() => setCount(q)}
                    className={`h-6 px-2 rounded-md text-[11px] cursor-pointer ${count === q ? 'bg-blue-500/15 text-blue-400' : 'bg-neutral-800/70 text-neutral-400 hover:text-neutral-200'}`}
                  >
                    {q}
                  </button>
                ))}
              </span>
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Every</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  value={step}
                  onChange={(e) => setStep(Number(e.target.value))}
                  className="w-full h-10 bg-neutral-950 border border-neutral-700 rounded-lg px-3 text-[13px] text-app-strong focus:outline-none focus:border-blue-500"
                />
                <span className="text-[12px] text-neutral-400 shrink-0">days</span>
              </span>
              <span className="block mt-1.5 text-[11px] text-neutral-500 leading-snug">
                {detected ? (
                  <>
                    From the task before: <span className="text-neutral-300">{detected.label}</span> {detected.days} days apart
                  </>
                ) : (
                  'No earlier task with dates to read it from'
                )}
              </span>
            </label>
          </div>

          {tokens.length > 0 && (
            <div>
              <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Count up in the title</span>
              <div className="flex flex-wrap gap-1.5">
                {tokens.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setCountUp((c) => c.map((v, j) => (j === i ? !v : v)))}
                    className={`h-7 px-2.5 rounded-lg border text-[12px] font-mono cursor-pointer ${
                      countUp[i] ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-neutral-700 text-neutral-500 line-through'
                    }`}
                  >
                    {t.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Will create</span>
            <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800/70">
              {previewRows.map(({ i, t }, idx) => (
                <div key={i}>
                  {n > 4 && idx === 3 && <div className="px-3 py-1 text-[11px] text-neutral-600">… {n - 4} more …</div>}
                  <div className="px-3 py-2">
                    <div className="text-[12.5px] text-app-strong truncate">{t}</div>
                    {ownDates.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 truncate">
                        <CalendarClock className="w-3 h-3 shrink-0" /> {previewDates(i + 1)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-800 px-5 py-3 flex items-center justify-end gap-2">
          <span className={`mr-auto text-[11px] ${error ? 'text-red-400' : 'text-neutral-500'}`}>{error ?? (step === 0 ? 'Same dates as the original' : '')}</span>
          <button onClick={onClose} className="h-9 px-4 rounded-lg text-[13px] text-neutral-300 hover:bg-neutral-800 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={saving}
            className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[13px] font-semibold cursor-pointer"
          >
            {saving ? 'Creating…' : `Create ${n} ${n === 1 ? 'task' : 'tasks'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

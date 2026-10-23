'use client';

import { Repeat } from 'lucide-react';
import { parseRecurrence, recurrenceLabel, type RecurrenceFreq, type RecurrenceRule } from '../../lib/recurrence';

// How an event repeats (lib/recurrence.ts) — in the event window and when creating one. "Does not
// repeat", or every N days/weeks/months/years, ending never, on a date or after a number of times.
// Changes are handed up at once as the rule's JSON (null for not repeating).
const FREQS: { value: RecurrenceFreq; one: string; many: string }[] = [
  { value: 'daily', one: 'day', many: 'days' },
  { value: 'weekly', one: 'week', many: 'weeks' },
  { value: 'monthly', one: 'month', many: 'months' },
  { value: 'yearly', one: 'year', many: 'years' },
];

const fieldCls = 'h-8 bg-neutral-950 border border-neutral-700 rounded-lg px-2 text-[12px] text-app-strong focus:outline-none focus:border-blue-500';

export default function RepeatPicker({ value, onChange, startDate }: { value: string | null | undefined; onChange: (json: string | null) => void; startDate?: Date | string | null }) {
  const rule = parseRecurrence(value);
  const set = (next: RecurrenceRule | null) => onChange(next ? JSON.stringify(next) : null);
  const ends: 'never' | 'until' | 'count' = rule?.until ? 'until' : rule?.count ? 'count' : 'never';
  // A first "until": a month after the start, so the field opens somewhere sensible.
  const defaultUntil = () => {
    const d = startDate ? new Date(startDate) : new Date();
    const u = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, '0')}-${String(u.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Repeat className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <select
          value={rule ? 'on' : 'off'}
          onChange={(e) => set(e.target.value === 'on' ? { freq: 'weekly', interval: 1 } : null)}
          className={`${fieldCls} cursor-pointer`}
        >
          <option value="off">Does not repeat</option>
          <option value="on">Repeats</option>
        </select>
        {rule && <span className="text-[11px] text-neutral-500 truncate">{recurrenceLabel(rule)}</span>}
      </div>
      {rule && (
        <div className="pl-5 space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-neutral-400">
            Every
            <input
              type="number"
              min={1}
              max={99}
              value={rule.interval}
              onChange={(e) => set({ ...rule, interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
              className={`${fieldCls} w-14 text-center`}
            />
            <select value={rule.freq} onChange={(e) => set({ ...rule, freq: e.target.value as RecurrenceFreq })} className={`${fieldCls} cursor-pointer`}>
              {FREQS.map((f) => (
                <option key={f.value} value={f.value}>
                  {rule.interval === 1 ? f.one : f.many}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-neutral-400 flex-wrap">
            Ends
            <select
              value={ends}
              onChange={(e) => {
                const v = e.target.value;
                set({ freq: rule.freq, interval: rule.interval, until: v === 'until' ? defaultUntil() : null, count: v === 'count' ? 10 : null });
              }}
              className={`${fieldCls} cursor-pointer`}
            >
              <option value="never">Never</option>
              <option value="until">On a date</option>
              <option value="count">After a number of times</option>
            </select>
            {ends === 'until' && (
              <input type="date" value={rule.until ?? ''} onChange={(e) => e.target.value && set({ ...rule, until: e.target.value, count: null })} className={fieldCls} />
            )}
            {ends === 'count' && (
              <>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={rule.count ?? 10}
                  onChange={(e) => set({ ...rule, until: null, count: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })}
                  className={`${fieldCls} w-16 text-center`}
                />
                times
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

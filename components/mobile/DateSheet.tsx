'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronUp, ChevronDown, CalendarDays, Sunrise, CalendarCheck, CalendarArrowUp } from 'lucide-react';
import TimeDialSheet from './TimeDialSheet';
import { hapticTap } from '../../lib/haptics';

// "Choose dates" on a phone, modelled on ClickUp's (the user's screenshots): two fields at the top —
// start and due (or end, for an event) — the one being set outlined; quick picks under them; a month
// you can page through; and "Add time" on a field opening the clock face (TimeDialSheet).
//
// Picking a day fills the outlined field and then moves the outline on to the next one, so a range
// is two taps. A day before the start, picked for the end, swaps them rather than making an
// impossible range. Values in and out are ISO strings, midnight meaning "no time" — the same
// convention every other date in the app uses (see DatePickerPopover's hasTime).

type Field = 'start' | 'end';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && startOfDay(a).getTime() === startOfDay(b).getTime();
const hasTime = (d: Date | null) => !!d && (d.getHours() !== 0 || d.getMinutes() !== 0);
const parse = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (d: Date) => {
  const date = `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
  return hasTime(d) ? `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : date;
};

// Quick picks. "This week" is Friday — the end of the working week, which is what someone setting a
// deadline "this week" means — or Sunday once Friday has passed. "Next week" is next Monday.
function quickPicks(today: Date) {
  const dow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
  const thisWeek = dow <= 4 ? addDays(today, 4 - dow) : addDays(today, 6 - dow);
  const nextWeek = addDays(today, 7 - dow);
  return [
    { label: 'Today', icon: CalendarDays, date: today },
    { label: 'Tomorrow', icon: Sunrise, date: addDays(today, 1) },
    { label: 'This week', icon: CalendarCheck, date: thisWeek },
    { label: 'Next week', icon: CalendarArrowUp, date: nextWeek },
  ];
}

export default function DateSheet({
  start: startIso,
  end: endIso,
  endName = 'Due',
  single,
  onSave,
  onClose,
}: {
  // One date instead of a range — the task row's and task modal's pickers, which set start and due
  // separately. The value is what the field is called ("Start", "Due", a custom field's name).
  single?: string;
  start: string | null;
  end: string | null;
  // What the second date is called: a task's is its due date, an event's its end.
  endName?: 'Due' | 'End';
  onSave: (start: string | null, end: string | null) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState<Date | null>(() => parse(startIso));
  const [end, setEnd] = useState<Date | null>(() => parse(endIso));
  const [active, setActive] = useState<Field>(start && !end && !single ? 'end' : 'start');
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => {
    const d = start ?? end ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [timeFor, setTimeFor] = useState<Field | null>(null);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const count = lead + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() > 35 ? 42 : 35;
    return Array.from({ length: count }, (_, i) => addDays(first, i - lead));
  }, [month]);

  // Keeps the time a field already had when its day changes.
  const withDay = (day: Date, prev: Date | null) => {
    const d = startOfDay(day);
    if (prev && hasTime(prev)) d.setHours(prev.getHours(), prev.getMinutes());
    return d;
  };

  const choose = (day: Date) => {
    hapticTap();
    if (active === 'start') {
      const next = withDay(day, start);
      setStart(next);
      if (single) return;
      if (end && startOfDay(end) < startOfDay(next)) setEnd(null);
      setActive('end');
    } else {
      const next = withDay(day, end);
      if (start && startOfDay(next) < startOfDay(start)) {
        setEnd(withDay(start, end));
        setStart(withDay(day, start));
      } else {
        setEnd(next);
      }
    }
  };

  const inRange = (d: Date) => !!start && !!end && startOfDay(d) > startOfDay(start) && startOfDay(d) < startOfDay(end);

  const field = (which: Field) => {
    const value = which === 'start' ? start : end;
    const setValue = which === 'start' ? setStart : setEnd;
    const name = which === 'start' ? (single ?? 'Start') : endName;
    const isActive = active === which;
    return (
      <div
        onClick={() => setActive(which)}
        className={`flex items-center gap-3 h-14 px-4 rounded-2xl border-2 cursor-pointer transition ${
          isActive ? 'border-app-strong' : 'border-neutral-800'
        }`}
      >
        {value ? (
          <>
            <span className="flex-1 text-[17px] text-app-strong">
              {name} {fmt(value)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setValue(null);
                setActive(which);
              }}
              title="Clear"
              className="w-6 h-6 rounded-full bg-neutral-600 text-neutral-900 flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTimeFor(which);
              }}
              className="text-[16px] text-neutral-400 font-medium cursor-pointer pl-1"
            >
              {hasTime(value) ? 'Time' : 'Add time'}
            </button>
          </>
        ) : (
          <>
            <CalendarDays className="w-5 h-5 text-neutral-500 shrink-0" />
            <span className="flex-1 text-[17px] text-neutral-500">Set {name.toLowerCase()} date</span>
          </>
        )}
      </div>
    );
  };

  const timeTarget = timeFor === 'start' ? start : timeFor === 'end' ? end : null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-scrim/50 pt-[calc(env(safe-area-inset-top)+12px)]" onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 rounded-t-[28px] max-h-full min-h-0 flex flex-col pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div className="relative flex items-center justify-center px-5 pt-5 pb-3 shrink-0">
          <h3 className="text-[17px] font-semibold text-app-strong">{single ? 'Choose date' : 'Choose dates'}</h3>
          <button onClick={onClose} className="absolute right-4 w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 space-y-3">
          {field('start')}
          {!single && field('end')}

          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 no-scrollbar">
            {quickPicks(today).map((q) => (
              <button
                key={q.label}
                onClick={() => choose(q.date)}
                className="shrink-0 flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-neutral-800 text-[15px] text-app-strong cursor-pointer active:bg-neutral-800"
              >
                <q.icon className="w-4 h-4 text-neutral-400" /> {q.label}
              </button>
            ))}
          </div>

          <div className="border-t border-neutral-800 -mx-5 px-5 pt-4">
            <div className="flex items-center justify-between pb-3">
              <span className="text-[18px] font-bold text-app-strong">
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </span>
              <span className="flex gap-4">
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1 cursor-pointer text-app-strong" title="Previous month">
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1 cursor-pointer text-app-strong" title="Next month">
                  <ChevronDown className="w-5 h-5" />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-7 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-[13px] text-neutral-500 pb-2">
                  {w}
                </span>
              ))}
              {days.map((d) => {
                const outside = d.getMonth() !== month.getMonth();
                const isStart = sameDay(d, start);
                const isEnd = sameDay(d, end);
                const isToday = sameDay(d, today);
                const between = inRange(d);
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => choose(d)}
                    className={`relative h-12 flex items-center justify-center cursor-pointer ${between ? 'bg-blue-500/10' : ''}`}
                  >
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-[17px] font-medium transition ${
                        isStart || isEnd
                          ? 'bg-blue-600 text-white'
                          : isToday
                            ? 'bg-red-500/90 text-white'
                            : outside
                              ? 'text-neutral-500'
                              : 'text-app-strong'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pt-4 shrink-0 border-t border-neutral-800 mt-2">
          <button
            onClick={() => {
              setStart(null);
              setEnd(null);
              setActive('start');
            }}
            disabled={!start && !end}
            className="h-12 rounded-2xl border border-neutral-700 text-[15px] font-semibold text-neutral-400 disabled:opacity-40 cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={() => onSave(start ? start.toISOString() : null, end ? end.toISOString() : null)}
            className="h-12 rounded-2xl bg-app-strong text-neutral-900 text-[15px] font-semibold cursor-pointer"
          >
            Save
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {timeFor && (
          <TimeDialSheet
            initial={timeTarget && hasTime(timeTarget) ? { h: timeTarget.getHours(), m: timeTarget.getMinutes() } : null}
            onClose={() => setTimeFor(null)}
            onClear={() => {
              const set = timeFor === 'start' ? setStart : setEnd;
              if (timeTarget) set(startOfDay(timeTarget));
              setTimeFor(null);
            }}
            onSave={(h, m) => {
              const set = timeFor === 'start' ? setStart : setEnd;
              const base = timeTarget ?? today;
              const d = startOfDay(base);
              // 00:00 is how "no time" is stored, so a chosen midnight is kept one minute past it.
              d.setHours(h, h === 0 && m === 0 ? 1 : m);
              set(d);
              setTimeFor(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

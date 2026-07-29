'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import FloatingPopover from './FloatingPopover';

type DatePickerPopoverProps = {
  value: string | Date | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  align?: 'left' | 'right';
};

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

const startOfDay = (d: Date) => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

const isSameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatShort = (d: Date) => `${d.getDate()}. ${MONTH_LABELS[d.getMonth()].slice(0, 3)}`;

export default function DatePickerPopover({ value, onChange, placeholder = 'Not set', align = 'left' }: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);

  const selected = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  const hasTime = !!selected && (selected.getHours() !== 0 || selected.getMinutes() !== 0);
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => startOfDay(selected || today));

  useEffect(() => {
    if (open) {
      setViewMonth(startOfDay(selected || today));
      setShowTimeInput(hasTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commitDate = (day: Date) => {
    const next = new Date(day);
    if (selected && hasTime) {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    onChange(next.toISOString());
  };

  const commitTime = (hh: number, mm: number) => {
    const base = selected || today;
    const next = new Date(base);
    next.setHours(hh, mm, 0, 0);
    onChange(next.toISOString());
  };

  const calendarDays = useMemo(() => {
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startWeekday = (monthStart.getDay() + 6) % 7; // Mon=0..Sun=6
    const gridStart = addDays(monthStart, -startWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  return (
    <FloatingPopover
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      panelClassName="w-64 bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden text-xs"
      anchor={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`px-2 py-1 rounded cursor-pointer text-xs font-sans transition ${
            selected ? 'text-neutral-300 hover:bg-neutral-800/70 hover:text-white' : 'text-neutral-500 hover:bg-neutral-800/70 hover:text-neutral-300'
          }`}
        >
          {selected ? (
            <span className="inline-flex items-baseline gap-1.5 tabular-nums">
              <span>{formatShort(selected)}</span>
              {hasTime && (
                <span className="text-[9px] text-neutral-500">
                  {pad(selected.getHours())}:{pad(selected.getMinutes())}
                </span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </button>
      }
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-neutral-200">
            {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMonth(startOfDay(today))}
              className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="text-neutral-400 hover:text-white px-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="text-neutral-400 hover:text-white px-1 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] text-neutral-500 mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {calendarDays.map((day) => {
            const inMonth = day.getMonth() === viewMonth.getMonth();
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selected);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => commitDate(day)}
                className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center cursor-pointer transition ${
                  isSelected
                    ? 'bg-blue-600 text-white font-semibold'
                    : isToday
                    ? 'text-blue-400 font-semibold hover:bg-neutral-800'
                    : inMonth
                    ? 'text-neutral-300 hover:bg-neutral-800'
                    : 'text-neutral-600 hover:bg-neutral-800/50'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="px-3 py-2.5 border-t border-neutral-800 bg-neutral-950/40 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wide text-neutral-500 w-9 shrink-0">Date</span>
            <span className="flex items-center gap-1.5 text-[11px] bg-neutral-800 text-neutral-200 rounded px-2.5 py-1">
              {formatShort(selected)}
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setShowTimeInput(false);
                }}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wide text-neutral-500 w-9 shrink-0">Time</span>
            {showTimeInput ? (
              <input
                type="time"
                autoFocus
                value={`${pad(selected.getHours())}:${pad(selected.getMinutes())}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (!isNaN(h) && !isNaN(m)) commitTime(h, m);
                }}
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-200 focus:outline-none focus:border-blue-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowTimeInput(true)}
                className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                + Add time
              </button>
            )}
          </div>
        </div>
      )}
    </FloatingPopover>
  );
}

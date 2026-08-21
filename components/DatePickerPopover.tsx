'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import FloatingPopover from './FloatingPopover';

type DatePickerPopoverProps = {
  value: string | Date | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  align?: 'left' | 'right';
  // Urgency (see lib/dateBadgeColor.ts) — this component stays agnostic to which date it
  // represents (start vs due) or how urgency is computed; callers pass the resolved hex color (or
  // omit it to keep today's plain neutral look) and a tooltip with the exact relative time (e.g.
  // "Overdue by 2 days") — a filled pill alone still asks the reader to remember what each color
  // means, the tooltip removes that guesswork on hover.
  badgeColorHex?: string;
  tooltip?: string;
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

// Quarter-hour options for the time dropdown below — a plain, quick "pick a common time" list.
// The text input right next to it still accepts anything (e.g. 14:07), this is just a shortcut.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

export default function DatePickerPopover({ value, onChange, placeholder = 'Not set', align = 'left', badgeColorHex, tooltip }: DatePickerPopoverProps) {
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
          title={selected ? tooltip : undefined}
          className={`px-2 py-1 rounded cursor-pointer text-xs font-sans transition ${
            selected
              ? badgeColorHex
                ? 'hover:bg-neutral-800/70'
                : 'text-neutral-300 hover:bg-neutral-800/70 hover:text-white'
              : 'text-neutral-500 hover:bg-neutral-800/70 hover:text-neutral-300'
          }`}
          style={selected && badgeColorHex ? { color: badgeColorHex } : undefined}
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
              <TimeField value={selected} onCommit={commitTime} />
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

// Replaces a bare native <input type="time"> — reported as looking dated (that's the browser's
// own spinner/clock chrome, not styled by this app at all, and inconsistent across browsers).
// Same pattern the font-size dropdown already established (components/collab/DocFormatPanel.tsx):
// a plain text input for typing an exact value, plus a chevron-anchored FloatingPopover with a
// scrollable list of common presets — this app fully controls both, unlike a native widget.
function TimeField({ value, onCommit }: { value: Date; onCommit: (hh: number, mm: number) => void }) {
  const currentLabel = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  const [text, setText] = useState(currentLabel);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Synced from the real value whenever it changes elsewhere (picked from the list below, or
  // committed via Enter/blur) — but not on every keystroke, so typing a partial value like "14:"
  // isn't stomped by a re-render before it's actually committed.
  useEffect(() => {
    setText(currentLabel);
  }, [currentLabel]);

  useEffect(() => {
    if (menuOpen) selectedRef.current?.scrollIntoView({ block: 'center' });
  }, [menuOpen]);

  const commitText = (raw: string) => {
    const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      setText(currentLabel); // invalid — snap back to the last real value instead of accepting garbage
      return;
    }
    onCommit(Number(match[1]), Number(match[2]));
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="HH:MM"
        className="w-14 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-200 text-center focus:outline-none focus:border-blue-500"
      />
      <FloatingPopover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        panelClassName="w-16 max-h-48 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
        anchor={
          <button
            type="button"
            title="Common times"
            onClick={() => setMenuOpen((o) => !o)}
            className="w-6 h-7 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 text-neutral-400"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        }
      >
        {TIME_OPTIONS.map((t) => {
          const isSelected = t === currentLabel;
          return (
            <button
              key={t}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              onClick={() => {
                const [hh, mm] = t.split(':').map(Number);
                onCommit(hh, mm);
                setMenuOpen(false);
              }}
              className={`w-full text-center px-2 py-1 text-[11px] cursor-pointer hover:bg-neutral-800 ${
                isSelected ? 'text-blue-400 font-semibold' : 'text-neutral-300'
              }`}
            >
              {t}
            </button>
          );
        })}
      </FloatingPopover>
    </div>
  );
}

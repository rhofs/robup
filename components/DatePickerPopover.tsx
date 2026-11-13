'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clock, Plus, X } from 'lucide-react';
import FloatingPopover from './FloatingPopover';
import { AnimatePresence } from 'framer-motion';
import DateSheet from './mobile/DateSheet';
import TimeDialSheet from './mobile/TimeDialSheet';
import { useIsMobile } from '../hooks/useIsMobile';

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
  // What the date is, for the phone's "Choose date" sheet ("Start 29/9/26"). The desktop popover
  // has no field label and does not use it.
  label?: string;
  // Says which date it is next to the value ("Start 13 Oct"), and while unset shows the placeholder
  // as an empty slot (dashed) — in the task window, where two bare "Not set"s said nothing about which
  // was which ("kan vi indikere at det er start date/due date? Men at det fortsatt viser at det ikke er
  // satt?"). Off by default: in a row's column the column header says it.
  showLabel?: boolean;
  // The Planner switch (components/PlannerToggle.tsx), for a task's own start and due dates: shown
  // under the calendar, and in the phone's date sheet. Rendered only while the picker is open.
  plannerToggle?: React.ReactNode;
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

// Day and month, plus the year whenever it is not this one.
//
// Dropping the year is right for the ordinary case — almost every date in a task list is within a few
// months, and "4. mar 2026" on every badge is noise. It stops being right the moment dates from other
// years exist, which they now do: an import brings in whatever the source had, and "4. mar" on an
// imported task says nothing about whether it was last year or next. The year was reachable only by
// opening the picker.
//
// Same rule the chat day separators already use, and the same reason: show the part that is
// surprising, leave out the part that is assumed.
const formatShort = (d: Date) => {
  const base = `${d.getDate()}. ${MONTH_LABELS[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
};

export default function DatePickerPopover({ value, onChange, placeholder = 'Not set', align = 'left', badgeColorHex, tooltip, label = 'Date', showLabel = false, plannerToggle }: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  // The clock face (TimeDialSheet as a window) — the one way a time is picked anywhere in the app. This
  // popover used to have its own: a text box and a dropdown of quarter hours ("ikke om jeg endrer, da
  // får jeg en dropdown meny … Føles mer gjennomført", 2026-11-13).
  const [clockOpen, setClockOpen] = useState(false);
  // Whether the clock has been opened here at all — its layer on <body> is only made then (there is
  // one of these pickers per date cell of every row), and stays so the clock can animate away.
  const [clockUsed, setClockUsed] = useState(false);

  const selected = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  const hasTime = !!selected && (selected.getHours() !== 0 || selected.getMinutes() !== 0);
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => startOfDay(selected || today));

  useEffect(() => {
    if (open) setViewMonth(startOfDay(selected || today));
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
    // 00:00 is how "no time" is stored, so a chosen midnight is kept one minute past it (as DateSheet).
    next.setHours(hh, hh === 0 && mm === 0 ? 1 : mm, 0, 0);
    onChange(next.toISOString());
  };

  const clearTime = () => {
    if (!selected) return;
    const next = new Date(selected);
    next.setHours(0, 0, 0, 0);
    onChange(next.toISOString());
  };

  // The clock takes over from the popover rather than opening on top of it: the popover closes on any
  // press outside itself, which a press on the clock is.
  const openClock = () => {
    setOpen(false);
    setClockUsed(true);
    setClockOpen(true);
  };

  const calendarDays = useMemo(() => {
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startWeekday = (monthStart.getDay() + 6) % 7; // Mon=0..Sun=6
    const gridStart = addDays(monthStart, -startWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  const anchor = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      title={selected ? tooltip : undefined}
      className={`px-2 py-1 rounded cursor-pointer text-xs font-sans transition ${
        selected
          ? badgeColorHex
            ? 'hover:bg-neutral-800/70'
            : 'text-neutral-300 hover:bg-neutral-800/70 hover:text-app-strong'
          : `text-neutral-500 hover:bg-neutral-800/70 hover:text-neutral-300 ${showLabel ? 'border border-dashed border-neutral-700' : ''}`
      }`}
      style={selected && badgeColorHex ? { color: badgeColorHex } : undefined}
    >
      {selected ? (
        <span className="inline-flex items-baseline gap-1.5 tabular-nums">
          {showLabel && <span className="text-[9.5px] uppercase tracking-wide text-neutral-500 font-semibold">{label}</span>}
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
  );

  // A phone gets the full-width "Choose date" sheet (components/mobile/DateSheet.tsx) — the same one
  // quick create uses, with its quick picks and clock face — instead of this small popover, which was
  // built for a mouse. Same value in, same ISO string out.
  if (isMobile) {
    return (
      <>
        {anchor}
        <AnimatePresence>
          {open && (
            <DateSheet
              plannerToggle={plannerToggle}
              single={label}
              start={selected ? selected.toISOString() : null}
              end={null}
              onClose={() => setOpen(false)}
              onSave={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
    <FloatingPopover
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      panelClassName="w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden text-xs"
      anchor={anchor}
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
              className="text-neutral-400 hover:text-app-strong px-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="text-neutral-400 hover:text-app-strong px-1 cursor-pointer"
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
                onClick={() => onChange(null)}
                className="text-neutral-400 hover:text-app-strong cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wide text-neutral-500 w-9 shrink-0">Time</span>
            {hasTime ? (
              <span className="flex items-center gap-1.5 text-[11px] bg-neutral-800 text-neutral-200 rounded pl-2 pr-2.5 py-1">
                <button type="button" onClick={openClock} title="Change time" className="flex items-center gap-1.5 tabular-nums cursor-pointer hover:text-app-strong">
                  <Clock className="w-3 h-3 text-neutral-400" />
                  {pad(selected.getHours())}:{pad(selected.getMinutes())}
                </button>
                <button type="button" onClick={clearTime} title="Remove time" className="text-neutral-400 hover:text-app-strong cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={openClock}
                className="inline-flex items-center gap-1 text-[11px] rounded px-2 py-1 border border-dashed border-neutral-700 text-neutral-400 hover:text-app-strong hover:border-neutral-500 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add time
              </button>
            )}
          </div>
        </div>
      )}
      {plannerToggle && <div className="px-3 py-2 border-t border-neutral-800 flex justify-end">{plannerToggle}</div>}
    </FloatingPopover>
    {/* On <body>, not here: this picker sits in rows and windows that are transformed (which would
        pin a `fixed` layer to them, not the screen). A portal still bubbles React events to where it
        was rendered — a press on the clock must not reach the row behind it and open or drag it. */}
    {clockUsed &&
      createPortal(
        <div className="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <AnimatePresence>
            {clockOpen && (
              <TimeDialSheet
                dialog
                initial={selected && hasTime ? { h: selected.getHours(), m: selected.getMinutes() } : null}
                onClose={() => setClockOpen(false)}
                onClear={() => {
                  clearTime();
                  setClockOpen(false);
                }}
                onSave={(h, m) => {
                  commitTime(h, m);
                  setClockOpen(false);
                }}
              />
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
}

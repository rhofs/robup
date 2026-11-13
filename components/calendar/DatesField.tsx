'use client';

import { CalendarDays, Clock, Plus, X } from 'lucide-react';
import { hasTime } from '../../lib/eventDates';

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// One "Dates" field, as on the phone: a tap opens the date picker (DateSheet as a window) for the
// range. Under it, once a date is chosen, its time — "Add time" straight to the clock, without going
// into the dates first ("under datoene så står det 'Add time' når man har valgt dato, så man ikke må
// inn på selve datoen") — or the time it has, with a cross to take it off.
export default function DatesField({
  start,
  end,
  endName,
  onOpen,
  onClearTime,
}: {
  start: string | null;
  end: string | null;
  endName: 'Due' | 'End';
  onOpen: (time?: 'start' | 'end') => void;
  onClearTime: (which: 'start' | 'end') => void;
}) {
  const timeChip = (which: 'start' | 'end', iso: string | null, name: string) => {
    if (!iso) return null;
    return hasTime(iso) ? (
      <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-neutral-800/70 text-[11.5px] text-neutral-200">
        <button onClick={() => onOpen(which)} className="inline-flex items-center gap-1.5 cursor-pointer">
          <Clock className="w-3 h-3 text-neutral-400" /> {name} {fmtTime(iso)}
        </button>
        <button onClick={() => onClearTime(which)} title="Remove time" className="w-5 h-5 rounded flex items-center justify-center text-neutral-500 hover:text-app-strong cursor-pointer">
          <X className="w-3 h-3" />
        </button>
      </span>
    ) : (
      <button
        onClick={() => onOpen(which)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-dashed border-neutral-700 text-[11.5px] text-neutral-400 hover:text-app-strong hover:border-neutral-500 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Add {name.toLowerCase()} time
      </button>
    );
  };
  return (
    <div className="space-y-2">
      <button
        onClick={() => onOpen()}
        className="w-full h-10 px-3 rounded-lg bg-neutral-950 border border-neutral-700 hover:border-neutral-600 flex items-center gap-2.5 text-left cursor-pointer"
      >
        <CalendarDays className="w-4 h-4 text-neutral-500 shrink-0" />
        {start || end ? (
          <span className="text-[13px] text-app-strong truncate">
            {start && (
              <>
                <span className="text-neutral-500">Start</span> {fmtDay(start)}
              </>
            )}
            {start && end && <span className="text-neutral-600"> → </span>}
            {end && (
              <>
                <span className="text-neutral-500">{endName}</span> {fmtDay(end)}
              </>
            )}
          </span>
        ) : (
          <span className="text-[13px] text-neutral-500">Set dates</span>
        )}
      </button>
      {(start || end) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {timeChip('start', start, 'Start')}
          {timeChip('end', end, endName)}
        </div>
      )}
    </div>
  );
}

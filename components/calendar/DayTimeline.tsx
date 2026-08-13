'use client';

import { useRef, useState } from 'react';
import { isSameDay } from '../../lib/calendarDates';
import { layoutDayColumns } from '../../lib/ganttLayout';
import type { Task, Event } from '../../store/useTaskStore';

const HOUR_H = 48;
const SNAP_MIN = 15;
const CLICK_DRAG_THRESHOLD = 4;

type DayDragMode = 'move' | 'resize-start' | 'resize-end';
type DayDragState = { taskId: string; mode: DayDragMode; deltaMin: number; startClientY: number };

const hasTimeOfDay = (d: Date) => d.getHours() !== 0 || d.getMinutes() !== 0;
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

type DayTimelineProps = {
  day: Date;
  tasks: Task[];
  taskColorOf: (task: Task) => string;
  onOpenTask: (id: string) => void;
  onCommitDates: (taskId: string, startISO: string | null, dueISO: string | null) => void;
  // Events never drag here either (see WeekRow.tsx's own comment) — rendered read-only, click to
  // open EventDetailModal.
  events: Event[];
  eventColorOf: (event: Event) => string;
  onOpenEvent: (id: string) => void;
};

export default function DayTimeline({ day, tasks, taskColorOf, onOpenTask, onCommitDates, events, eventColorOf, onOpenEvent }: DayTimelineProps) {
  const [drag, setDrag] = useState<DayDragState | null>(null);
  const draggedRef = useRef(false);
  const today = new Date();

  const allDayTasks: Task[] = [];
  const timedTasks: { task: Task; start: Date; end: Date }[] = [];

  for (const task of tasks) {
    const start = task.startDate ? new Date(task.startDate) : task.dueDate ? new Date(task.dueDate) : null;
    const end = task.dueDate ? new Date(task.dueDate) : task.startDate ? new Date(task.startDate) : null;
    if (!start || !end) continue;
    if (!hasTimeOfDay(start) && !hasTimeOfDay(end)) {
      allDayTasks.push(task);
    } else {
      timedTasks.push({ task, start, end });
    }
  }

  // Event.allDay is an explicit field (unlike Task, which infers it from whether a time-of-day
  // component is present) — no inference needed.
  const allDayEvents: Event[] = [];
  const timedEvents: { event: Event; start: Date; end: Date }[] = [];
  for (const event of events) {
    if (event.allDay) {
      allDayEvents.push(event);
    } else {
      timedEvents.push({ event, start: new Date(event.startDate), end: new Date(event.endDate) });
    }
  }

  const startInteraction = (e: React.PointerEvent, task: Task, mode: DayDragMode) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggedRef.current = false;
    setDrag({ taskId: task.id, mode, deltaMin: 0, startClientY: e.clientY });
  };

  const moveInteraction = (e: React.PointerEvent, task: Task) => {
    if (!drag || drag.taskId !== task.id) return;
    e.stopPropagation();
    if (Math.abs(e.clientY - drag.startClientY) > CLICK_DRAG_THRESHOLD) draggedRef.current = true;
    const deltaPx = e.clientY - drag.startClientY;
    const rawMin = (deltaPx / HOUR_H) * 60;
    const deltaMin = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
    setDrag((d) => (d ? { ...d, deltaMin } : d));
  };

  const endInteraction = (e: React.PointerEvent, task: Task, start: Date, end: Date) => {
    e.stopPropagation();
    if (!drag || drag.taskId !== task.id) return;
    if (!draggedRef.current) {
      onOpenTask(task.id);
      setDrag(null);
      return;
    }
    const clamp = (min: number) => Math.max(0, Math.min(24 * 60, min));
    let newStartMin = minutesOfDay(start);
    let newEndMin = minutesOfDay(end);
    if (drag.mode === 'move') {
      newStartMin = clamp(newStartMin + drag.deltaMin);
      newEndMin = clamp(newEndMin + drag.deltaMin);
    } else if (drag.mode === 'resize-start') {
      newStartMin = Math.min(clamp(newStartMin + drag.deltaMin), newEndMin);
    } else {
      newEndMin = Math.max(clamp(newEndMin + drag.deltaMin), newStartMin);
    }
    const newStart = new Date(day);
    newStart.setHours(0, newStartMin, 0, 0);
    const newEnd = new Date(day);
    newEnd.setHours(0, newEndMin, 0, 0);
    onCommitDates(task.id, newStart.toISOString(), newEnd.toISOString());
    setDrag(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {(allDayTasks.length > 0 || allDayEvents.length > 0) && (
        <div className="shrink-0 border-b border-neutral-800 px-3 py-2 space-y-1">
          <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1">All day</div>
          {allDayTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => onOpenTask(task.id)}
              title={task.title}
              className="w-full text-left truncate text-[11px] text-white font-medium px-2 py-1 rounded cursor-pointer"
              style={{ backgroundColor: taskColorOf(task) }}
            >
              {task.title}
            </button>
          ))}
          {allDayEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => onOpenEvent(event.id)}
              title={event.title}
              className="w-full text-left truncate text-[11px] text-white font-medium px-2 py-1 rounded cursor-pointer"
              style={{ backgroundColor: eventColorOf(event) }}
            >
              {event.title}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1" style={{ minHeight: 24 * HOUR_H }}>
        <div className="absolute inset-0">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="relative border-b border-neutral-800/50" style={{ height: HOUR_H }}>
              <span className="absolute -top-2 left-1 text-[9px] text-neutral-600 font-mono">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {isSameDay(day, today) && (
          <div
            className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
            style={{ top: (minutesOfDay(today) / 60) * HOUR_H }}
          >
            <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
          </div>
        )}

        <div className="absolute left-12 right-2 top-0 bottom-0">
          {(() => {
            // Tasks and Events share one column layout so a task and an event at the same time
            // never visually overlap — same reasoning the month/week grid merges them into one
            // range list for lane assignment (see CalendarView.tsx).
            const columns = layoutDayColumns([
              ...timedTasks.map(({ task, start, end }) => {
                const startMin = minutesOfDay(start);
                return { id: task.id, startMin, endMin: Math.max(minutesOfDay(end), startMin + 30) };
              }),
              ...timedEvents.map(({ event, start, end }) => {
                const startMin = minutesOfDay(start);
                return { id: event.id, startMin, endMin: Math.max(minutesOfDay(end), startMin + 30) };
              }),
            ]);
            const eventBlocks = timedEvents.map(({ event, start, end }) => {
              const startMin = minutesOfDay(start);
              const endMin = Math.max(minutesOfDay(end), startMin + 30);
              const top = (startMin / 60) * HOUR_H;
              const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_H);
              const { col, cols } = columns.get(event.id) ?? { col: 0, cols: 1 };
              return (
                <div
                  key={event.id}
                  className="absolute"
                  style={{ top, height, left: `${(col / cols) * 100}%`, width: `${(1 / cols) * 100}%`, paddingRight: cols > 1 ? 2 : 0 }}
                >
                  <button
                    onClick={() => onOpenEvent(event.id)}
                    title={event.title}
                    className="relative w-full h-full rounded px-2 py-1 text-[10px] text-white font-medium truncate cursor-pointer text-left"
                    style={{ backgroundColor: eventColorOf(event) }}
                  >
                    {event.title}
                  </button>
                </div>
              );
            });
            const taskBlocks = timedTasks.map(({ task, start, end }) => {
            const isDraggingThis = drag?.taskId === task.id;
            let startMin = minutesOfDay(start);
            let endMin = Math.max(minutesOfDay(end), startMin + 30);
            if (isDraggingThis) {
              if (drag!.mode === 'move') {
                startMin += drag!.deltaMin;
                endMin += drag!.deltaMin;
              } else if (drag!.mode === 'resize-start') {
                startMin = Math.min(startMin + drag!.deltaMin, endMin - 15);
              } else {
                endMin = Math.max(endMin + drag!.deltaMin, startMin + 15);
              }
            }
            const top = (startMin / 60) * HOUR_H;
            const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_H);
            const color = taskColorOf(task);
            const { col, cols } = columns.get(task.id) ?? { col: 0, cols: 1 };

            return (
              <div
                key={task.id}
                className="absolute group/block"
                style={{
                  top,
                  height,
                  left: `${(col / cols) * 100}%`,
                  width: `${(1 / cols) * 100}%`,
                  paddingRight: cols > 1 ? 2 : 0,
                }}
              >
                <div
                  onPointerDown={(e) => startInteraction(e, task, 'move')}
                  onPointerMove={(e) => moveInteraction(e, task)}
                  onPointerUp={(e) => endInteraction(e, task, start, end)}
                  title={task.title}
                  className={`relative h-full rounded px-2 py-1 text-[10px] text-white font-medium truncate cursor-grab active:cursor-grabbing select-none ${
                    isDraggingThis ? 'opacity-70 ring-2 ring-white/70' : ''
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {task.title}
                  <div
                    onPointerDown={(e) => startInteraction(e, task, 'resize-start')}
                    onPointerMove={(e) => moveInteraction(e, task)}
                    onPointerUp={(e) => endInteraction(e, task, start, end)}
                    className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize"
                  />
                  <div
                    onPointerDown={(e) => startInteraction(e, task, 'resize-end')}
                    onPointerMove={(e) => moveInteraction(e, task)}
                    onPointerUp={(e) => endInteraction(e, task, start, end)}
                    className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize"
                  />
                </div>
              </div>
            );
            });
            return [...eventBlocks, ...taskBlocks];
          })()}
        </div>
      </div>
    </div>
  );
}

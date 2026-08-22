'use client';

import { useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import GoogleIcon from '../icons/GoogleIcon';
import GoogleDashedBorder from '../icons/GoogleDashedBorder';
import { isSameDay } from '../../lib/calendarDates';
import { layoutDayColumns } from '../../lib/ganttLayout';
import { withAlpha } from '../../lib/colorAlpha';
import { BASE_BG_ALPHA, BASE_BORDER_ALPHA, HOVER_BG_ALPHA, HOVER_BORDER_ALPHA } from './WeekRow';
import type { Task, Event } from '../../store/useTaskStore';

const HOUR_H = 48;
const SNAP_MIN = 15;
const CLICK_DRAG_THRESHOLD = 4;

type DayDragMode = 'move' | 'resize-start' | 'resize-end';
type DayDragState = { taskId: string; mode: DayDragMode; deltaMin: number; startClientY: number };

// "No time set" has two conventions in this app's own data: this app's own date picker
// (DatePickerPopover) always stores it as LOCAL midnight, but ClickUp CSV imports
// (`parseEpochMs` in the import route) carry raw epoch-ms timestamps that land on UTC midnight
// regardless of local timezone — which reads as a nonzero *local* hour anywhere east of UTC (02:00
// in Oslo during DST) and got misread as "has a specific time." Treat either convention as
// all-day rather than trusting only the local one — a real timed task essentially never lands
// exactly on UTC midnight by coincidence, so this stays safe for genuinely-timed tasks/events too.
const hasTimeOfDay = (d: Date) => {
  const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  return !isLocalMidnight && !isUtcMidnight;
};
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

type DayTimelineProps = {
  day: Date;
  tasks: Task[];
  taskColorOf: (task: Task) => string;
  onOpenTask: (id: string) => void;
  onCommitTaskDates: (taskId: string, startISO: string | null, dueISO: string | null) => void;
  // Timed Events can be resized (stretch/shrink either edge) same as timed Tasks, via
  // onCommitEventDates below — all-day Events (AllDayChip) stay click-only, same as all-day
  // Tasks, since "resize" has no meaning for a day-wide chip. Never move-draggable either way,
  // matching WeekRow.tsx's EventBar (a deliberate edit via the resize handle, not something that
  // drifts from an accidental drag on the whole block).
  events: Event[];
  eventColorOf: (event: Event) => string;
  onOpenEvent: (id: string) => void;
  onCommitEventDates: (eventId: string, startISO: string, endISO: string) => void;
};

export default function DayTimeline({
  day,
  tasks,
  taskColorOf,
  onOpenTask,
  onCommitTaskDates,
  events,
  eventColorOf,
  onOpenEvent,
  onCommitEventDates,
}: DayTimelineProps) {
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

  // Shared by DayTaskBlock (move + both resize edges) and DayEventBlock (resize edges only) —
  // generic over id, same "figure out which kind this is, then call the right callback" pattern
  // WeekRow.tsx's own endInteraction uses.
  const startInteraction = (e: React.PointerEvent, id: string, mode: DayDragMode) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggedRef.current = false;
    setDrag({ taskId: id, mode, deltaMin: 0, startClientY: e.clientY });
  };

  const moveInteraction = (e: React.PointerEvent, id: string) => {
    if (!drag || drag.taskId !== id) return;
    e.stopPropagation();
    if (Math.abs(e.clientY - drag.startClientY) > CLICK_DRAG_THRESHOLD) draggedRef.current = true;
    const deltaPx = e.clientY - drag.startClientY;
    const rawMin = (deltaPx / HOUR_H) * 60;
    const deltaMin = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
    setDrag((d) => (d ? { ...d, deltaMin } : d));
  };

  const endInteraction = (e: React.PointerEvent, id: string, start: Date, end: Date) => {
    e.stopPropagation();
    if (!drag || drag.taskId !== id) return;
    const isTask = timedTasks.some(({ task }) => task.id === id);
    if (!draggedRef.current) {
      if (isTask) onOpenTask(id);
      else onOpenEvent(id);
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
    if (isTask) onCommitTaskDates(id, newStart.toISOString(), newEnd.toISOString());
    else onCommitEventDates(id, newStart.toISOString(), newEnd.toISOString());
    setDrag(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {(allDayTasks.length > 0 || allDayEvents.length > 0) && (
        <div className="shrink-0 border-b border-neutral-800 px-3 py-2 space-y-1">
          <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1">All day</div>
          {allDayTasks.map((task) => (
            <AllDayChip key={task.id} label={task.title} color={taskColorOf(task)} onClick={() => onOpenTask(task.id)} />
          ))}
          {allDayEvents.map((event) => (
            <AllDayChip
              key={event.id}
              label={event.title}
              color={eventColorOf(event)}
              onClick={() => onOpenEvent(event.id)}
              isEvent
              fromGoogle={event.importedFromGoogle}
            />
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
          // Subtle, brand-accent blue rather than an alarm-red line — reads as "here's now"
          // without competing for attention against the task/event cards themselves.
          <div
            className="absolute left-0 right-0 border-t border-blue-500/70 z-20 pointer-events-none"
            style={{ top: (minutesOfDay(today) / 60) * HOUR_H }}
          >
            <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-blue-500" />
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
              const isDraggingThis = drag?.taskId === event.id;
              let startMin = minutesOfDay(start);
              let endMin = Math.max(minutesOfDay(end), startMin + 30);
              if (isDraggingThis) {
                // No 'move' branch — Events don't move-drag here (see DayTimelineProps' own
                // comment), only the two resize modes ever apply to an event id.
                if (drag!.mode === 'resize-start') {
                  startMin = Math.min(startMin + drag!.deltaMin, endMin - 15);
                } else if (drag!.mode === 'resize-end') {
                  endMin = Math.max(endMin + drag!.deltaMin, startMin + 15);
                }
              }
              const top = (startMin / 60) * HOUR_H;
              const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_H);
              const { col, cols } = columns.get(event.id) ?? { col: 0, cols: 1 };
              return (
                <DayEventBlock
                  key={event.id}
                  event={event}
                  start={start}
                  end={end}
                  color={eventColorOf(event)}
                  isDraggingThis={isDraggingThis}
                  onOpenEvent={onOpenEvent}
                  onStartInteraction={startInteraction}
                  onMoveInteraction={moveInteraction}
                  onEndInteraction={endInteraction}
                  style={{ top, height, left: `${(col / cols) * 100}%`, width: `${(1 / cols) * 100}%`, paddingRight: cols > 1 ? 2 : 0 }}
                />
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
              <DayTaskBlock
                key={task.id}
                task={task}
                start={start}
                end={end}
                color={color}
                isDraggingThis={isDraggingThis}
                style={{
                  top,
                  height,
                  left: `${(col / cols) * 100}%`,
                  width: `${(1 / cols) * 100}%`,
                  paddingRight: cols > 1 ? 2 : 0,
                }}
                onStartInteraction={startInteraction}
                onMoveInteraction={moveInteraction}
                onEndInteraction={endInteraction}
              />
            );
            });
            return [...eventBlocks, ...taskBlocks];
          })()}
        </div>
      </div>
    </div>
  );
}

// Same tinted background + colored border + colored text treatment as Month/Week's own
// TaskBar/EventBar (WeekRow.tsx) — a task/event should look like the same object whichever
// granularity it's viewed at, not switch to a solid white-on-color fill just because it's Day
// view. Extracted to its own component (rather than inlined in a `.map()`) since the hover state
// needs a real hook.
function AllDayChip({
  label,
  color,
  onClick,
  isEvent,
  fromGoogle,
}: {
  label: string;
  color: string;
  onClick: () => void;
  isEvent?: boolean;
  fromGoogle?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      // Dashed border + CalendarClock icon for Events, same Task-vs-Event tell as everywhere
      // else in Planner — plain-color alone isn't reliable since either can be any color.
      className={`relative w-full text-left truncate text-[11px] font-medium px-2 py-1 rounded-md border cursor-pointer transition-colors flex items-center gap-1 ${
        isEvent ? 'border-dashed' : ''
      }`}
      style={{
        backgroundColor: withAlpha(color, hovered ? HOVER_BG_ALPHA : BASE_BG_ALPHA),
        borderColor: fromGoogle ? 'transparent' : withAlpha(color, hovered ? HOVER_BORDER_ALPHA : BASE_BORDER_ALPHA),
        color,
      }}
    >
      {fromGoogle && <GoogleDashedBorder />}
      {isEvent && (fromGoogle ? <GoogleIcon className="w-2.5 h-2.5 shrink-0" /> : <CalendarClock className="w-2.5 h-2.5 shrink-0" />)}
      <span className="truncate">{label}</span>
    </button>
  );
}

function DayEventBlock({
  event,
  start,
  end,
  color,
  isDraggingThis,
  onOpenEvent,
  onStartInteraction,
  onMoveInteraction,
  onEndInteraction,
  style,
}: {
  event: Event;
  start: Date;
  end: Date;
  color: string;
  isDraggingThis: boolean;
  onOpenEvent: (id: string) => void;
  onStartInteraction: (e: React.PointerEvent, id: string, mode: DayDragMode) => void;
  onMoveInteraction: (e: React.PointerEvent, id: string) => void;
  onEndInteraction: (e: React.PointerEvent, id: string, start: Date, end: Date) => void;
  style: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="absolute" style={style}>
      <button
        onClick={() => onOpenEvent(event.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={event.title}
        // Dashed border + CalendarClock icon — same Task-vs-Event tell as WeekRow.tsx's EventBar,
        // kept visually consistent across every Planner granularity.
        className={`relative w-full h-full rounded-md px-2.5 py-1.5 text-[10px] font-medium truncate cursor-pointer text-left border border-dashed transition-colors flex items-center gap-1 ${
          isDraggingThis ? 'opacity-70 ring-2 ring-white/70' : ''
        }`}
        style={{
          backgroundColor: withAlpha(color, hovered ? HOVER_BG_ALPHA : BASE_BG_ALPHA),
          borderColor: event.importedFromGoogle ? 'transparent' : withAlpha(color, hovered ? HOVER_BORDER_ALPHA : BASE_BORDER_ALPHA),
          color,
        }}
      >
        {event.importedFromGoogle && <GoogleDashedBorder />}
        {event.importedFromGoogle ? (
          <GoogleIcon className="w-2.5 h-2.5 shrink-0" />
        ) : (
          <CalendarClock className="w-2.5 h-2.5 shrink-0" />
        )}
        <span className="truncate">{event.title}</span>
      </button>
      {/* Resize only (stretch/shrink either edge) — no move handler on the body, same
          deliberate-edit-only reasoning as WeekRow.tsx's EventBar. */}
      <div
        onPointerDown={(e) => onStartInteraction(e, event.id, 'resize-start')}
        onPointerMove={(e) => onMoveInteraction(e, event.id)}
        onPointerUp={(e) => onEndInteraction(e, event.id, start, end)}
        className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize"
      />
      <div
        onPointerDown={(e) => onStartInteraction(e, event.id, 'resize-end')}
        onPointerMove={(e) => onMoveInteraction(e, event.id)}
        onPointerUp={(e) => onEndInteraction(e, event.id, start, end)}
        className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize"
      />
    </div>
  );
}

function DayTaskBlock({
  task,
  start,
  end,
  color,
  isDraggingThis,
  style,
  onStartInteraction,
  onMoveInteraction,
  onEndInteraction,
}: {
  task: Task;
  start: Date;
  end: Date;
  color: string;
  isDraggingThis: boolean;
  style: React.CSSProperties;
  onStartInteraction: (e: React.PointerEvent, id: string, mode: DayDragMode) => void;
  onMoveInteraction: (e: React.PointerEvent, id: string) => void;
  onEndInteraction: (e: React.PointerEvent, id: string, start: Date, end: Date) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const height = typeof style.height === 'number' ? style.height : 0;
  return (
    <div className="absolute group/block" style={style}>
      <div
        onPointerDown={(e) => onStartInteraction(e, task.id, 'move')}
        onPointerMove={(e) => onMoveInteraction(e, task.id)}
        onPointerUp={(e) => onEndInteraction(e, task.id, start, end)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={task.title}
        className={`relative h-full rounded-md px-2.5 py-1.5 text-[10px] font-medium cursor-grab active:cursor-grabbing select-none flex flex-col border transition-colors ${
          isDraggingThis ? 'opacity-70 ring-2 ring-white/70' : ''
        }`}
        style={{
          backgroundColor: withAlpha(color, hovered ? HOVER_BG_ALPHA : BASE_BG_ALPHA),
          borderColor: withAlpha(color, hovered ? HOVER_BORDER_ALPHA : BASE_BORDER_ALPHA),
          color,
        }}
      >
        <span className="truncate">{task.title}</span>
        {task.assignees.length > 0 && height >= 34 && (
          <span className="flex items-center -space-x-1 mt-0.5">
            {task.assignees.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.name}
                className="w-3.5 h-3.5 rounded-full border border-neutral-900/60 text-[7px] font-bold flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: a.color }}
              >
                {a.initials}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="w-3.5 h-3.5 rounded-full border border-neutral-900/60 bg-neutral-700 text-[7px] font-bold flex items-center justify-center text-white shrink-0">
                +{task.assignees.length - 3}
              </span>
            )}
          </span>
        )}
        <div
          onPointerDown={(e) => onStartInteraction(e, task.id, 'resize-start')}
          onPointerMove={(e) => onMoveInteraction(e, task.id)}
          onPointerUp={(e) => onEndInteraction(e, task.id, start, end)}
          className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize"
        />
        <div
          onPointerDown={(e) => onStartInteraction(e, task.id, 'resize-end')}
          onPointerMove={(e) => onMoveInteraction(e, task.id)}
          onPointerUp={(e) => onEndInteraction(e, task.id, start, end)}
          className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      </div>
    </div>
  );
}

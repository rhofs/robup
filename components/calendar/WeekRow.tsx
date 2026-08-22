'use client';

import { useRef, useState } from 'react';
import { Plus, Pin, CalendarClock } from 'lucide-react';
import GoogleIcon from '../icons/GoogleIcon';
import GoogleDashedBorder from '../icons/GoogleDashedBorder';
import { getISOWeek, isSameDay } from '../../lib/calendarDates';
import { withAlpha } from '../../lib/colorAlpha';
import type { ClippedSegment, DragMode, DragState } from '../../lib/ganttLayout';
import type { Task, Event } from '../../store/useTaskStore';

// Landed in the expert visual-refinement pass's 22-26px/3-5px target range. CalendarView.tsx's
// Fit mode (see its own comment) derives how many lanes actually fit a given row height from
// these two constants, same as the non-Fit MONTH_MAX_LANES/WEEK_MAX_LANES caps always have.
export const BAR_H = 24;
export const BAR_GAP = 4;
export const DAY_NUM_H = 26;
export const GUTTER_WIDTH = 34;
const CLICK_DRAG_THRESHOLD = 4;

type WeekRowProps = {
  weekDays: Date[];
  segments: ClippedSegment[];
  tasksById: Map<string, Task>;
  taskColorOf: (task: Task) => string;
  // Events share the exact same segment list/lane packing as Tasks (see CalendarView.tsx's
  // merged `ranges`) but never drag — a segment whose id isn't in tasksById is looked up here
  // instead and rendered as a plain clickable bar, no pointer handlers wired up at all.
  eventsById: Map<string, Event>;
  eventColorOf: (event: Event) => string;
  onOpenEvent: (id: string) => void;
  today: Date;
  // The very last row's own bottom border would sit right on top of the grid container's own
  // bottom border (see CalendarView.tsx) — an unintentional "double line" right under each other.
  // Skipped here so the container's border is the only line closing off the grid's bottom edge.
  isLastRow: boolean;
  showWeekNumbers: boolean;
  monthAnchor?: Date;
  maxVisibleLanes: number;
  height: number;
  activeDrag: DragState | null;
  onOpenTask: (id: string) => void;
  onDrillDay: (day: Date) => void;
  onQuickAddDay: (day: Date) => void;
  onDragStart: (id: string, mode: DragMode, e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  // Takes the dragged id, not a whole Task — CalendarView.tsx looks up whether it's a Task or an
  // Event itself (see its own handleDragEnd), same "generic by id" pattern ranges/lanes already
  // use everywhere else in this file.
  onDragEnd: (id: string, mode: DragMode) => void;
  onUnpinLane: (taskId: string) => void;
  // Resize/move-drag handles are mouse-cursor-sized hit targets that don't work on touch — on
  // mobile every bar falls through to a plain tap-to-open instead (see TaskBar/EventBar below).
  isMobile: boolean;
};

export default function WeekRow({
  weekDays,
  segments,
  tasksById,
  taskColorOf,
  eventsById,
  eventColorOf,
  onOpenEvent,
  today,
  isLastRow,
  showWeekNumbers,
  monthAnchor,
  maxVisibleLanes,
  height,
  activeDrag,
  onOpenTask,
  onDrillDay,
  onQuickAddDay,
  onDragStart,
  onDragMove,
  onDragEnd,
  onUnpinLane,
  isMobile,
}: WeekRowProps) {
  const pointerDownXYRef = useRef({ x: 0, y: 0 });
  const draggedRef = useRef(false);

  const visibleSegments = segments.filter((s) => s.lane < maxVisibleLanes);
  const overflowByDay = new Array(7).fill(0);
  segments
    .filter((s) => s.lane >= maxVisibleLanes)
    .forEach((s) => {
      for (let i = s.colStart; i < s.colStart + s.colSpan; i++) overflowByDay[i] = (overflowByDay[i] || 0) + 1;
    });

  // Computed from THIS row's own bars, not a value shared across the whole month — otherwise a
  // quiet row's "+N more" chip gets pushed down to match however tall the busiest row in the
  // month happens to be, landing near the row's own bottom edge/boundary with the next row
  // instead of sitting right under its own bars.
  const laneCountInRow = Math.max(1, Math.min(maxVisibleLanes, visibleSegments.reduce((max, s) => Math.max(max, s.lane + 1), 0)));
  const overflowTop = DAY_NUM_H + laneCountInRow * (BAR_H + BAR_GAP);

  // Shared by TaskBar (move + both resize edges) and EventBar (resize edges only, no move — see
  // EventBar's own comment). Generic over id: "is this a click or a drag" and "which callback
  // opens this thing" only need the id, not the whole Task/Event object.
  const startInteraction = (e: React.PointerEvent, id: string, mode: DragMode) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerDownXYRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
    onDragStart(id, mode, e);
  };

  const moveInteraction = (e: React.PointerEvent, id: string) => {
    if (!activeDrag || activeDrag.taskId !== id) return;
    e.stopPropagation();
    const dx = e.clientX - pointerDownXYRef.current.x;
    const dy = e.clientY - pointerDownXYRef.current.y;
    if (Math.abs(dx) > CLICK_DRAG_THRESHOLD || Math.abs(dy) > CLICK_DRAG_THRESHOLD) draggedRef.current = true;
    onDragMove(e);
  };

  const endInteraction = (e: React.PointerEvent, id: string, mode: DragMode) => {
    e.stopPropagation();
    if (!activeDrag || activeDrag.taskId !== id) return;
    if (draggedRef.current) {
      onDragEnd(id, mode);
    } else {
      if (tasksById.has(id)) onOpenTask(id);
      else onOpenEvent(id);
      onDragEnd(id, mode);
    }
  };

  return (
    <div className="relative flex" style={{ height }}>
      {/* Week numbers are metadata, not content — 10px, low-contrast, no border of their own
          (the week-row boundary below is what actually separates weeks). */}
      <div
        className={`shrink-0 flex items-start justify-center pt-1.5 text-[10px] text-neutral-700 font-mono ${isLastRow ? '' : 'border-b border-neutral-800/50'}`}
        style={{ width: GUTTER_WIDTH }}
      >
        {showWeekNumbers && getISOWeek(weekDays[0])}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-0 grid grid-cols-7">
          {weekDays.map((day, i) => {
            const outOfMonth = monthAnchor ? day.getMonth() !== monthAnchor.getMonth() : false;
            const isToday = isSameDay(day, today);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            // Priority mirrors how the day-number badge already reads: out-of-month is the
            // dimmest/most muted signal, today is the strongest, weekend is a subtle in-between
            // tint (same idea as Google Calendar/Notion's faint weekend column shading) — never
            // combined, so the grid doesn't get visually noisy.
            const cellBg = outOfMonth ? 'bg-neutral-950/30' : isToday ? 'bg-blue-500/[0.035]' : isWeekend ? 'bg-white/[0.015]' : '';
            return (
              <div key={i} className="relative group/day">
                <button
                  onClick={() => onDrillDay(day)}
                  // Vertical separators kept, but deliberately faint — the grid should register
                  // subconsciously, not read as a spreadsheet of boxed cells. The week-row
                  // boundary (this same border-b, once per row) stays clearly stronger so weeks
                  // are still easy to tell apart at a glance.
                  className={`w-full h-full flex flex-col items-start text-left border-r border-r-neutral-800/[0.12] last:border-r-0 px-2 pt-1 cursor-pointer hover:bg-neutral-800/20 transition ${
                    isLastRow ? '' : 'border-b border-b-neutral-800/50'
                  } ${cellBg}`}
                >
                  <span
                    className={`text-[11px] font-mono inline-flex items-center justify-center w-5 h-5 rounded-full ${
                      isToday ? 'bg-blue-500 text-white font-semibold' : outOfMonth ? 'text-neutral-600' : 'text-neutral-300 font-semibold'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAddDay(day);
                  }}
                  title="New task"
                  // Bottom-right, not top-right — the date number already owns the top of the
                  // cell, and the bottom is where a day's own content visually "ends," so that's
                  // where adding something new to it belongs. z-10 (matching the overflow chip's
                  // own z-index) so it stays clickable on the rare day that both has overflow and
                  // is being hovered at once, rather than the two silently fighting over the same
                  // corner.
                  className="absolute bottom-1 right-1 z-10 w-4 h-4 rounded bg-neutral-800 text-neutral-400 hover:bg-blue-600 hover:text-white flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
                {/* Nested inside this day's own cell (not a separate row-wide strip) so it reads
                    as part of that day, not a floating element below the grid. Explicit z-10:
                    this exact chip has previously ended up silently painted over by the day
                    cell's own full-size button despite later DOM order — root cause never fully
                    pinned down, so keep the defensive z-index rather than relying on DOM order. */}
                {overflowByDay[i] > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDrillDay(day);
                    }}
                    className="absolute left-1 right-1 z-10 text-left cursor-pointer"
                    style={{ top: overflowTop }}
                  >
                    <span className="inline-flex items-center gap-1 text-[9px] leading-none text-neutral-300 bg-neutral-800/70 hover:bg-neutral-700/80 border-l-2 border-neutral-600 rounded-sm pl-1 pr-1.5 py-[3px] transition">
                      <span className="w-1.5 h-1 rounded-[1px] bg-neutral-500 shrink-0" />
                      +{overflowByDay[i]} more
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="absolute inset-x-0 pointer-events-none" style={{ top: DAY_NUM_H, bottom: 0 }}>
          {visibleSegments.map((seg) => {
            const task = tasksById.get(seg.taskId);
            const event = task ? undefined : eventsById.get(seg.taskId);
            if (!task && !event) return null;

            const barStyle = {
              left: `${(seg.colStart / 7) * 100}%`,
              width: `${(seg.colSpan / 7) * 100}%`,
              top: seg.lane * (BAR_H + BAR_GAP),
              height: BAR_H,
              paddingLeft: 2,
              paddingRight: 2,
            };

            // Events can be resized (stretch/shrink either edge) but never moved by dragging the
            // body — see EventBar's own comment on why the split.
            if (event) {
              return (
                <EventBar
                  key={seg.taskId}
                  event={event}
                  seg={seg}
                  barStyle={barStyle}
                  color={eventColorOf(event)}
                  isDraggingThis={activeDrag?.taskId === seg.taskId}
                  onOpenEvent={onOpenEvent}
                  onStartInteraction={startInteraction}
                  onMoveInteraction={moveInteraction}
                  onEndInteraction={endInteraction}
                  isMobile={isMobile}
                />
              );
            }

            return (
              <TaskBar
                key={seg.taskId}
                task={task!}
                seg={seg}
                barStyle={barStyle}
                color={taskColorOf(task!)}
                isDraggingThis={activeDrag?.taskId === seg.taskId}
                onOpenTask={onOpenTask}
                onStartInteraction={startInteraction}
                onMoveInteraction={moveInteraction}
                onEndInteraction={endInteraction}
                onUnpinLane={onUnpinLane}
                isMobile={isMobile}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Tint alphas, per the expert visual-refinement brief: 15-25% background, a somewhat stronger
// border, text at the color's own full saturation (not white) — "information sitting inside the
// calendar," not a solid block on top of it. Hover bumps both up a notch for a touch more
// saturation, per the same brief. Local hover state (not a Tailwind `hover:` class) because the
// color itself is per-task/per-event and dynamic — Tailwind can't vary an arbitrary inline color
// by pseudo-class, so this is the reliable way to get a real hover response out of it.
// Exported so DayTimeline.tsx can render its own task/event blocks with the exact same tint
// treatment — one source of truth for "what does a Siqt calendar bar look like."
export const BASE_BG_ALPHA = 18;
export const BASE_BORDER_ALPHA = 45;
export const HOVER_BG_ALPHA = 32;
export const HOVER_BORDER_ALPHA = 70;

function EventBar({
  event,
  seg,
  barStyle,
  color,
  isDraggingThis,
  onOpenEvent,
  onStartInteraction,
  onMoveInteraction,
  onEndInteraction,
  isMobile,
}: {
  event: Event;
  seg: ClippedSegment;
  barStyle: React.CSSProperties;
  color: string;
  isDraggingThis: boolean;
  onOpenEvent: (id: string) => void;
  onStartInteraction: (e: React.PointerEvent, id: string, mode: DragMode) => void;
  onMoveInteraction: (e: React.PointerEvent, id: string) => void;
  onEndInteraction: (e: React.PointerEvent, id: string, mode: DragMode) => void;
  isMobile: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="absolute pointer-events-auto" style={{ ...barStyle, opacity: isDraggingThis ? 0.35 : 1 }}>
      <button
        onClick={() => onOpenEvent(event.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={event.title}
        // Dashed border (Tasks are always solid) is the at-a-glance Task-vs-Event tell in every
        // Planner granularity, alongside the CalendarClock icon — a plain color difference alone
        // isn't reliable since either can be given any color.
        className={`relative w-full h-full flex items-center gap-1 text-[10px] leading-none font-medium truncate cursor-pointer select-none border border-dashed transition-colors ${
          seg.isStartEdge ? 'rounded-l-md pl-2.5' : 'pl-1.5'
        } ${seg.isEndEdge ? 'rounded-r-md pr-2' : 'pr-1'}`}
        style={{
          backgroundColor: withAlpha(color, hovered ? HOVER_BG_ALPHA : BASE_BG_ALPHA),
          // A Google-imported event gets its own 4-color dashed overlay instead (below) — this
          // element's own border is made transparent rather than removed outright, so the
          // border-width stays reserved and nothing else in the layout shifts.
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
      {/* Resizable (stretch/shrink either edge, same gesture as a Task bar) but never draggable
          by the body — an Event's date range is meant to be a deliberate edit, not something that
          drifts from an accidental drag on the whole bar the way a Task's due-date-driven bar
          does. Skipped on mobile entirely — a 2px-wide edge strip isn't a workable touch target,
          and the button above already opens the event on tap. */}
      {!isMobile && seg.isStartEdge && (
        <div
          onPointerDown={(e) => onStartInteraction(e, event.id, 'resize-start')}
          onPointerMove={(e) => onMoveInteraction(e, event.id)}
          onPointerUp={(e) => onEndInteraction(e, event.id, 'resize-start')}
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
        />
      )}
      {!isMobile && seg.isEndEdge && (
        <div
          onPointerDown={(e) => onStartInteraction(e, event.id, 'resize-end')}
          onPointerMove={(e) => onMoveInteraction(e, event.id)}
          onPointerUp={(e) => onEndInteraction(e, event.id, 'resize-end')}
          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
        />
      )}
    </div>
  );
}

function TaskBar({
  task,
  seg,
  barStyle,
  color,
  isDraggingThis,
  onOpenTask,
  onStartInteraction,
  onMoveInteraction,
  onEndInteraction,
  onUnpinLane,
  isMobile,
}: {
  task: Task;
  seg: ClippedSegment;
  barStyle: React.CSSProperties;
  color: string;
  isDraggingThis: boolean;
  onOpenTask: (id: string) => void;
  onStartInteraction: (e: React.PointerEvent, id: string, mode: DragMode) => void;
  onMoveInteraction: (e: React.PointerEvent, id: string) => void;
  onEndInteraction: (e: React.PointerEvent, id: string, mode: DragMode) => void;
  onUnpinLane: (taskId: string) => void;
  isMobile: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const assignees = task.assignees;
  return (
    <div className="absolute pointer-events-auto group/bar" style={{ ...barStyle, opacity: isDraggingThis ? 0.35 : 1 }}>
      <div
        // Mobile never wires up the move-drag pointer handlers — a bar tap just opens the task,
        // same as a plain click does on desktop when no actual drag occurred.
        onPointerDown={isMobile ? undefined : (e) => onStartInteraction(e, task.id, 'move')}
        onPointerMove={isMobile ? undefined : (e) => onMoveInteraction(e, task.id)}
        onPointerUp={isMobile ? undefined : (e) => onEndInteraction(e, task.id, 'move')}
        onClick={isMobile ? () => onOpenTask(task.id) : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={task.title}
        // "Information sitting inside the calendar" — a tinted background + colored border +
        // colored text, all derived from the one cascaded color, rather than a solid fill.
        className={`relative h-full flex items-center gap-1 text-[10px] leading-none font-medium truncate cursor-grab active:cursor-grabbing select-none border transition-colors ${
          seg.isStartEdge ? 'rounded-l-md pl-2.5' : 'pl-1.5'
        } ${seg.isEndEdge ? 'rounded-r-md pr-2' : 'pr-1'}`}
        style={{
          backgroundColor: withAlpha(color, hovered ? HOVER_BG_ALPHA : BASE_BG_ALPHA),
          borderColor: withAlpha(color, hovered ? HOVER_BORDER_ALPHA : BASE_BORDER_ALPHA),
          color,
        }}
      >
        <span className="truncate flex-1">{task.title}</span>

        {/* Assignee avatar(s) — only where there's real room (the segment's trailing edge), same
            "don't clutter a 2-day sliver" restraint as the overflow chip. First initial, +N badge
            for the rest — same convention PersonAvatar clusters use elsewhere in this app (Office
            rooms). Kept as solid color chips (not tinted) — they're small enough that a tint would
            just read as noise, and the whole point of an avatar is the solid, recognizable color. */}
        {seg.isEndEdge && assignees.length > 0 && (
          <span className="flex items-center -space-x-1 shrink-0">
            {assignees.slice(0, 1).map((a) => (
              <span
                key={a.id}
                title={a.name}
                className="w-3.5 h-3.5 rounded-full border border-neutral-900/60 text-[7px] font-bold flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: a.color }}
              >
                {a.initials}
              </span>
            ))}
            {assignees.length > 1 && (
              <span className="w-3.5 h-3.5 rounded-full border border-neutral-900/60 bg-neutral-700 text-[7px] font-bold flex items-center justify-center text-white shrink-0">
                +{assignees.length - 1}
              </span>
            )}
          </span>
        )}

        {!isMobile && seg.isStartEdge && (
          <div
            onPointerDown={(e) => onStartInteraction(e, task.id, 'resize-start')}
            onPointerMove={(e) => onMoveInteraction(e, task.id)}
            onPointerUp={(e) => onEndInteraction(e, task.id, 'resize-start')}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
          />
        )}
        {!isMobile && seg.isEndEdge && (
          <div
            onPointerDown={(e) => onStartInteraction(e, task.id, 'resize-end')}
            onPointerMove={(e) => onMoveInteraction(e, task.id)}
            onPointerUp={(e) => onEndInteraction(e, task.id, 'resize-end')}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
          />
        )}
      </div>

      {/* Manually-pinned lane indicator (see Task.calendarLane / assignLanes) — a sibling of the
          draggable inner div, not nested inside it, so its own click never triggers the drag
          handlers above. Only shown on hover, same corner-badge convention as PersonAvatar's DND
          dot elsewhere in this app. */}
      {task.calendarLane !== null && task.calendarLane !== undefined && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnpinLane(task.id);
          }}
          title="Manually pinned to this lane — click to let it auto-arrange again"
          className="absolute -top-1 -right-1 z-10 w-3 h-3 rounded-full bg-neutral-900 border border-neutral-600 text-neutral-300 hover:text-white hover:border-white flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition cursor-pointer"
        >
          <Pin className="w-2 h-2" />
        </button>
      )}
    </div>
  );
}

'use client';

import { useRef } from 'react';
import { Plus, Pin } from 'lucide-react';
import { getISOWeek, isSameDay } from '../../lib/calendarDates';
import type { ClippedSegment, DragMode, DragState } from '../../lib/ganttLayout';
import type { Task } from '../../store/useTaskStore';

export const BAR_H = 13;
export const BAR_GAP = 3;
export const DAY_NUM_H = 26;
export const GUTTER_WIDTH = 34;
const CLICK_DRAG_THRESHOLD = 4;

type WeekRowProps = {
  weekDays: Date[];
  segments: ClippedSegment[];
  tasksById: Map<string, Task>;
  taskColorOf: (task: Task) => string;
  today: Date;
  monthAnchor?: Date;
  maxVisibleLanes: number;
  height: number;
  activeDrag: DragState | null;
  onOpenTask: (id: string) => void;
  onDrillDay: (day: Date) => void;
  onQuickAddDay: (day: Date) => void;
  onDragStart: (taskId: string, mode: DragMode, e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: (task: Task, mode: DragMode) => void;
  onUnpinLane: (taskId: string) => void;
};

export default function WeekRow({
  weekDays,
  segments,
  tasksById,
  taskColorOf,
  today,
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

  const startInteraction = (e: React.PointerEvent, task: Task, mode: DragMode) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerDownXYRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
    onDragStart(task.id, mode, e);
  };

  const moveInteraction = (e: React.PointerEvent, task: Task) => {
    if (!activeDrag || activeDrag.taskId !== task.id) return;
    e.stopPropagation();
    const dx = e.clientX - pointerDownXYRef.current.x;
    const dy = e.clientY - pointerDownXYRef.current.y;
    if (Math.abs(dx) > CLICK_DRAG_THRESHOLD || Math.abs(dy) > CLICK_DRAG_THRESHOLD) draggedRef.current = true;
    onDragMove(e);
  };

  const endInteraction = (e: React.PointerEvent, task: Task, mode: DragMode) => {
    e.stopPropagation();
    if (!activeDrag || activeDrag.taskId !== task.id) return;
    if (draggedRef.current) {
      onDragEnd(task, mode);
    } else {
      onOpenTask(task.id);
      onDragEnd(task, mode);
    }
  };

  return (
    <div className="relative flex" style={{ height }}>
      <div className="shrink-0 flex items-start justify-center pt-1 text-[9px] text-neutral-600 font-mono border-r border-b border-neutral-800/60" style={{ width: GUTTER_WIDTH }}>
        {getISOWeek(weekDays[0])}
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
            const cellBg = outOfMonth ? 'bg-neutral-950/40' : isToday ? 'bg-blue-500/[0.06]' : isWeekend ? 'bg-white/[0.025]' : '';
            return (
              <div key={i} className="relative group/day">
                <button
                  onClick={() => onDrillDay(day)}
                  className={`w-full h-full flex flex-col items-start text-left border-r border-b border-neutral-800/60 last:border-r-0 px-1.5 pt-1 cursor-pointer hover:bg-neutral-800/30 transition ${cellBg}`}
                >
                  <span
                    className={`text-[10px] font-mono inline-flex items-center justify-center w-5 h-5 rounded-full ${
                      isToday ? 'bg-blue-600 text-white font-semibold' : outOfMonth ? 'text-neutral-600' : 'text-neutral-400'
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
                  className="absolute top-1 right-1 w-4 h-4 rounded bg-neutral-800 text-neutral-400 hover:bg-blue-600 hover:text-white flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition cursor-pointer"
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
            if (!task) return null;
            const isDraggingThis = activeDrag?.taskId === seg.taskId;
            const color = taskColorOf(task);

            return (
              <div
                key={seg.taskId}
                className="absolute pointer-events-auto group/bar"
                style={{
                  left: `${(seg.colStart / 7) * 100}%`,
                  width: `${(seg.colSpan / 7) * 100}%`,
                  top: seg.lane * (BAR_H + BAR_GAP),
                  height: BAR_H,
                  paddingLeft: 2,
                  paddingRight: 2,
                  opacity: isDraggingThis ? 0.35 : 1,
                }}
              >
                <div
                  onPointerDown={(e) => startInteraction(e, task, 'move')}
                  onPointerMove={(e) => moveInteraction(e, task)}
                  onPointerUp={(e) => endInteraction(e, task, 'move')}
                  title={task.title}
                  className={`relative h-full flex items-center text-[9px] leading-none text-white font-medium truncate cursor-grab active:cursor-grabbing select-none ${
                    seg.isStartEdge ? 'rounded-l pl-1.5' : 'pl-1'
                  } ${seg.isEndEdge ? 'rounded-r pr-1.5' : 'pr-1'}`}
                  style={{ backgroundColor: color }}
                >
                  <span className="truncate">{task.title}</span>

                  {seg.isStartEdge && (
                    <div
                      onPointerDown={(e) => startInteraction(e, task, 'resize-start')}
                      onPointerMove={(e) => moveInteraction(e, task)}
                      onPointerUp={(e) => endInteraction(e, task, 'resize-start')}
                      className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
                    />
                  )}
                  {seg.isEndEdge && (
                    <div
                      onPointerDown={(e) => startInteraction(e, task, 'resize-end')}
                      onPointerMove={(e) => moveInteraction(e, task)}
                      onPointerUp={(e) => endInteraction(e, task, 'resize-end')}
                      className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                    />
                  )}
                </div>

                {/* Manually-pinned lane indicator (see Task.calendarLane / assignLanes) — a
                    sibling of the draggable inner div, not nested inside it, so its own click
                    never triggers the drag handlers above. Only shown on hover, same corner-badge
                    convention as PersonAvatar's DND dot elsewhere in this app. */}
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
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useRef } from 'react';
import { Plus } from 'lucide-react';
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
  statusColorOf: (name: string) => string;
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
};

export default function WeekRow({
  weekDays,
  segments,
  tasksById,
  statusColorOf,
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
            return (
              <div key={i} className="relative group/day">
                <button
                  onClick={() => onDrillDay(day)}
                  className={`w-full h-full flex flex-col items-start text-left border-r border-b border-neutral-800/60 last:border-r-0 px-1.5 pt-1 cursor-pointer hover:bg-neutral-800/30 transition ${
                    outOfMonth ? 'bg-neutral-950/40' : ''
                  }`}
                >
                  <span
                    className={`text-[10px] font-mono inline-flex items-center justify-center w-5 h-5 rounded-full ${
                      isToday ? 'bg-blue-600 text-white font-semibold' : outOfMonth ? 'text-neutral-600' : 'text-neutral-400'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {overflowByDay[i] > 0 && (
                    <span className="block text-[9px] text-neutral-500 mt-0.5">+{overflowByDay[i]} more</span>
                  )}
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
              </div>
            );
          })}
        </div>

        <div className="absolute inset-x-0 pointer-events-none" style={{ top: DAY_NUM_H, bottom: 0 }}>
          {visibleSegments.map((seg) => {
            const task = tasksById.get(seg.taskId);
            if (!task) return null;
            const isDraggingThis = activeDrag?.taskId === seg.taskId;
            const color = statusColorOf(task.status);

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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

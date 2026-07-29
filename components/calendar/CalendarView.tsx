'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addDays,
  chunkIntoWeeks,
  daysBetween,
  formatFullDate,
  formatMonthYear,
  monthGridDays,
  startOfDay,
  startOfWeek,
} from '../../lib/calendarDates';
import { assignLanes, clipRangeToWeek, type ClippedSegment, type DragMode, type DragState, type TaskRange } from '../../lib/ganttLayout';
import { useTaskStore, StatusDef, Task } from '../../store/useTaskStore';
import WeekRow, { BAR_GAP, BAR_H, DAY_NUM_H, GUTTER_WIDTH } from './WeekRow';
import DayTimeline from './DayTimeline';

type Granularity = 'month' | 'week' | 'day';

const MONTH_MAX_LANES = 4;
const WEEK_MAX_LANES = 8;
const OVERFLOW_H = 14;

type CalendarViewProps = {
  tasks: Task[];
  statuses: StatusDef[];
  onOpenTask: (id: string) => void;
  onRequestCreateTask: (date: Date) => void;
};

export default function CalendarView({ tasks, statuses, onOpenTask, onRequestCreateTask }: CalendarViewProps) {
  const { optimisticSetDates } = useTaskStore();
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()));
  const [weekDrag, setWeekDrag] = useState<DragState | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  // Sticky lane memory across renders — see assignLanes' doc comment for why this matters.
  const previousLanesRef = useRef<Map<string, number>>(new Map());

  const today = useMemo(() => startOfDay(new Date()), []);
  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  const ranges = useMemo(() => {
    const out: TaskRange[] = [];
    for (const task of tasks) {
      const rawStart = task.startDate ? new Date(task.startDate) : task.dueDate ? new Date(task.dueDate) : null;
      const rawEnd = task.dueDate ? new Date(task.dueDate) : task.startDate ? new Date(task.startDate) : null;
      if (!rawStart || !rawEnd) continue;
      const start = startOfDay(rawStart);
      let end = startOfDay(rawEnd);
      if (end < start) end = start;
      out.push({ id: task.id, start, end });
    }
    return out;
  }, [tasks]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const rangesById = useMemo(() => new Map(ranges.map((r) => [r.id, r])), [ranges]);

  const drillToDay = (day: Date) => {
    setFocusDate(day);
    setGranularity('day');
  };

  const step = (dir: 1 | -1) => {
    if (granularity === 'month') setFocusDate((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else if (granularity === 'week') setFocusDate((d) => addDays(d, dir * 7));
    else setFocusDate((d) => addDays(d, dir));
  };

  const headerLabel = useMemo(() => {
    if (granularity === 'month') return formatMonthYear(focusDate);
    if (granularity === 'week') {
      const ws = startOfWeek(focusDate);
      return `${formatFullDate(ws)} – ${formatFullDate(addDays(ws, 6))}`;
    }
    return formatFullDate(focusDate);
  }, [granularity, focusDate]);

  let weeks: Date[][] = [];
  let segmentsByWeek: ClippedSegment[][] = [];
  let maxVisibleLanes = MONTH_MAX_LANES;
  let lanes = new Map<string, number>();

  if (granularity !== 'day') {
    const days = granularity === 'month' ? monthGridDays(focusDate) : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(focusDate), i));
    weeks = granularity === 'month' ? chunkIntoWeeks(days) : [days];
    const gridStart = days[0];
    const gridEnd = days[days.length - 1];
    const visibleRanges = ranges.filter((r) => r.end >= gridStart && r.start <= gridEnd);
    lanes = assignLanes(visibleRanges, previousLanesRef.current);
    previousLanesRef.current = lanes;
    segmentsByWeek = weeks.map((weekDays) =>
      visibleRanges
        .map((r) => clipRangeToWeek(r, weekDays, lanes.get(r.id) ?? 0))
        .filter((s): s is ClippedSegment => !!s)
    );
    maxVisibleLanes = granularity === 'month' ? MONTH_MAX_LANES : WEEK_MAX_LANES;
  }

  const rowHeight = useMemo(() => {
    if (granularity === 'day') return 0;
    const used = Math.max(0, ...segmentsByWeek.flat().map((s) => s.lane + 1));
    const laneCount = Math.max(1, Math.min(maxVisibleLanes, used));
    const hasOverflow = segmentsByWeek.flat().some((s) => s.lane >= maxVisibleLanes);
    return DAY_NUM_H + laneCount * (BAR_H + BAR_GAP) + (hasOverflow ? OVERFLOW_H : 0);
  }, [granularity, segmentsByWeek, maxVisibleLanes]);

  const gridStartDate = weeks.length > 0 ? weeks[0][0] : today;

  // Maps a pointer position to the day cell underneath it, across the whole (possibly scrolled) week grid.
  const dayOffsetFromPoint = (clientX: number, clientY: number) => {
    const el = gridContainerRef.current;
    if (!el || weeks.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const relY = clientY - rect.top + el.scrollTop;
    const rowIndex = Math.min(weeks.length - 1, Math.max(0, Math.floor(relY / rowHeight)));
    const dayWidth = (rect.width - GUTTER_WIDTH) / 7;
    const relX = clientX - rect.left - GUTTER_WIDTH;
    const colIndex = Math.min(6, Math.max(0, Math.floor(relX / dayWidth)));
    return daysBetween(gridStartDate, weeks[rowIndex][colIndex]);
  };

  const handleDragStart = (taskId: string, mode: DragMode, e: React.PointerEvent) => {
    const range = rangesById.get(taskId);
    const grabOffset = dayOffsetFromPoint(e.clientX, e.clientY);
    if (!range || grabOffset === null) return;
    const taskStartOffset = daysBetween(gridStartDate, range.start);
    const anchorDays = mode === 'move' ? grabOffset - taskStartOffset : 0;
    setWeekDrag({ taskId, mode, deltaDays: 0, anchorDays });
  };

  const handleDragMove = (e: React.PointerEvent) => {
    setWeekDrag((d) => {
      if (!d) return d;
      const range = rangesById.get(d.taskId);
      const hoverOffset = dayOffsetFromPoint(e.clientX, e.clientY);
      if (!range || hoverOffset === null) return d;
      const taskStartOffset = daysBetween(gridStartDate, range.start);
      const taskEndOffset = daysBetween(gridStartDate, range.end);
      let deltaDays = 0;
      if (d.mode === 'move') deltaDays = hoverOffset - d.anchorDays - taskStartOffset;
      else if (d.mode === 'resize-start') deltaDays = hoverOffset - taskStartOffset;
      else deltaDays = hoverOffset - taskEndOffset;
      return { ...d, deltaDays };
    });
  };

  const handleDragEnd = (task: Task, mode: DragMode) => {
    const d = weekDrag;
    if (d && d.deltaDays !== 0) {
      const start = task.startDate ? new Date(task.startDate) : null;
      const due = task.dueDate ? new Date(task.dueDate) : null;
      let newStart = start;
      let newDue = due;
      if (mode === 'move') {
        if (newStart) newStart = addDays(newStart, d.deltaDays);
        if (newDue) newDue = addDays(newDue, d.deltaDays);
      } else if (mode === 'resize-start') {
        // No start date yet (task only had a due date) — stretching from the start
        // edge creates one, anchored off the single visible date.
        const base = start ?? due;
        if (base) {
          newStart = addDays(base, d.deltaDays);
          if (newDue && newStart > newDue) newStart = new Date(newDue);
        }
      } else if (mode === 'resize-end') {
        // No due date yet (task only had a start date) — stretching from the end
        // edge creates one, anchored off the single visible date.
        const base = due ?? start;
        if (base) {
          newDue = addDays(base, d.deltaDays);
          if (newStart && newDue < newStart) newDue = new Date(newStart);
        }
      }
      optimisticSetDates(task.id, newStart ? newStart.toISOString() : null, newDue ? newDue.toISOString() : null);
    }
    setWeekDrag(null);
  };

  // Live ghost preview of the dragged task, positioned across whichever rows it now spans —
  // lets a bar be dragged from one week row into another instead of clipping at the row edge.
  const ghostSegments = useMemo(() => {
    if (!weekDrag || granularity === 'day') return [];
    const range = rangesById.get(weekDrag.taskId);
    if (!range) return [];
    const lane = lanes.get(weekDrag.taskId) ?? 0;
    let newStart = range.start;
    let newEnd = range.end;
    if (weekDrag.mode === 'move') {
      newStart = addDays(range.start, weekDrag.deltaDays);
      newEnd = addDays(range.end, weekDrag.deltaDays);
    } else if (weekDrag.mode === 'resize-start') {
      newStart = addDays(range.start, weekDrag.deltaDays);
      if (newStart > newEnd) newStart = newEnd;
    } else {
      newEnd = addDays(range.end, weekDrag.deltaDays);
      if (newEnd < newStart) newEnd = newStart;
    }
    const ghostRange = { id: weekDrag.taskId, start: newStart, end: newEnd };
    const out: (ClippedSegment & { rowIndex: number })[] = [];
    weeks.forEach((weekDays, rowIndex) => {
      const seg = clipRangeToWeek(ghostRange, weekDays, lane);
      if (seg) out.push({ ...seg, rowIndex });
    });
    return out;
  }, [weekDrag, granularity, rangesById, lanes, weeks]);

  const draggedTask = weekDrag ? tasksById.get(weekDrag.taskId) : null;

  const dayTasks = useMemo(() => {
    if (granularity !== 'day') return [];
    return tasks.filter((t) => {
      const r = rangesById.get(t.id);
      if (!r) return false;
      return focusDate >= r.start && focusDate <= r.end;
    });
  }, [granularity, tasks, rangesById, focusDate]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800/60 cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFocusDate(startOfDay(new Date()))}
            className="text-[11px] text-blue-400 hover:text-blue-300 px-1.5 cursor-pointer"
          >
            Today
          </button>
          <button onClick={() => step(1)} className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800/60 cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-white ml-1">{headerLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onRequestCreateTask(focusDate)}
            className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded font-medium cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> New task
          </button>
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded p-0.5">
            {(['month', 'week', 'day'] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`text-[11px] px-2.5 py-1 rounded cursor-pointer capitalize transition ${
                  granularity === g ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-neutral-900/60 border border-neutral-800/80 rounded overflow-hidden">
        {granularity === 'day' ? (
          <DayTimeline
            day={focusDate}
            tasks={dayTasks}
            statusColorOf={statusColorOf}
            onOpenTask={onOpenTask}
            onCommitDates={(taskId, startISO, dueISO) => optimisticSetDates(taskId, startISO, dueISO)}
          />
        ) : (
          <div ref={gridContainerRef} className="relative h-full overflow-y-auto">
            {weeks.map((weekDays, i) => (
              <WeekRow
                key={i}
                weekDays={weekDays}
                segments={segmentsByWeek[i]}
                tasksById={tasksById}
                statusColorOf={statusColorOf}
                today={today}
                monthAnchor={granularity === 'month' ? focusDate : undefined}
                maxVisibleLanes={maxVisibleLanes}
                height={rowHeight}
                activeDrag={weekDrag}
                onOpenTask={onOpenTask}
                onDrillDay={drillToDay}
                onQuickAddDay={onRequestCreateTask}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ))}

            {draggedTask && ghostSegments.length > 0 && (
              <div className="absolute inset-y-0 pointer-events-none z-20" style={{ left: GUTTER_WIDTH, right: 0 }}>
                {ghostSegments.map((seg) => (
                  <div
                    key={seg.rowIndex}
                    className="absolute"
                    style={{
                      left: `${(seg.colStart / 7) * 100}%`,
                      width: `${(seg.colSpan / 7) * 100}%`,
                      top: seg.rowIndex * rowHeight + DAY_NUM_H + seg.lane * (BAR_H + BAR_GAP),
                      height: BAR_H,
                      paddingLeft: 2,
                      paddingRight: 2,
                    }}
                  >
                    <div
                      className={`h-full flex items-center text-[9px] leading-none text-white font-medium truncate px-1.5 border border-dashed border-white/80 ${
                        seg.isStartEdge ? 'rounded-l' : ''
                      } ${seg.isEndEdge ? 'rounded-r' : ''}`}
                      style={{ backgroundColor: statusColorOf(draggedTask.status), opacity: 0.85 }}
                    >
                      <span className="truncate">{draggedTask.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

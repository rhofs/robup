'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useTaskStore, StatusDef, Task, HierarchyWorkspace } from '../../store/useTaskStore';
import WeekRow, { BAR_GAP, BAR_H, DAY_NUM_H, GUTTER_WIDTH } from './WeekRow';
import DayTimeline from './DayTimeline';

type Granularity = 'month' | 'week' | 'day';

// Bars are 13px/16px per lane now (was 20px/26px) — these caps were never re-tuned after
// that slimming pass, so raise them to use the same visual row budget as before instead of
// wasting the extra headroom on an early "+N more".
const MONTH_MAX_LANES = 6;
const WEEK_MAX_LANES = 12;
// Measured against the chip's actual rendered height (24px, from its py-[3px] padding + line
// height) plus a couple px of breathing room — this used to be 14, comfortably under-budgeted,
// which was invisible while the old row-wide overflow strip just used `bottom: 0` and absorbed
// the mismatch, but became a real few-px overflow past the cell's own bottom edge once the chip
// moved to sit inside a specific day's own reserved space (a row exactly at the lane cap has
// nothing left to absorb it).
const OVERFLOW_H = 26;

type CalendarViewProps = {
  tasks: Task[];
  statuses: StatusDef[];
  workspaces: HierarchyWorkspace[];
  onOpenTask: (id: string) => void;
  onRequestCreateTask: (date: Date) => void;
};

export default function CalendarView({ tasks, statuses, workspaces, onOpenTask, onRequestCreateTask }: CalendarViewProps) {
  const {
    optimisticSetDates,
    calendarGranularity: granularity,
    calendarFocusDate: focusDate,
    setCalendarGranularity: setGranularity,
    setCalendarFocusDate: setFocusDate,
  } = useTaskStore();
  const [weekDrag, setWeekDrag] = useState<DragState | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Row height used to be purely content-driven (just tall enough for the day number + however
  // many task bars are in it), which left a large dead void below the grid on a light/empty
  // month — the bordered container fills the page via flex-1, but its content only ever occupied
  // its natural (short) height. Measuring the container lets rowHeight below stretch rows to
  // fill the available space instead, matching how Google Calendar/Notion always fill the
  // viewport regardless of how many events exist.
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const update = () => setContainerHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const today = useMemo(() => startOfDay(new Date()), []);
  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  // Space > Folder (nested, most-specific-set wins) > List > Task color cascade — Task has no
  // color field of its own yet, so the chain bottoms out at List. Falls back to statusColorOf
  // only when the task's List can't be found at all (e.g. an orphaned/stale reference).
  const taskColorOf = (task: Task): string => {
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        const list = space.lists.find((l) => l.id === task.listId);
        if (!list) continue;
        if (list.color) return list.color;
        let folderId = list.folderId;
        while (folderId) {
          const folder = space.folders.find((f) => f.id === folderId);
          if (!folder) break;
          if (folder.color) return folder.color;
          folderId = folder.parentId;
        }
        return space.color;
      }
    }
    return statusColorOf(task.status);
  };

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
    if (granularity === 'month') setFocusDate(new Date(focusDate.getFullYear(), focusDate.getMonth() + dir, 1));
    else if (granularity === 'week') setFocusDate(addDays(focusDate, dir * 7));
    else setFocusDate(addDays(focusDate, dir));
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

    // assignLanes is called once PER ROW, not once for the whole visible grid — a long chain of
    // back-to-back overlapping multi-day bars (e.g. several staggered vacation entries) used to
    // merge into one shared cluster spanning the whole month, so every day inside that chain drew
    // from the same maxVisibleLanes budget: dragging a task to a different day still inside that
    // same chain never actually freed a slot, since it never left the shared pool. Scoping the
    // packing to one row at a time is what makes "N visible per day" actually mean that.
    const allRowLanes = new Map<string, number>();
    segmentsByWeek = weeks.map((weekDays) => {
      const weekStart = weekDays[0];
      const weekEnd = weekDays[6];
      const rowRanges = visibleRanges.filter((r) => r.end >= weekStart && r.start <= weekEnd);
      const rowLanes = assignLanes(rowRanges);
      for (const [id, lane] of rowLanes) allRowLanes.set(id, lane);
      return rowRanges.map((r) => clipRangeToWeek(r, weekDays, rowLanes.get(r.id) ?? 0)).filter((s): s is ClippedSegment => !!s);
    });
    lanes = allRowLanes;
    maxVisibleLanes = granularity === 'month' ? MONTH_MAX_LANES : WEEK_MAX_LANES;
  }

  // A fixed size, not content-driven — always reserves room for the full maxVisibleLanes cap
  // plus the overflow strip, whether or not any given render actually uses all of it. Used to be
  // computed from how many lanes were actually in use *anywhere in the visible month*, which
  // meant every row's height (and the "+N more" chip's own vertical spot within its row, see
  // WeekRow.tsx) shifted by OVERFLOW_H the instant overflow appeared or cleared *anywhere* in the
  // grid — dragging one task in or out of a pileup made the whole calendar grow or shrink under
  // you. A constant reserved height, same as a real calendar app's day cells, fixes that.
  const rowHeight = useMemo(() => {
    if (granularity === 'day') return 0;
    const contentHeight = DAY_NUM_H + maxVisibleLanes * (BAR_H + BAR_GAP) + OVERFLOW_H;
    return weeks.length > 0 && containerHeight > 0 ? Math.max(contentHeight, containerHeight / weeks.length) : contentHeight;
  }, [granularity, maxVisibleLanes, containerHeight, weeks.length]);

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
            taskColorOf={taskColorOf}
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
                taskColorOf={taskColorOf}
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
                      style={{ backgroundColor: taskColorOf(draggedTask), opacity: 0.85 }}
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

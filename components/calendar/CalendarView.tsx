'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Plus } from 'lucide-react';
import {
  addDays,
  chunkIntoWeeks,
  daysBetween,
  formatFullDate,
  formatMonthYear,
  isSameDay,
  monthGridDays,
  startOfDay,
  startOfWeek,
  WEEKDAY_LABELS_SHORT,
} from '../../lib/calendarDates';
import { assignLanes, clipRangeToWeek, type ClippedSegment, type DragMode, type DragState, type TaskRange } from '../../lib/ganttLayout';
import { useTaskStore, StatusDef, Task, Event, HierarchyWorkspace } from '../../store/useTaskStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import WeekRow, { BAR_GAP, BAR_H, DAY_NUM_H, GUTTER_WIDTH } from './WeekRow';
import DayTimeline from './DayTimeline';

type Granularity = 'month' | 'week' | 'day';

// Default lane caps, used whenever Fit mode isn't actively overriding them (see isFitActive/
// maxVisibleLanes below) — Fit mode derives its own cap from however many lanes the viewport-fitted
// row height actually has room for, which can be lower (never higher) than these.
const MONTH_MAX_LANES = 6;
const WEEK_MAX_LANES = 12;
// Measured against the chip's actual rendered height (24px, from its py-[3px] padding + line
// height) plus a couple px of breathing room — this used to be 14, comfortably under-budgeted,
// which was invisible while the old row-wide overflow strip just used `bottom: 0` and absorbed
// the mismatch, but became a real few-px overflow past the cell's own bottom edge once the chip
// moved to sit inside a specific day's own reserved space (a row exactly at the lane cap has
// nothing left to absorb it).
const OVERFLOW_H = 26;

// Falls back to this when an Event has neither its own `color` set nor a linked Space — a fixed
// violet, distinct from every default Task-status color so an Event bar reads as "not a task"
// even with nothing else customized. Same hex already in this app's own FIELD_COLOR_CHOICES
// palette, so it's not a new color being introduced.
const DEFAULT_EVENT_COLOR = '#9a61d1';

type CalendarViewProps = {
  tasks: Task[];
  events: Event[];
  statuses: StatusDef[];
  workspaces: HierarchyWorkspace[];
  showWeekNumbers: boolean;
  onOpenTask: (id: string) => void;
  onOpenEvent: (id: string) => void;
  onRequestCreateTask: (date: Date) => void;
};

export default function CalendarView({ tasks, events, statuses, workspaces, showWeekNumbers, onOpenTask, onOpenEvent, onRequestCreateTask }: CalendarViewProps) {
  const {
    optimisticSetDates,
    optimisticSetCalendarLane,
    updateEvent,
    refetchEvents,
    calendarGranularity: granularity,
    calendarFocusDate: focusDate,
    setCalendarGranularity: setGranularity,
    setCalendarFocusDate: setFocusDate,
  } = useTaskStore();
  const [weekDrag, setWeekDrag] = useState<DragState | null>(null);
  const isMobile = useIsMobile();

  // The reference spec (a native Google Calendar widget) only ever has month + day — Week has no
  // real value on a phone-width screen and the touch-sized grid isn't tuned for it. If the
  // viewport crosses into mobile while Week is active (e.g. rotating a foldable), fall back to
  // Month rather than leaving the user stuck on a granularity its own switcher no longer offers.
  useEffect(() => {
    if (isMobile && granularity === 'week') setGranularity('month');
  }, [isMobile, granularity, setGranularity]);

  // On-demand Google Calendar pull (backlog #13) — once when Planner is opened, so a change made
  // on the Google side doesn't wait for the next scheduled scripts/syncGoogleCalendar.ts run
  // before showing up here. Silent no-op server-side if Google isn't connected.
  useEffect(() => {
    fetch('/api/google/calendar/sync', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (result && (result.created > 0 || result.updated > 0 || result.deleted > 0)) refetchEvents();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  // Mirrors gridContainerRef.current into state, purely so the ResizeObserver effect below can
  // depend on "the actual DOM node" and re-run when it changes — a plain useRef's own reassignment
  // is invisible to React's dependency tracking (see gridContainerCallbackRef).
  const [gridContainerNode, setGridContainerNode] = useState<HTMLDivElement | null>(null);
  // Month view's grid <div ref={gridContainerRef}> genuinely unmounts (not just hides) every time
  // granularity flips to 'day' — CalendarView renders `{granularity === 'day' ? <DayTimeline/> :
  // <div ref={gridContainerRef}>...}`, two different element types in the same ternary slot, so
  // React tears the whole month-grid div down and mounts a fresh one on the way back. A ref
  // *object* handles that fine (React just reassigns `.current`), but the effect below used to
  // only ever run once on CalendarView's own first mount ([] deps) — meaning its ResizeObserver
  // stayed bound to the very first grid div forever, and never re-attached to the fresh one
  // created each time you return from Day view to Month view. Once that first div was gone,
  // `containerHeight` silently stopped updating on resize, and if the fresh div's real height
  // ever differed from the last measurement (rotation, keyboard, address-bar show/hide), rows
  // could end up laid out too short for their own content. A callback ref fixes this at the root:
  // it fires on every mount *and* every unmount, so the effect can depend on the real node.
  const gridContainerCallbackRef = (node: HTMLDivElement | null) => {
    gridContainerRef.current = node;
    setGridContainerNode(node);
  };
  // "Fit" — Month view only, on by default: the whole month fits the viewport with no vertical
  // scroll, every week forced to the exact same height (containerHeight / weeks.length), rather
  // than the normal fixed-per-lane-cap height that can require scrolling on a 6-week month. Never
  // shrinks individual events to make everything visible — see maxVisibleLanes below, which
  // derives how many lanes actually fit that height and pushes the rest into the existing
  // overflow ("+N more") affordance, completely unchanged.
  const [fitMode, setFitMode] = useState(true);

  // Row height used to be purely content-driven (just tall enough for the day number + however
  // many task bars are in it), which left a large dead void below the grid on a light/empty
  // month — the bordered container fills the page via flex-1, but its content only ever occupied
  // its natural (short) height. Measuring the container lets rowHeight below stretch rows to
  // fill the available space instead, matching how Google Calendar/Notion always fill the
  // viewport regardless of how many events exist.
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    const el = gridContainerNode;
    if (!el) return;
    const update = () => setContainerHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridContainerNode]);

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

  // An Event's own linked Space cascades color the same way a Task's List does — falls back to
  // the Event's own `color` field, then the fixed default, never to Status (Events have no
  // status concept at all).
  const eventColorOf = (event: Event): string => {
    if (event.spaceId) {
      for (const ws of workspaces) {
        const space = ws.spaces.find((s) => s.id === event.spaceId);
        if (space) return space.color;
      }
    }
    return event.color ?? DEFAULT_EVENT_COLOR;
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
    // Events merge into the exact same range list Tasks use — assignLanes/clipRangeToWeek are
    // already generic over {id, start, end} and need no changes to accommodate a second source.
    for (const event of events) {
      const start = startOfDay(new Date(event.startDate));
      let end = startOfDay(new Date(event.endDate));
      if (end < start) end = start;
      out.push({ id: event.id, start, end });
    }
    return out;
  }, [tasks, events]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const rangesById = useMemo(() => new Map(ranges.map((r) => [r.id, r])), [ranges]);

  // Manually-pinned Planner lanes (dragged vertically — see assignLanes in lib/ganttLayout.ts).
  // Built once from every task, not scoped per row: assignLanes only ever looks up ids that are
  // actually present in whichever row's own range set it's packing, so handing it the full map
  // every time is harmless and means a pin is respected identically in every row a task spans.
  const pinnedLanes = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (task.calendarLane !== null && task.calendarLane !== undefined) map.set(task.id, task.calendarLane);
    }
    return map;
  }, [tasks]);

  const drillToDay = (day: Date) => {
    setFocusDate(day);
    setGranularity('day');
  };

  // "N" opens the quick-create popover, same idea as Linear/Notion's single-letter shortcuts —
  // guarded against firing while any text input/textarea/contenteditable has focus (typing a
  // task title shouldn't accidentally reopen the popover on its own "n"), and against the
  // modifier-key combos (Cmd/Ctrl/Alt+N) browsers and OSes already reserve.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      e.preventDefault();
      onRequestCreateTask(focusDate);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusDate, onRequestCreateTask]);

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
    // packing to one row at a time is what makes "N visible per day" actually mean that. Note
    // this never depends on maxVisibleLanes/rowHeight below — lane *assignment* is always
    // unbounded; maxVisibleLanes is purely a later display filter (see WeekRow.tsx), so Fit mode
    // computing its own cap from the viewport doesn't need to feed back into this at all.
    const allRowLanes = new Map<string, number>();
    segmentsByWeek = weeks.map((weekDays) => {
      const weekStart = weekDays[0];
      const weekEnd = weekDays[6];
      const rowRanges = visibleRanges.filter((r) => r.end >= weekStart && r.start <= weekEnd);
      const rowLanes = assignLanes(rowRanges, pinnedLanes);
      for (const [id, lane] of rowLanes) allRowLanes.set(id, lane);
      return rowRanges.map((r) => clipRangeToWeek(r, weekDays, rowLanes.get(r.id) ?? 0)).filter((s): s is ClippedSegment => !!s);
    });
    lanes = allRowLanes;
  }

  const isFitActive = granularity === 'month' && fitMode;

  // Two modes, both still "every week gets the exact same height" (never content-driven per
  // row — the "keep weekly rows static" constraint holds in both):
  // - Fit: rowHeight is purely containerHeight / weeks.length, full stop — the whole month
  //   always fits with no scrolling, whatever that works out to per week.
  // - Not Fit (unchanged from before Fit existed): a fixed size reserving room for the full
  //   per-granularity lane cap plus the overflow strip, stretched to fill the container evenly
  //   if there's room to spare, scrolling if there isn't.
  const rowHeight = useMemo(() => {
    if (granularity === 'day') return 0;
    if (isFitActive && weeks.length > 0 && containerHeight > 0) return Math.floor(containerHeight / weeks.length);
    const defaultMaxLanes = granularity === 'month' ? MONTH_MAX_LANES : WEEK_MAX_LANES;
    const contentHeight = DAY_NUM_H + defaultMaxLanes * (BAR_H + BAR_GAP) + OVERFLOW_H;
    return weeks.length > 0 && containerHeight > 0 ? Math.max(contentHeight, containerHeight / weeks.length) : contentHeight;
  }, [granularity, isFitActive, containerHeight, weeks.length]);

  // Fit mode never shrinks events — it shrinks how many LANES are visible before "+N more" kicks
  // in, derived from whatever rowHeight Fit just computed. Outside Fit mode, the same fixed caps
  // as always. Either way this is purely a display-time filter (see WeekRow.tsx's own
  // `segments.filter(s => s.lane < maxVisibleLanes)`) — never touches lane assignment itself.
  const maxVisibleLanes = isFitActive
    ? Math.max(1, Math.floor((rowHeight - DAY_NUM_H - OVERFLOW_H) / (BAR_H + BAR_GAP)))
    : granularity === 'month'
      ? MONTH_MAX_LANES
      : WEEK_MAX_LANES;

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

  // Same idea, one axis over: maps a pointer's Y position to a lane index within whichever row
  // it's currently over — same math WeekRow.tsx itself uses to position a bar at `seg.lane *
  // (BAR_H + BAR_GAP)` from the row's own top (DAY_NUM_H down). Clamped to the visible lane cap,
  // not to whichever lanes happen to be occupied right now — dropping into an empty lane below
  // the busiest row's current usage is a valid, common case (that's the whole point).
  const laneOffsetFromPoint = (clientY: number) => {
    const el = gridContainerRef.current;
    if (!el || weeks.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const relY = clientY - rect.top + el.scrollTop;
    const rowIndex = Math.min(weeks.length - 1, Math.max(0, Math.floor(relY / rowHeight)));
    const withinRow = relY - rowIndex * rowHeight - DAY_NUM_H;
    return Math.max(0, Math.min(maxVisibleLanes - 1, Math.floor(withinRow / (BAR_H + BAR_GAP))));
  };

  const handleDragStart = (taskId: string, mode: DragMode, e: React.PointerEvent) => {
    const range = rangesById.get(taskId);
    const grabOffset = dayOffsetFromPoint(e.clientX, e.clientY);
    if (!range || grabOffset === null) return;
    const taskStartOffset = daysBetween(gridStartDate, range.start);
    const anchorDays = mode === 'move' ? grabOffset - taskStartOffset : 0;
    const taskLane = lanes.get(taskId) ?? 0;
    const grabLane = laneOffsetFromPoint(e.clientY) ?? taskLane;
    const anchorLane = mode === 'move' ? grabLane - taskLane : 0;
    setWeekDrag({ taskId, mode, deltaDays: 0, anchorDays, deltaLanes: 0, anchorLane });
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

      let deltaLanes = 0;
      if (d.mode === 'move') {
        const taskLane = lanes.get(d.taskId) ?? 0;
        const hoverLane = laneOffsetFromPoint(e.clientY);
        if (hoverLane !== null) deltaLanes = hoverLane - d.anchorLane - taskLane;
      }
      return { ...d, deltaDays, deltaLanes };
    });
  };

  const handleDragEnd = (id: string, mode: DragMode) => {
    const task = tasksById.get(id);
    if (!task) {
      handleEventDragEnd(id, mode);
      return;
    }
    const d = weekDrag;
    if (d) {
      const start = task.startDate ? new Date(task.startDate) : null;
      const due = task.dueDate ? new Date(task.dueDate) : null;
      let newStart = start;
      let newDue = due;
      if (d.deltaDays !== 0) {
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
          // edge creates one, anchored off the single visible date. Mirror case: no
          // start date yet (task only had a due date, the common "1-day task" shape) —
          // anchor a start at the task's original position *first*, or newStart stays
          // null and `ranges`' own start-falls-back-to-due logic makes the whole task
          // silently relocate to the new day instead of actually spanning to it.
          if (!start && due) newStart = new Date(due);
          const base = due ?? start;
          if (base) {
            newDue = addDays(base, d.deltaDays);
            if (newStart && newDue < newStart) newDue = new Date(newStart);
          }
        }
        optimisticSetDates(task.id, newStart ? newStart.toISOString() : null, newDue ? newDue.toISOString() : null);
      }

      // Vertical drag = manual lane pin — only meaningful for 'move' (resizing an edge is a
      // date-only gesture). Dropping onto a lane another overlapping task currently occupies
      // swaps the two: the incumbent takes the dragged task's *original* lane rather than
      // getting bumped off somewhere else, same "nothing vanishes, two things trade places"
      // pattern already used for Space/List/Folder drag-reorder elsewhere in this app.
      if (mode === 'move' && d.deltaLanes !== 0) {
        const originalLane = lanes.get(task.id) ?? 0;
        const targetLane = Math.max(0, Math.min(maxVisibleLanes - 1, originalLane + d.deltaLanes));
        if (targetLane !== originalLane) {
          const rangeStart = newStart ? startOfDay(newStart) : newDue ? startOfDay(newDue) : null;
          const rangeEnd = newDue ? startOfDay(newDue) : newStart ? startOfDay(newStart) : null;
          let swapPartnerId: string | null = null;
          if (rangeStart && rangeEnd) {
            for (const [otherId, otherLane] of lanes) {
              if (otherId === task.id || otherLane !== targetLane) continue;
              const otherRange = rangesById.get(otherId);
              if (otherRange && otherRange.start <= rangeEnd && otherRange.end >= rangeStart) {
                swapPartnerId = otherId;
                break;
              }
            }
          }
          optimisticSetCalendarLane(task.id, targetLane);
          if (swapPartnerId) optimisticSetCalendarLane(swapPartnerId, originalLane);
        }
      }
    }
    setWeekDrag(null);
  };

  // Events only ever resize (EventBar wires up resize-start/resize-end but never a move handler
  // on the body — see that component's own comment), so this only needs the two resize branches,
  // no move/lane-pin handling at all (Event has no calendarLane field to pin). Mirrors the Task
  // resize math above exactly, just against startDate/endDate directly instead of the
  // startDate-falls-back-to-dueDate juggling Task needs (an Event always has both).
  const handleEventDragEnd = (eventId: string, mode: DragMode) => {
    const event = eventsById.get(eventId);
    const d = weekDrag;
    if (event && d && d.deltaDays !== 0) {
      let newStart = new Date(event.startDate);
      let newEnd = new Date(event.endDate);
      if (mode === 'resize-start') {
        newStart = addDays(newStart, d.deltaDays);
        if (newStart > newEnd) newStart = new Date(newEnd);
      } else if (mode === 'resize-end') {
        newEnd = addDays(newEnd, d.deltaDays);
        if (newEnd < newStart) newEnd = new Date(newStart);
      }
      updateEvent(eventId, { startDate: newStart.toISOString(), endDate: newEnd.toISOString() });
    }
    setWeekDrag(null);
  };

  // Live ghost preview of the dragged task, positioned across whichever rows it now spans —
  // lets a bar be dragged from one week row into another instead of clipping at the row edge.
  const ghostSegments = useMemo(() => {
    if (!weekDrag || granularity === 'day') return [];
    const range = rangesById.get(weekDrag.taskId);
    if (!range) return [];
    const baseLane = lanes.get(weekDrag.taskId) ?? 0;
    const lane =
      weekDrag.mode === 'move' ? Math.max(0, Math.min(maxVisibleLanes - 1, baseLane + weekDrag.deltaLanes)) : baseLane;
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
  const draggedEvent = weekDrag && !draggedTask ? eventsById.get(weekDrag.taskId) : null;

  const dayTasks = useMemo(() => {
    if (granularity !== 'day') return [];
    return tasks.filter((t) => {
      const r = rangesById.get(t.id);
      if (!r) return false;
      return focusDate >= r.start && focusDate <= r.end;
    });
  }, [granularity, tasks, rangesById, focusDate]);

  const dayEvents = useMemo(() => {
    if (granularity !== 'day') return [];
    return events.filter((e) => {
      const r = rangesById.get(e.id);
      if (!r) return false;
      return focusDate >= r.start && focusDate <= r.end;
    });
  }, [granularity, events, rangesById, focusDate]);

  return (
    <div className="flex flex-col h-full">
      {/* Stacks into two rows on mobile (date-nav above, actions below) instead of squeezing both
          onto one line — at phone width there isn't enough room for justify-between to put real
          air between "New task" and the month label without shrinking anything. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-1 pb-3 shrink-0">
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
            title="New task (N)"
            className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white pl-2 pr-1.5 py-1 rounded font-medium cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New task
            <span className="hidden md:inline text-[9px] text-blue-200/70 font-mono ml-0.5">N</span>
          </button>
          <div className="flex items-center gap-0.5 bg-neutral-900 border border-neutral-800 rounded-md p-0.5">
            {(isMobile ? (['month', 'day'] as Granularity[]) : (['month', 'week', 'day'] as Granularity[])).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`text-[11px] px-2.5 py-1 rounded cursor-pointer capitalize transition ${
                  granularity === g ? 'bg-neutral-800 text-blue-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          {granularity === 'month' && (
            <button
              onClick={() => setFitMode((v) => !v)}
              title="Fit calendar to screen"
              className={`p-1.5 rounded-md border transition cursor-pointer ${
                fitMode ? 'bg-neutral-800 border-neutral-700 text-blue-400' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {granularity !== 'day' && (
        // No border-b of its own — the grid container directly below already draws a top border,
        // and stacking a second line right above it read as an unintentional "double border."
        <div className="flex shrink-0 pb-1 mb-0.5">
          <div className="shrink-0" style={{ width: GUTTER_WIDTH }} />
          <div className="flex-1 grid grid-cols-7">
            {WEEKDAY_LABELS_SHORT.map((label, i) => {
              // Week view has real dates per column (only one row, so "MON 17" reads naturally
              // per the redesign brief); month view spans several rows with different dates each,
              // so its header is just the weekday name, once, at the top — the day cells below
              // carry their own date number per row.
              const day = granularity === 'week' ? weeks[0]?.[i] : null;
              const isToday = day ? isSameDay(day, today) : false;
              return (
                <div key={i} className="flex flex-col items-center justify-center gap-0">
                  <span className={`text-[9px] font-semibold tracking-wide ${isToday ? 'text-blue-400' : 'text-neutral-500'}`}>{label}</span>
                  {day && (
                    <span className={`text-base font-bold leading-tight ${isToday ? 'text-blue-400' : 'text-white'}`}>{day.getDate()}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-neutral-900/60 border border-neutral-800/80 rounded overflow-hidden">
        {granularity === 'day' ? (
          <DayTimeline
            day={focusDate}
            tasks={dayTasks}
            taskColorOf={taskColorOf}
            onOpenTask={onOpenTask}
            onCommitTaskDates={(taskId, startISO, dueISO) => optimisticSetDates(taskId, startISO, dueISO)}
            events={dayEvents}
            eventColorOf={eventColorOf}
            onOpenEvent={onOpenEvent}
            onCommitEventDates={(eventId, startISO, endISO) => updateEvent(eventId, { startDate: startISO, endDate: endISO })}
            isMobile={isMobile}
          />
        ) : (
          // overflow-x-hidden always — the grid is a 7-column percentage-based layout that should
          // never need to scroll sideways; without this, a stray 1px rounding overflow (percentage
          // widths not landing on exact whole pixels) was enough to surface a horizontal
          // scrollbar along the very bottom of the grid.
          <div
            ref={gridContainerCallbackRef}
            className={`relative h-full overflow-x-hidden ${isFitActive ? 'overflow-y-hidden' : 'overflow-y-auto'}`}
          >
            {weeks.map((weekDays, i) => (
              <WeekRow
                key={i}
                weekDays={weekDays}
                segments={segmentsByWeek[i]}
                tasksById={tasksById}
                taskColorOf={taskColorOf}
                eventsById={eventsById}
                eventColorOf={eventColorOf}
                onOpenEvent={onOpenEvent}
                today={today}
                isLastRow={i === weeks.length - 1}
                showWeekNumbers={showWeekNumbers}
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
                onUnpinLane={(taskId) => optimisticSetCalendarLane(taskId, null)}
                isMobile={isMobile}
              />
            ))}

            {(draggedTask || draggedEvent) && ghostSegments.length > 0 && (
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
                      style={{ backgroundColor: draggedTask ? taskColorOf(draggedTask) : eventColorOf(draggedEvent!), opacity: 0.85 }}
                    >
                      <span className="truncate">{draggedTask ? draggedTask.title : draggedEvent!.title}</span>
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

import { daysBetween, isSameDay } from './calendarDates';

export type TaskRange = { id: string; start: Date; end: Date };

export type DragMode = 'move' | 'resize-start' | 'resize-end';
export type DragState = {
  taskId: string;
  mode: DragMode;
  deltaDays: number;
  // For 'move': day offset (from grid start) of the day originally grabbed, minus the task's
  // start-day offset — lets us keep the grab point fixed under the cursor while dragging.
  anchorDays: number;
};

// Greedy interval-graph coloring: each task gets the first lane whose previous
// occupant already ended, else a new lane. Computed once over the whole visible
// range so a task keeps the same lane in every week row it appears in.
export function assignLanes(ranges: TaskRange[]): Map<string, number> {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const r of sorted) {
    let laneIdx = laneEnds.findIndex((end) => end < r.start.getTime());
    if (laneIdx === -1) {
      laneIdx = laneEnds.length;
      laneEnds.push(r.end.getTime());
    } else {
      laneEnds[laneIdx] = r.end.getTime();
    }
    lanes.set(r.id, laneIdx);
  }
  return lanes;
}

export type ClippedSegment = {
  taskId: string;
  colStart: number; // 0-6, Monday=0
  colSpan: number; // 1-7
  lane: number;
  isStartEdge: boolean; // segment contains the task's true start date -> round left corner
  isEndEdge: boolean; // segment contains the task's true end date -> round right corner
};

// Clips a task's [start,end] range to a single 7-day week row, returning null if it doesn't intersect.
export function clipRangeToWeek(range: TaskRange, weekDays: Date[], lane: number): ClippedSegment | null {
  const rowStart = weekDays[0];
  const rowEnd = weekDays[6];
  if (range.end < rowStart || range.start > rowEnd) return null;
  const segStart = range.start < rowStart ? rowStart : range.start;
  const segEnd = range.end > rowEnd ? rowEnd : range.end;
  return {
    taskId: range.id,
    colStart: daysBetween(rowStart, segStart),
    colSpan: daysBetween(segStart, segEnd) + 1,
    lane,
    isStartEdge: isSameDay(segStart, range.start),
    isEndEdge: isSameDay(segEnd, range.end),
  };
}

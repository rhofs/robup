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
//
// `previousLanes` (if given) is consulted first: a task tries to keep the lane it
// had last time before falling back to "first free lane". Without this, moving a
// single task re-sorts everyone by start date and can shuffle every other task's
// lane on the same render — including bumping some past the visible lane cap, so
// they silently vanish into "+N more" even though nothing about them changed.
export function assignLanes(ranges: TaskRange[], previousLanes?: Map<string, number>): Map<string, number> {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  // Sparse: a "preferred" lane far past what's been used yet leaves holes at the
  // skipped indices. Array.prototype.findIndex still visits those holes as
  // `undefined`, and `undefined < x` is always false — so without treating a hole
  // explicitly as free, those lane slots silently become permanently unusable and
  // every later task gets pushed further out, past the visible lane cap for good.
  const laneEnds: (number | undefined)[] = [];
  const isFree = (end: number | undefined, startTime: number) => end === undefined || end < startTime;
  const lanes = new Map<string, number>();
  for (const r of sorted) {
    const startTime = r.start.getTime();
    const preferred = previousLanes?.get(r.id);
    let laneIdx =
      preferred !== undefined && isFree(laneEnds[preferred], startTime)
        ? preferred
        : laneEnds.findIndex((end) => isFree(end, startTime));
    if (laneIdx === -1) laneIdx = laneEnds.length;
    laneEnds[laneIdx] = r.end.getTime();
    lanes.set(r.id, laneIdx);
  }

  // Compact: a task that keeps a "preferred" lane can end up parked way higher than it
  // needs to be (e.g. it was part of a large pileup last render that has since cleared),
  // leaving nothing but empty gaps below it. Left alone, that lane number only ever goes
  // up and never comes back down, so it eventually — and permanently — sits past the
  // visible lane cap. Renumber the lanes actually in use to a dense 0..k-1 range,
  // preserving relative order, so gaps collapse and nothing stays stuck hidden once the
  // crowding that pushed it there is gone. When there's no gap this is a no-op, so it
  // doesn't reintroduce the reshuffling `previousLanes` above is meant to avoid.
  const usedLanes = [...new Set(lanes.values())].sort((a, b) => a - b);
  const remap = new Map(usedLanes.map((lane, i) => [lane, i]));
  for (const [id, lane] of lanes) lanes.set(id, remap.get(lane)!);

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

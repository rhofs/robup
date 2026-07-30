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
  const isFree = (end: number | undefined, startTime: number) => end === undefined || end < startTime;
  const lanes = new Map<string, number>();

  // Lane assignment AND compaction both run per connected overlap cluster (merge-overlapping-
  // intervals), not globally across the whole visible range. Without this, a task that moves
  // away from a crowded pileup keeps whatever lane number the pileup pushed it to, because
  // compaction only closes a gap when NOTHING in the entire month still occupies the lower
  // lane numbers — so as long as some unrelated pileup elsewhere keeps lanes 0-3 "in use",
  // a task with real breathing room on its own day stays stuck past the visible cap forever,
  // and the day it left behind never drops its "+N more" count either. Clustering scopes both
  // steps to only the tasks actually competing for space together.
  let i = 0;
  while (i < sorted.length) {
    let clusterEnd = sorted[i].end.getTime();
    let j = i + 1;
    // <= (not <), matching `isFree` below: a single-day task has start === end, so two
    // same-day tasks would compare equal here and wrongly be treated as non-overlapping
    // neighbors in separate clusters if this used strict `<` — exactly the case that
    // needed real lane conflict, since they land on the same calendar cell.
    while (j < sorted.length && sorted[j].start.getTime() <= clusterEnd) {
      clusterEnd = Math.max(clusterEnd, sorted[j].end.getTime());
      j++;
    }
    const cluster = sorted.slice(i, j);

    // Sparse: a "preferred" lane far past what's been used yet leaves holes at the
    // skipped indices. Array.prototype.findIndex still visits those holes as
    // `undefined`, and `undefined < x` is always false — so without treating a hole
    // explicitly as free, those lane slots silently become permanently unusable and
    // every later task gets pushed further out, past the visible lane cap for good.
    const laneEnds: (number | undefined)[] = [];
    const clusterLanes = new Map<string, number>();
    for (const r of cluster) {
      const startTime = r.start.getTime();
      const preferred = previousLanes?.get(r.id);
      let laneIdx =
        preferred !== undefined && isFree(laneEnds[preferred], startTime)
          ? preferred
          : laneEnds.findIndex((end) => isFree(end, startTime));
      if (laneIdx === -1) laneIdx = laneEnds.length;
      laneEnds[laneIdx] = r.end.getTime();
      clusterLanes.set(r.id, laneIdx);
    }

    // Renumber this cluster's lanes actually in use to a dense 0..k-1 range, preserving
    // relative order, so gaps collapse within the cluster once crowding within it eases.
    const usedLanes = [...new Set(clusterLanes.values())].sort((a, b) => a - b);
    const remap = new Map(usedLanes.map((lane, idx) => [lane, idx]));
    for (const [id, lane] of clusterLanes) lanes.set(id, remap.get(lane)!);

    i = j;
  }

  return lanes;
}

export type TimeInterval = { id: string; startMin: number; endMin: number };

// Side-by-side column layout for same-day timed events (Day view), grouped by connected
// overlap cluster rather than one global column count — otherwise two events overlapping at
// 09:00 would force a third, unrelated event at 15:00 into a needlessly narrow column too.
// Without this, overlapping timed tasks rendered full-width on top of each other with only
// the last one in paint order visible — the rest were fully hidden with no indication at all.
export function layoutDayColumns(items: TimeInterval[]): Map<string, { col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result = new Map<string, { col: number; cols: number }>();
  let i = 0;
  while (i < sorted.length) {
    let clusterEnd = sorted[i].endMin;
    let j = i + 1;
    while (j < sorted.length && sorted[j].startMin < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, sorted[j].endMin);
      j++;
    }
    const cluster = sorted.slice(i, j);
    const colEnds: number[] = [];
    const colOf = new Map<string, number>();
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) col = colEnds.length;
      colEnds[col] = item.endMin;
      colOf.set(item.id, col);
    }
    const cols = colEnds.length;
    for (const item of cluster) result.set(item.id, { col: colOf.get(item.id)!, cols });
    i = j;
  }
  return result;
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

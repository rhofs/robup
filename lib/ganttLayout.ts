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
  // Same idea as deltaDays/anchorDays, one axis over — how many lanes up/down the pointer has
  // moved since drag-start, and the lane originally grabbed relative to the task's own lane.
  // Only meaningful for mode 'move' (resizing an edge is a date-only gesture); always 0 otherwise.
  deltaLanes: number;
  anchorLane: number;
};

// Greedy interval-graph coloring: each task gets the lowest lane whose previous occupant
// already ended, else a new lane, processed in start-date order. This is the textbook-optimal
// algorithm for this problem — first-fit-by-start-time always uses the true minimum number of
// lanes for a set of overlapping intervals — so it always produces a dense, gap-free packing on
// its own; no separate compaction step is needed.
//
// A previous version of this function also accepted a `previousLanes` hint (try to keep a task
// in the lane it had last render, before falling back to first-free) specifically to stop one
// dragged task from reshuffling every other task's lane on the same render. That traded away
// correctness for stability in a way that back-fired: a task that could have shared an already-
// freed lane sometimes didn't, because its neighbors' stale hints kept pointing at their own old
// (now non-adjacent) slots, leaving a visible gap and inflating the overflow count by one more
// than necessary — reported twice independently (a stuck "+N more" after dragging a task away,
// and a bar sitting one lane lower than a visibly free lane above it). Recomputing fresh, hint-
// free, every render is what "compact upward into free space when it opens up" actually requires
// — the two goals were in direct conflict, and correctness is the one that was actually asked for.
//
// `pinnedLanes` (Task.calendarLane, manually chosen by dragging a bar vertically) is a different
// thing from that old hint — it's an explicit user choice, not a stability nudge, so it's treated
// as authoritative rather than a soft preference. A pinned task claims its lane outright before
// the greedy pass runs; the remaining unpinned tasks then pack around it.
//
// First cut of this seeded a lane's trailing "occupied until" end-time from the pinned task and
// reused the plain `laneEnds[lane] < candidateStart` check the unpinned loop already used — which
// is only correct because that loop processes tasks in start-time order, so whoever currently
// holds a lane is always guaranteed to have started no later than the candidate being placed. A
// pin breaks that guarantee: it can claim a lane regardless of where its own start time falls
// relative to the unpinned tasks being processed. A pinned task starting *later* than an unpinned
// one (e.g. pinned 28th–29th, unpinned candidate 27th–27th) was wrongly treated as "occupying"
// the lane for the whole window up to its own end, bumping an earlier, non-overlapping task into
// overflow it should never have been pushed into. Fixed by tracking each lane's pinned intervals
// explicitly and checking real interval overlap against them, independent of processing order —
// the unpinned-vs-unpinned bookkeeping (`laneEnds`, chronological by construction) is unaffected.
export function assignLanes(ranges: TaskRange[], pinnedLanes?: Map<string, number>): Map<string, number> {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const isFree = (end: number | undefined, startTime: number) => end === undefined || end < startTime;
  // Same <= reasoning as the cluster-merge below: a single-day range has start === end, so a
  // strict < would wrongly call two same-day ranges non-overlapping.
  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart <= bEnd && bStart <= aEnd;
  const lanes = new Map<string, number>();

  // Lane assignment runs per connected overlap cluster (merge-overlapping-intervals), not
  // globally across the whole visible range — otherwise a task with real breathing room on its
  // own day/row could still be constrained by an unrelated pileup elsewhere sharing the same
  // numbering space. Clustering scopes it to only the tasks actually competing for space together.
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

    const laneEnds: number[] = [];
    const pinnedIntervals = new Map<number, { start: number; end: number }[]>();

    for (const r of cluster) {
      const pinned = pinnedLanes?.get(r.id);
      if (pinned === undefined) continue;
      lanes.set(r.id, pinned);
      const list = pinnedIntervals.get(pinned) ?? [];
      list.push({ start: r.start.getTime(), end: r.end.getTime() });
      pinnedIntervals.set(pinned, list);
    }

    // A cluster of N tasks never needs more than N lanes even in the degenerate all-overlapping
    // case, so this bound is always enough — including for a brand-new, still-unused lane index.
    const maxLanes = cluster.length;
    for (const r of cluster) {
      if (lanes.has(r.id)) continue; // already placed via a pin above
      const startTime = r.start.getTime();
      const endTime = r.end.getTime();
      let laneIdx = -1;
      for (let lane = 0; lane < maxLanes; lane++) {
        if (!isFree(laneEnds[lane], startTime)) continue;
        const pinnedHere = pinnedIntervals.get(lane);
        if (pinnedHere?.some((p) => overlaps(startTime, endTime, p.start, p.end))) continue;
        laneIdx = lane;
        break;
      }
      if (laneIdx === -1) laneIdx = maxLanes; // shouldn't happen, but never leave a task unplaced
      laneEnds[laneIdx] = endTime;
      lanes.set(r.id, laneIdx);
    }

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

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTaskAssignDrop, useEventAssignDrop, assignDropClass } from './useAssignDrop';
import { MiniAvatar } from '../AssigneePicker';
import { Plus, Pin, CalendarClock } from 'lucide-react';
import GoogleIcon from '../icons/GoogleIcon';
import { getISOWeek, isSameDay } from '../../lib/calendarDates';
import { withAlpha } from '../../lib/colorAlpha';
import { hapticTap, hapticTapStrong } from '../../lib/haptics';
import type { ClippedSegment, DragMode, DragState } from '../../lib/ganttLayout';
import type { Task, Event } from '../../store/useTaskStore';


// A stable id for a calendar day, used both as the DOM marker a drag hit-tests against and as the
// key for "which cell is being held".
function dayKey(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

function dayFromKey(key: string): Date | null {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Which day the finger is over right now.
//
// Hit-testing the DOM rather than tracking geometry in React: the pointer is captured by the cell
// the gesture started in, so no other cell hears about the move, and the grid's own layout already
// knows where every day is. `elementFromPoint` asks it directly, and it keeps working across week
// rows — a drag from the end of one week into the next is the ordinary case here, not an edge one.
function dayUnderPointer(x: number, y: number): Date | null {
  const el = document.elementFromPoint(x, y);
  const cell = el instanceof Element ? el.closest('[data-day-key]') : null;
  const key = cell?.getAttribute('data-day-key');
  return key ? dayFromKey(key) : null;
}

// Inclusive, and order-independent — a range drawn backwards is the same range.
function isDayInRange(day: Date, range: { start: Date; end: Date } | null): boolean {
  if (!range) return false;
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const a = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()).getTime();
  const b = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate()).getTime();
  return t >= Math.min(a, b) && t <= Math.max(a, b);
}

// WeekRow-local render shape — `isOverflowCut` is purely a display decision made here (see the
// borrow logic below), never touched by assignLanes/CalendarView.tsx, so it doesn't belong on the
// shared ClippedSegment type. A plain ClippedSegment (the already-visible, un-borrowed case) is
// still structurally assignable since the field is optional.
type RenderSegment = ClippedSegment & { isOverflowCut?: boolean };

// Shrunk twice now from the expert visual-refinement pass's original 22-26px/3-5px target range
// per direct user feedback — first to 18/3 ("litt smalere, vertikalt"), then again here to 14/2
// once it was clear 18/3 still didn't comfortably fit 2 bars + the "+N" chip within
// MONTH_MAX_LANES' (2) row-height floor (see CalendarView.tsx). CalendarView.tsx's Fit mode (see
// its own comment) derives how many lanes actually fit a given row height from these two
// constants, same as the non-Fit MONTH_MAX_LANES/WEEK_MAX_LANES caps always have.
export const BAR_H = 14;
export const BAR_GAP = 2;
export const DAY_NUM_H = 26;
export const GUTTER_WIDTH = 34;
const CLICK_DRAG_THRESHOLD = 4;

type WeekRowProps = {
  weekDays: Date[];
  segments: ClippedSegment[];
  tasksById: Map<string, Task>;
  taskColorOf: (task: Task) => string;
  // Events share the exact same segment list/lane packing as Tasks (see CalendarView.tsx's
  // merged `ranges`) and, per the user's explicit ask, the exact same move/resize drag gestures
  // too (desktop only) — a segment whose id isn't in tasksById is looked up here instead and
  // rendered as an EventBar rather than a TaskBar.
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
  // A range, not a day: holding a cell and dragging across others draws one. A single tap-and-hold
  // reports the same day twice, which is what a one-day event is.
  onQuickAddDay: (day: Date, endDay: Date) => void;
  // Right-click on a day. Desktop only by nature — a long press already covers the same ground on
  // touch, and the two should not both fire from one gesture.
  onDayContextMenu?: (x: number, y: number, day: Date) => void;
  // The selection currently being drawn, owned by CalendarView so it can be highlighted across week
  // rows — a drag that starts in one week and ends in the next is the normal case, not the edge one.
  pendingRange: { start: Date; end: Date } | null;
  onPendingRangeChange: (range: { start: Date; end: Date } | null) => void;
  onDragStart: (id: string, mode: DragMode, e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  // Takes the dragged id, not a whole Task — CalendarView.tsx looks up whether it's a Task or an
  // Event itself (see its own handleDragEnd), same "generic by id" pattern ranges/lanes already
  // use everywhere else in this file.
  onDragEnd: (id: string, mode: DragMode) => void;
  onUnpinLane: (taskId: string) => void;
  // Resize/move-drag handles are mouse-cursor-sized hit targets that don't work on touch — on
  // mobile the bars take no touches at all and every press lands on the day cell underneath.
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
  onDayContextMenu,
  pendingRange,
  onPendingRangeChange,
  onDragStart,
  onDragMove,
  onDragEnd,
  onUnpinLane,
  isMobile,
}: WeekRowProps) {
  const pointerDownXYRef = useRef({ x: 0, y: 0 });
  const draggedRef = useRef(false);

  // Mobile day-cell tap-vs-long-press: a plain tap drills into Day view (onDrillDay), a press-and-
  // hold (~500ms, cancelled if the finger moves enough that it reads as a scroll instead) creates
  // a task on that day (onQuickAddDay) — replaces the old hover-revealed "+" corner button, which
  // on touch was permanently invisible (opacity-0 needs :hover, which touch never triggers) while
  // still being a real, tappable, easy-to-hit-by-accident target sitting on top of the day-cell
  // button. One shared timer/ref set at the row level is enough since only one finger interacts
  // with one cell at a time.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  // Set by the timer once the hold threshold is reached, CONSUMED on pointerup — the popover is
  // deliberately not opened from inside the timer itself any more. It used to be, which meant the
  // create popover mounted (and its title input autofocused, raising the keyboard) while the
  // finger was still down; the touch sequence then finished on top of freshly-mounted UI and the
  // resulting focus/blur fight made the keyboard slide up and straight back down, or never appear,
  // depending on exactly how long the hold lasted. Reported on a Galaxy S25: "hoppa keyboardet opp
  // så ned igjen... noen ganger ikke det hele tatt, basert på hvor lenge de holder inne."
  // Opening on release instead means focus is only ever requested once the touch is completely
  // over, so there's nothing left to steal it back.
  const longPressReadyRef = useRef(false);
  const longPressStartRef = useRef({ x: 0, y: 0 });
  const LONG_PRESS_MS = 500;
  // Which day the finger went down on, kept so a drag can be measured from it. The day currently
  // under the finger comes from hit-testing on every move, not from React — the pointer is captured
  // by the cell it started in, so its own move events are the only ones that arrive.
  const dragOriginRef = useRef<Date | null>(null);
  const draggingRangeRef = useRef(false);
  // Which cell is being held right now, for the hold animation. State rather than a ref because it
  // has to render.
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [holdArmed, setHoldArmed] = useState(false);
  // Where in the held cell the finger landed, and how big the fill has to grow to cover the whole
  // cell from there. The fill spreads outward from the fingertip rather than fading in evenly —
  // the cell visibly responds to *where* it was touched, which is most of what makes it feel alive.
  const [pressOrigin, setPressOrigin] = useState<{ x: number; y: number; size: number } | null>(null);
  const LONG_PRESS_MOVE_TOLERANCE = 8;

  // Stops the browser from taking the gesture over as a scroll once the hold has armed.
  //
  // The cells carry `touch-action: pan-y`, which says "a vertical drag is scrolling, not mine". That
  // is right while the finger might still be scrolling past — and wrong the instant the hold arms,
  // because from then on a vertical drag IS the gesture. The symptom was precise and repeatable:
  // drag straight down from a held day and the selection vanished; go right first and then down and
  // everything worked, because the browser had already committed the gesture to us.
  //
  // Changing touch-action mid-gesture is not reliable — browsers latch it when the touch sequence
  // begins — so this blocks the scroll the one way that always works: a non-passive touchmove
  // listener that calls preventDefault. Added only while a range is actually being drawn, and
  // removed on every path out, because a forgotten one silently disables scrolling for the page.
  const scrollBlockRef = useRef<((e: TouchEvent) => void) | null>(null);
  const blockScrollWhileDragging = () => {
    if (scrollBlockRef.current) return;
    const handler = (e: TouchEvent) => e.preventDefault();
    scrollBlockRef.current = handler;
    window.addEventListener('touchmove', handler, { passive: false });
  };
  const releaseScrollBlock = () => {
    if (!scrollBlockRef.current) return;
    window.removeEventListener('touchmove', scrollBlockRef.current);
    scrollBlockRef.current = null;
  };
  // A component unmounted mid-drag (switching month while holding) must not leave the listener
  // behind — the page would simply stop scrolling, with nothing on screen to explain why.
  useEffect(() => releaseScrollBlock, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Cancels an in-flight hold outright (finger left the cell, gesture interrupted) — distinct
  // from a completed hold, which pointerup consumes.
  const abandonLongPress = () => {
    releaseScrollBlock();
    clearLongPressTimer();
    longPressReadyRef.current = false;
    dragOriginRef.current = null;
    draggingRangeRef.current = false;
    setPressedKey(null);
    setHoldArmed(false);
    onPendingRangeChange(null);
  };

  // assignLanes (lib/ganttLayout.ts) gives every segment ONE lane for its whole clipped width in
  // this row, chosen so it's free across that *entire* span — a task can land in an overflow lane
  // purely because of a conflict on one or two days near its end, even though the visible-cap
  // lanes sat completely empty for days at its start. The old binary "lane < cap -> show, else
  // hide the whole segment" filter below made a task's "+N" cover its full width in that case,
  // even on days genuinely free of any conflict. Reported live: "+1" spanning 18 Aug - 1 Sep with
  // the first three days empty.
  //
  // Fixed by letting an overflow segment *borrow* a cap-visible lane for whichever leading run of
  // its own days that lane is actually free — rendered as a real, truncated bar (square right
  // edge instead of rounded, "åpen til høyre" per the request) for that prefix, folding into "+N"
  // only from where the real conflict starts. This is purely a rendering decision — it doesn't
  // touch `lanes`/assignLanes at all, so drag/pin logic (CalendarView.tsx's handleDragStart reads
  // `lanes.get(taskId)` directly, never a segment's own `.lane`) is completely unaffected; dragging
  // a borrowed-and-truncated bar still anchors off its real assigned lane, not the visual one.
  const alreadyVisible = segments.filter((s) => s.lane < maxVisibleLanes);
  const overflowByDay = new Array(7).fill(0);
  const borrowedSegments: RenderSegment[] = [];
  // occupied[lane][day]: true once something (an originally-visible segment, or an earlier
  // borrowed one) already claims that day/lane — checked so two overflow segments competing for
  // the same free gap on the same day don't both render on top of each other.
  const occupied: boolean[][] = Array.from({ length: Math.max(maxVisibleLanes, 1) }, () => new Array(7).fill(false));
  for (const s of alreadyVisible) {
    for (let d = s.colStart; d < s.colStart + s.colSpan; d++) occupied[s.lane][d] = true;
  }
  // Ascending lane order: the least-overflowed tasks (closest to actually fitting) get first pick
  // of any free borrowed slot — same priority order the lane numbers already encode.
  const candidateOverflow = segments.filter((s) => s.lane >= maxVisibleLanes).sort((a, b) => a.lane - b.lane);
  for (const s of candidateOverflow) {
    let bestLane = -1;
    let bestLen = 0;
    for (let lane = 0; lane < maxVisibleLanes; lane++) {
      let len = 0;
      for (let d = s.colStart; d < s.colStart + s.colSpan; d++) {
        if (occupied[lane][d]) break;
        len++;
      }
      if (len > bestLen) {
        bestLen = len;
        bestLane = lane;
      }
    }
    if (bestLane !== -1 && bestLen > 0) {
      for (let d = s.colStart; d < s.colStart + bestLen; d++) occupied[bestLane][d] = true;
      const fullyFits = bestLen === s.colSpan;
      borrowedSegments.push({
        ...s,
        lane: bestLane,
        colSpan: bestLen,
        isEndEdge: fullyFits ? s.isEndEdge : false,
        // Drives a dashed (not solid) right edge on the bar itself — a flat cut reads as "the bar
        // just stops," which isn't intuitive for "it keeps going, folded into +N from here." Kept
        // as its own flag rather than reusing `!isEndEdge`, since that's already true for the
        // unrelated, pre-existing case of a segment continuing into *next week's* row — this only
        // marks the new overflow-truncation case specifically.
        isOverflowCut: !fullyFits,
      });
    }
    for (let d = s.colStart + bestLen; d < s.colStart + s.colSpan; d++) {
      overflowByDay[d] = (overflowByDay[d] || 0) + 1;
    }
  }
  const visibleSegments: RenderSegment[] = [...alreadyVisible, ...borrowedSegments];

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
            // The out-of-month and weekend washes read from CSS variables rather than neutral
            // utilities: both are low-opacity tints that must stay *darker* than the cell behind
            // them, which an inverted neutral (see globals.css) would turn into "lighter than
            // white," i.e. invisible in light mode. Today's blue tint is chromatic, so it works
            // unchanged in both themes.
            const cellBg = outOfMonth
              ? 'bg-[var(--cell-tint-out-of-month)]'
              : isToday
                ? 'bg-blue-500/[0.035]'
                : isWeekend
                  ? 'bg-[var(--cell-tint-weekend)]'
                  : '';
            // ONE background class, never two.
            //
            // The interaction tints used to be appended after cellBg, which worked on every day
            // except today — the one day that already has a background of its own
            // (`bg-blue-500/[0.035]`). Two background utilities on the same element do not resolve
            // by the order they appear in the class attribute; they resolve by the order Tailwind
            // happened to emit them in the stylesheet, and there today's won. Reported exactly:
            // "funker på alle andre dager".
            //
            // So the state replaces the resting background rather than layering over it. That also
            // removes the guesswork about what a press should look like on top of an existing tint.
            const isPressed = pressedKey === dayKey(day);
            const inRange = isDayInRange(day, pendingRange);
            // On touch the hold and the range are drawn by an overlay ABOVE the bars instead (see
            // below), so a day covered in bars still visibly lights up. Tinting the cell as well
            // would show through the gaps between bars as a second, darker shade.
            const interaction = isMobile
              ? { className: '', transition: '' }
              : inRange || (holdArmed && isPressed)
              ? // Armed, or inside the range being drawn. Snaps rather than eases: this is the
                // moment the gesture changed meaning, and the change should be felt rather than
                // admired. It lands with the haptic tick.
                { className: 'bg-blue-500/25', transition: 'transition-colors duration-100' }
              : isPressed
                ? // Held. The tint grows over the length of the hold itself, so the cell is visibly
                  // filling while the timer runs — a long press used to be 500ms of nothing followed
                  // by a result, with no way to tell a hold that is working from a tap that missed.
                  { className: 'bg-blue-500/15', transition: 'transition-colors duration-500 ease-out' }
                : { className: '', transition: 'transition-colors duration-150' };

            return (
              <div key={i} className="relative group/day">
                <button
                  onContextMenu={
                    onDayContextMenu
                      ? (e) => {
                          // preventDefault so the browser's own menu does not open on top of ours —
                          // the same thing the Spaces tree does for its own right-click menus.
                          e.preventDefault();
                          e.stopPropagation();
                          onDayContextMenu(e.clientX, e.clientY, day);
                        }
                      : undefined
                  }
                  onClick={() => {
                    // A long-press that just fired onQuickAddDay still generates a trailing click
                    // once the finger lifts — swallow exactly that one rather than also drilling
                    // into Day view right behind it.
                    if (isMobile && longPressFiredRef.current) {
                      longPressFiredRef.current = false;
                      return;
                    }
                    onDrillDay(day);
                  }}
                  onPointerDown={
                    isMobile
                      ? (e) => {
                          longPressFiredRef.current = false;
                          longPressReadyRef.current = false;
                          longPressStartRef.current = { x: e.clientX, y: e.clientY };
                          dragOriginRef.current = day;
                          draggingRangeRef.current = false;
                          // The hold animation starts the instant the finger lands, so the cell is
                          // visibly filling while the 500ms runs. Without it a long press is 500ms
                          // of nothing followed by a result, and there is no way to tell a hold
                          // that is working from a tap that missed.
                          setPressedKey(dayKey(day));
                          setHoldArmed(false);
                          const rect = e.currentTarget.getBoundingClientRect();
                          const px = e.clientX - rect.left;
                          const py = e.clientY - rect.top;
                          // Twice the distance to the farthest corner: the circle's radius has to
                          // reach it, and its edge is soft, so a little more than that.
                          const reach = Math.hypot(Math.max(px, rect.width - px), Math.max(py, rect.height - py));
                          setPressOrigin({ x: px, y: py, size: reach * 2.4 });
                          // Keeps this cell receiving moves once the finger leaves it, which is
                          // what makes dragging across days possible at all — without capture the
                          // events go to whatever is underneath and this handler stops hearing.
                          e.currentTarget.setPointerCapture(e.pointerId);
                          clearLongPressTimer();
                          longPressTimerRef.current = window.setTimeout(() => {
                            // Only ARMS the gesture — the popover itself opens on release (see
                            // longPressReadyRef). The haptic tick fires here rather than on
                            // release so the hold still confirms itself at the moment the
                            // threshold is crossed, which is what makes it feel responsive
                            // despite the actual action being deferred.
                            longPressReadyRef.current = true;
                            draggingRangeRef.current = true;
                            setHoldArmed(true);
                            blockScrollWhileDragging();
                            onPendingRangeChange({ start: day, end: day });
                            // The fuller pulse, not the ordinary tick. The finger landing already
                            // got a light one (GlobalTapFeedback, on pointerdown), so a second
                            // identical tick said "something again" rather than "ready". This one
                            // is the "fully charged" moment the fill has been building towards.
                            hapticTapStrong();
                          }, LONG_PRESS_MS);
                        }
                      : undefined
                  }
                  onPointerMove={
                    isMobile
                      ? (e) => {
                          // Once the hold has armed, moving is no longer a reason to give up — it
                          // is the gesture. Before that it still is: a finger that slides off is
                          // scrolling, not holding.
                          if (draggingRangeRef.current) {
                            const origin = dragOriginRef.current;
                            if (!origin) return;
                            const over = dayUnderPointer(e.clientX, e.clientY);
                            if (!over) return;
                            onPendingRangeChange(
                              over.getTime() < origin.getTime() ? { start: over, end: origin } : { start: origin, end: over }
                            );
                            return;
                          }
                          if (longPressTimerRef.current === null) return;
                          const dx = e.clientX - longPressStartRef.current.x;
                          const dy = e.clientY - longPressStartRef.current.y;
                          if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) abandonLongPress();
                        }
                      : undefined
                  }
                  onPointerUp={
                    isMobile
                      ? () => {
                          releaseScrollBlock();
                          clearLongPressTimer();
                          setPressedKey(null);
                          setHoldArmed(false);
                          const drawn = pendingRange;
                          draggingRangeRef.current = false;
                          dragOriginRef.current = null;
                          onPendingRangeChange(null);
                          if (!longPressReadyRef.current) return;
                          longPressReadyRef.current = false;
                          // Marks the trailing click for swallowing (below) so releasing doesn't
                          // also drill into Day view behind the popover that's about to open.
                          longPressFiredRef.current = true;
                          // A second tick on release, so letting go is confirmed too. Holding and
                          // dragging is a long gesture, and one tick half a second before the
                          // result leaves the release itself unacknowledged.
                          hapticTap();
                          onQuickAddDay(drawn?.start ?? day, drawn?.end ?? day);
                        }
                      : undefined
                  }
                  onPointerCancel={isMobile ? abandonLongPress : undefined}
                  onPointerLeave={isMobile ? abandonLongPress : undefined}
                  // Vertical separators kept, but deliberately faint — the grid should register
                  // subconsciously, not read as a spreadsheet of boxed cells. The week-row
                  // boundary (this same border-b, once per row) stays clearly stronger so weeks
                  // are still easy to tell apart at a glance.
                  data-day-key={dayKey(day)}
                  // The global :active scale is wrong here: a calendar cell is part of a grid, and
                  // shrinking one leaves a visible gap in the ruling around it. Cells say "pressed"
                  // with colour instead, below.
                  data-no-press
                  className={`relative w-full h-full flex flex-col items-start text-left border-r border-r-neutral-800/[0.12] last:border-r-0 px-2 pt-1 cursor-pointer hover:bg-neutral-800/20 ${
                    isLastRow ? '' : 'border-b border-b-neutral-800/50'
                  } ${interaction.className || cellBg} ${interaction.transition}`}
                  style={isMobile ? { touchAction: 'pan-y' } : undefined}
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
                    // The "+" button is a single day by definition — same day both ends.
                    onQuickAddDay(day, day);
                  }}
                  title="New task"
                  // Bottom-right, not top-right — the date number already owns the top of the
                  // cell, and the bottom is where a day's own content visually "ends," so that's
                  // where adding something new to it belongs. z-10 (matching the overflow chip's
                  // own z-index) so it stays clickable on the rare day that both has overflow and
                  // is being hovered at once, rather than the two silently fighting over the same
                  // corner. Desktop-only (hidden md:flex) — on mobile this exact "new task" action
                  // is the day cell's own long-press (above); keeping this small corner button
                  // there too would just be a second, invisible-until-hover, easy-to-fat-finger
                  // target overlapping the tap-to-drill area.
                  className="hidden md:flex absolute bottom-1 right-1 z-10 w-4 h-4 rounded bg-neutral-800 text-neutral-400 hover:bg-blue-600 hover:text-white items-center justify-center opacity-0 group-hover/day:opacity-100 transition cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
                {/* The hold, drawn over the bars. z-20 puts it above the bar layer (a later sibling
                    with no z-index of its own); pointer-events-none keeps it out of hit-testing,
                    which dayUnderPointer relies on. Three states:
                      - held: a soft glow spreads from the fingertip across the 500ms hold
                      - armed (the day the hold began): a bloom, a ring and one sweep of light,
                        landing with the stronger haptic
                      - in the drawn range: a plain tint */}
                {isMobile && (isPressed || inRange) && (
                  <span aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    {isPressed && !holdArmed && pressOrigin && (
                      <span
                        className="siqt-hold-fill absolute rounded-full"
                        style={{
                          left: pressOrigin.x - pressOrigin.size / 2,
                          top: pressOrigin.y - pressOrigin.size / 2,
                          width: pressOrigin.size,
                          height: pressOrigin.size,
                          animationDuration: `${LONG_PRESS_MS}ms`,
                        }}
                      />
                    )}
                    {isPressed && holdArmed && <span className="siqt-hold-armed absolute inset-0" />}
                    {inRange && !(isPressed && holdArmed) && <span className="siqt-hold-range absolute inset-0" />}
                  </span>
                )}
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
                    // Passes touches through on mobile, like the bars: it only drills into this
                    // same day, which the cell underneath does too, and as a target of its own it
                    // would swallow a long press started on it.
                    className={`absolute left-1 right-1 z-10 text-left cursor-pointer ${isMobile ? 'pointer-events-none' : ''}`}
                    style={{ top: overflowTop }}
                  >
                    {/* "+N", not "+N more" — and shrunk again (8px, tighter padding, no leading
                        dot) per direct feedback ("enda mindre") once the bars themselves got
                        shorter, so this still reads as clearly smaller than a bar rather than
                        competing with one for vertical space. */}
                    <span className="inline-flex items-center text-[8px] leading-none text-neutral-300 bg-neutral-800/70 hover:bg-neutral-700/80 border-l-2 border-neutral-600 rounded-sm px-1 py-[2px] transition">
                      +{overflowByDay[i]}
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

            // Events move and resize exactly like Tasks now (see EventBar's own comment).
            //
            // On mobile the bars take no touches at all (see the wrappers' pointer-events). A bar
            // is only a few pixels tall there, so tapping one used to drill into the day under the
            // finger instead of opening it ("siden de barsa er så små på mobil"). That is exactly
            // what tapping the cell does. So the bar's own handler added nothing, but it did cost
            // something: it covered the cell, and a long press that started on a bar never
            // reached the cell. A full day could only be held on the sliver of empty space left
            // under its bars. Reported: "da må du liksom treffe det lille åpne området".
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
  seg: RenderSegment;
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
  const { isOver, justAssigned, dropProps } = useEventAssignDrop(event);
  return (
    <div
      {...dropProps}
      className={`absolute ${isMobile ? 'pointer-events-none' : 'pointer-events-auto'} ${assignDropClass(isOver, justAssigned)}`}
      style={{ ...barStyle, opacity: isDraggingThis ? 0.35 : 1 }}
    >
      <button
        onPointerDown={isMobile ? undefined : (e) => onStartInteraction(e, event.id, 'move')}
        onPointerMove={isMobile ? undefined : (e) => onMoveInteraction(e, event.id)}
        onPointerUp={isMobile ? undefined : (e) => onEndInteraction(e, event.id, 'move')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={event.title}
        // Dashed border (Tasks are always solid) is the at-a-glance Task-vs-Event tell in every
        // Planner granularity, alongside the CalendarClock icon — a plain color difference alone
        // isn't reliable since either can be given any color.
        className={`relative w-full h-full flex items-center gap-1 text-[10px] leading-none font-medium truncate cursor-grab active:cursor-grabbing select-none border border-dashed transition-colors ${
          seg.isStartEdge ? 'rounded-l-md pl-2.5' : 'pl-1.5'
        } ${seg.isEndEdge ? 'rounded-r-md pr-2' : 'pr-1'}`}
        style={{
          backgroundColor: withAlpha(color, hovered ? HOVER_BG_ALPHA : BASE_BG_ALPHA),
          borderColor: withAlpha(color, hovered ? HOVER_BORDER_ALPHA : BASE_BORDER_ALPHA),
          color,
        }}
      >
        {event.importedFromGoogle ? (
          <GoogleIcon className="w-2.5 h-2.5 shrink-0" />
        ) : (
          <CalendarClock className="w-2.5 h-2.5 shrink-0" />
        )}
        <span className="truncate">{event.title}</span>
      </button>
      {/* Resizable (stretch/shrink either edge), same as a Task bar — per the user's explicit
          ask to have Events drag/resize exactly like Tasks do, desktop only. Skipped on mobile
          entirely — a 2px-wide edge strip isn't a workable touch target, and on touch the whole
          bar passes presses through to the day cell anyway. */}
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
  seg: RenderSegment;
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
  const { isOver, justAssigned, dropProps } = useTaskAssignDrop(task);
  return (
    <div
      {...dropProps}
      className={`absolute group/bar ${isMobile ? 'pointer-events-none' : 'pointer-events-auto'} ${assignDropClass(isOver, justAssigned)}`}
      style={{ ...barStyle, opacity: isDraggingThis ? 0.35 : 1 }}
    >
      <div
        // Mobile never wires up the move-drag pointer handlers — on touch the bar lets every
        // press through to the day cell underneath (see the wrapper above).
        onPointerDown={isMobile ? undefined : (e) => onStartInteraction(e, task.id, 'move')}
        onPointerMove={isMobile ? undefined : (e) => onMoveInteraction(e, task.id)}
        onPointerUp={isMobile ? undefined : (e) => onEndInteraction(e, task.id, 'move')}
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
          // Tasks are always solid-bordered (the Task-vs-Event tell, see EventBar's own comment)
          // — except right here: a bar truncated by the overflow-borrow logic above (WeekRow's own
          // visibleSegments computation) gets a dashed right edge specifically, so a flat "it just
          // stops" cut reads instead as "it keeps going, folded into +N from here."
          ...(seg.isOverflowCut ? { borderRightStyle: 'dashed' as const, borderRightWidth: 2 } : {}),
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
              <MiniAvatar key={a.id} user={a} size={14} className="ring-1 ring-neutral-900/60" />
            ))}
            {assignees.length > 1 && (
              <span className="w-3.5 h-3.5 rounded-full border border-neutral-900/60 bg-neutral-700 text-[7px] font-bold flex items-center justify-center text-app-strong shrink-0">
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
          className="absolute -top-1 -right-1 z-10 w-3 h-3 rounded-full bg-neutral-900 border border-neutral-600 text-neutral-300 hover:text-app-strong hover:border-app-strong flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition cursor-pointer"
        >
          <Pin className="w-2 h-2" />
        </button>
      )}
    </div>
  );
}

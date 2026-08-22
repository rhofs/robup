import { useRef } from 'react';

type Options = {
  onLongPress: (e: React.PointerEvent) => void;
  enabled?: boolean;
  delay?: number;
  moveTolerance?: number;
};

// Shared press-and-hold gesture: fires onLongPress after `delay`ms of holding still, cancelled if
// the pointer moves more than `moveTolerance`px first (reads as a scroll/swipe, not a hold). Used
// wherever a touch device needs an equivalent to a desktop hover-reveal or right-click affordance
// (Chat's reply/thread/react bar, a Task row's context menu) — same pattern already proven in
// components/calendar/WeekRow.tsx's day-cell long-press, just factored out for reuse rather than
// copied a third time.
export function useLongPress({ onLongPress, enabled = true, delay = 500, moveTolerance = 8 }: Options) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = !enabled
    ? undefined
    : (e: React.PointerEvent) => {
        firedRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };
        clear();
        timerRef.current = window.setTimeout(() => {
          firedRef.current = true;
          onLongPress(e);
        }, delay);
      };

  const onPointerMove = !enabled
    ? undefined
    : (e: React.PointerEvent) => {
        if (timerRef.current === null) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.abs(dx) > moveTolerance || Math.abs(dy) > moveTolerance) clear();
      };

  const onPointerUp = !enabled ? undefined : clear;
  const onPointerLeave = !enabled ? undefined : clear;

  // A long-press that just fired still produces a trailing click once the finger lifts — callers
  // should check this inside their own onClick and swallow exactly that one click (consuming the
  // flag, so the next real tap isn't accidentally swallowed too).
  const wasLongPress = () => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, wasLongPress };
}

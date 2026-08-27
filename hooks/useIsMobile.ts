import { useEffect, useState } from 'react';

// Matches on viewport width OR pointer precision so a touch-primary device with a wide
// viewport (large tablet in portrait, foldable) still gets the touch interaction model,
// not just phones.
const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse)';

const readIsMobile = () => (typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false);

export function useIsMobile(): boolean {
  // Lazy initializer, not a bare `useState(false)` — this hook is called fresh by every
  // component instance, including ones that mount long after the page's own initial
  // hydration (e.g. TaskRow, recreated every time the task list remounts on navigation).
  // A bare `false` default meant *every* such fresh mount rendered the desktop layout for
  // one frame before this hook's own effect corrected it — invisible most of the time, but
  // occasionally visible as a real painted frame (timing-dependent on how much other work
  // was happening in that same commit), showing a stray "desktop row" flash that then
  // layout-animates into the real mobile card. Reported live as tasks in Spaces/My Tasks
  // "bouncing"/animating in specifically when returning from Chat (not Planner) — the
  // underlying race was the same on both paths, it just wasn't always slow enough to
  // actually get painted coming from Planner. `typeof window !== 'undefined'` keeps this
  // safe during actual SSR (falls back to `false`, matching the old behavior exactly for a
  // page's real first paint); for any client-only mount after that, `window` already exists,
  // so the value is correct from this component's very first render — no flash, nothing to
  // fix in an effect after the fact.
  const [isMobile, setIsMobile] = useState(readIsMobile);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}

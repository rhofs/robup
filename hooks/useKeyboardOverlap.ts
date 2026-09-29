'use client';

import { useEffect, useState } from 'react';

// How many pixels of the screen the on-screen keyboard covers — the same measurement ChatPanel makes
// for its composer (see the long note there), shared for anything anchored to the bottom.
//
// In the Android app the keyboard does not resize the page; it covers it, and when a focused field
// ends up underneath, the WebView pans the whole page up to show it — which is how the top of a
// bottom sheet ended up under the status bar ("fortsatt så høyt oppe at den går under
// statuslinjen"). Lifting a sheet by this amount keeps its fields above the keyboard, so there is
// nothing to pan for. Where the page resizes instead, it is 0 and nothing changes.
export function useKeyboardOverlap(): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Under ~80px is browser chrome (a collapsing URL bar), not a keyboard.
      setOverlap(covered > 80 ? covered : 0);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);
  return overlap;
}

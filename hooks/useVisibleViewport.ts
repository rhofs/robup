'use client';

import { useEffect, useState } from 'react';

// The part of the screen actually visible: its top and height in layout-viewport pixels, from
// window.visualViewport. For anything anchored to the bottom that must stay above the on-screen
// keyboard — the mobile sheets.
//
// Neither phone resizes the page for the keyboard. Android covers it; iOS covers it AND scrolls the
// page to bring the focused field into view, leaving it scrolled after the keyboard closes. A sheet
// laid out against the full page therefore ended up with its top under the status bar and needed a
// scroll to get back ("man må scrolle ned, eller scrolle opp for å komme tilbake"). Laying the
// overlay out against this box instead — top = offsetTop, height = visible height — keeps the whole
// sheet on screen whatever the keyboard or the page scroll is doing. Where the page does resize, the
// box is simply the whole screen.
export type VisibleBox = { top: number; height: number };

export function useVisibleViewport(): VisibleBox | null {
  const [box, setBox] = useState<VisibleBox | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const measure = () => setBox({ top: vv.offsetTop, height: vv.height });
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      // iOS leaves the page scrolled after it scrolled a focused field into view; put it back when
      // the sheet goes, or the app sits shifted under the status bar.
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };
  }, []);
  return box;
}

// Style for a full-screen overlay that should cover only what is visible.
export function overlayStyle(box: VisibleBox | null): React.CSSProperties {
  return box ? { top: box.top, height: box.height, bottom: 'auto' } : {};
}

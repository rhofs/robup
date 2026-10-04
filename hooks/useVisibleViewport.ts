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
    // While a sheet is up, the page behind it does not move. When the keyboard opens, the browser may
    // pan the visible area down to "reveal" the focused field — which the sheet has already put above
    // the keyboard — and everything behind the sheet slid up under the status bar. It happened only
    // some of the time, depending on whether the keyboard or the sheet's layout won the race ("Noen
    // ganger … riktig … task lista ble liksom pusha litt opp"). Any pan is undone on the next frame;
    // the sheet, laid out against the visible box, is still above the keyboard after it, so the
    // browser has nothing left to reveal and does not pan again. Not while pinch-zoomed: that pan is
    // the user's own.
    let raf = 0;
    const unpan = () => {
      if (vv.offsetTop > 0.5 && Math.abs(vv.scale - 1) < 0.01) window.scrollTo(0, 0);
    };
    const measure = () => {
      setBox({ top: vv.offsetTop, height: vv.height });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(unpan);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      // Leave the page where it belongs when the sheet goes. Unconditionally: a pan of the visible
      // area does not show in window.scrollY, which is what this used to check.
      window.scrollTo(0, 0);
    };
  }, []);
  return box;
}

// Style for a full-screen overlay that should cover only what is visible.
export function overlayStyle(box: VisibleBox | null): React.CSSProperties {
  return box ? { top: box.top, height: box.height, bottom: 'auto' } : {};
}

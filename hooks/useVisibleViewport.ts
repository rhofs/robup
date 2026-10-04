'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

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

// While any sheet is open, the on-screen keyboard RESIZES the page instead of covering it (the
// viewport meta's interactive-widget=resizes-content), and the setting goes back when the last sheet
// closes.
//
// Why: with the default (the keyboard only covers), Android's browser engine — Chrome, and the WebView
// inside the app — keeps the page full height under the keyboard, and when a field gains focus it
// may PAN the visible area down to show it. Fixed layers positioned against the visible box followed
// the pan; anything that was not (the new-task card held in place under a picker) and the whole page
// behind slid up by exactly one keyboard height, under the status bar: "task lista ble liksom pusha
// litt opp", the card overshooting at the end of its entrance, and the Assignees and calendar pickers
// showing the card above them. A pan of the visible area cannot be undone from script —
// window.scrollTo moves the page, not the pan, which is why two rounds of trying failed. With the page
// resized instead, the visible area IS the page, so there is nothing to pan. iOS ignores the setting
// and keeps its own behaviour, handled by the scroll reset below.
//
// Only while a sheet is up: elsewhere (a chat box, the search field) the app is laid out for the
// keyboard covering the page, and a resize would lift the bottom nav above the keyboard there.
let sheetsOpen = 0;
let originalViewport: string | null = null;
function setResizesContent(on: boolean) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  if (on) {
    originalViewport = meta.getAttribute('content') ?? '';
    if (!/interactive-widget/.test(originalViewport)) meta.setAttribute('content', `${originalViewport}, interactive-widget=resizes-content`);
  } else if (originalViewport !== null) {
    meta.setAttribute('content', originalViewport);
    originalViewport = null;
  }
}

export function useVisibleViewport(): VisibleBox | null {
  const [box, setBox] = useState<VisibleBox | null>(null);
  // A layout effect, so the setting is in place within the same commit that mounts the sheet — before
  // its field takes focus and the keyboard is asked for.
  useLayoutEffect(() => {
    if (sheetsOpen++ === 0) setResizesContent(true);
    return () => {
      if (--sheetsOpen === 0) setResizesContent(false);
    };
  }, []);
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
      // iOS scrolls the page itself to bring a focused field into view and leaves it scrolled after
      // the keyboard closes; put it back when the sheet goes, or the app sits shifted under the status
      // bar.
      window.scrollTo(0, 0);
    };
  }, []);
  return box;
}

// Style for a full-screen overlay that should cover only what is visible.
export function overlayStyle(box: VisibleBox | null): React.CSSProperties {
  return box ? { top: box.top, height: box.height, bottom: 'auto' } : {};
}

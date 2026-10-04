'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

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
// In the Android app the page is resized natively for the keyboard, frame by frame (MainActivity), so a
// sheet pinned to the page's bottom edge with plain CSS is already on top of the keyboard, in the same
// frame. Positioning it from the visual viewport in React state instead lagged a frame behind the edge
// on every step of the keyboard's animation.
export const keyboardResizesPage = typeof window !== 'undefined' && Capacitor.getPlatform() === 'android';

let sheetsOpen = 0;
// The page behind is held at its full height while any sheet is open. When the keyboard resizes the
// page, everything sized to it — the whole app, every card in the list — was laid out again on every
// frame of the keyboard's animation, which is what made a sheet's entrance stutter ("hakkete og
// uoptimalisert"), and the page behind visibly reflowed under the dimming. Held, the keyboard only
// changes the sheet layers, and the page behind does not move at all.
function holdPage(on: boolean) {
  const shell = document.querySelector('.siqt-app-shell') as HTMLElement | null;
  if (!shell) return;
  shell.style.height = on ? `${fullViewportBox().height}px` : '';
}
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
    if (sheetsOpen++ === 0) {
      setResizesContent(true);
      holdPage(true);
    }
    return () => {
      if (--sheetsOpen === 0) {
        setResizesContent(false);
        holdPage(false);
      }
    };
  }, []);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    // Where the page itself follows the keyboard, sheets are pinned by CSS and nothing reads this box —
    // and measuring it would re-render every open sheet on every frame of the keyboard's animation,
    // which is part of what made the new-task card stutter. Only the scroll reset below is kept.
    if (keyboardResizesPage) return () => window.scrollTo(0, 0);
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

// The page's height with no keyboard up: the tallest it has been. A sheet with no text field of its
// own (the calendar, the clock, the status and List pickers) is laid out against this instead of the
// visible box. Such a sheet sends the keyboard away as it opens, and the page grows back while the
// sheet is still sliding in — a sheet anchored to the shrinking-then-growing bottom was dragged down
// with it ("Set dates hopper litt fortsatt"). Anchored to the full height it simply sits where it will
// end up, and the keyboard sliding away uncovers it.
let fullHeight = 0;
export function fullViewportBox(): VisibleBox {
  if (typeof window === 'undefined') return { top: 0, height: 0 };
  fullHeight = Math.max(fullHeight, window.innerHeight);
  return { top: 0, height: fullHeight };
}
if (typeof window !== 'undefined') {
  // Measured from the start (this module loads with the app, keyboard down) and on every resize, so it
  // is known before any sheet asks — by then the keyboard may already be up.
  fullHeight = window.innerHeight;
  window.addEventListener('resize', () => {
    fullHeight = Math.max(fullHeight, window.innerHeight);
  });
  // A turn of the phone changes what "full" is.
  window.addEventListener('orientationchange', () => {
    fullHeight = 0;
  });
}

// The style for a sheet layer that should sit on the visible area, following the keyboard. Where the
// page itself is resized for the keyboard, that is simply the page — top 0, bottom 0 — and no style is
// needed; elsewhere it is the measured visible box.
export function liveOverlayStyle(box: VisibleBox | null): React.CSSProperties {
  return keyboardResizesPage ? {} : overlayStyle(box);
}

// The visible area right now, read directly (not from React state, which trails by a render).
export function currentVisibleBox(): VisibleBox | null {
  if (typeof window === 'undefined') return null;
  const vv = window.visualViewport;
  return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight };
}

// Style for a full-screen overlay that should cover only what is visible.
export function overlayStyle(box: VisibleBox | null): React.CSSProperties {
  return box ? { top: box.top, height: box.height, bottom: 'auto' } : {};
}

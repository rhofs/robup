'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { ignoreNextPopState, pushBackLayer } from '../lib/nativeBack';

// While `open`, Back (Android's button or gesture, iOS's edge swipe) closes this overlay and nothing
// else — the same deal the Planner's "New" sheet has. On the web on a touch screen the overlay also
// gets a history entry of its own (same address), because iOS's swipe is a real history step: the
// swipe pops that entry and the page's popstate bridge hands it to the layer. If the overlay closes
// another way, the entry is stepped back over quietly.
export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    let closedByBack = false;
    const remove = pushBackLayer(() => {
      closedByBack = true;
      closeRef.current();
    });
    const ownEntry = !Capacitor.isNativePlatform() && window.matchMedia('(pointer: coarse)').matches;
    const entryHref = window.location.href;
    if (ownEntry) window.history.pushState(window.history.state, '', entryHref);
    return () => {
      remove();
      if (!ownEntry || closedByBack) return;
      // After the page's own effects: if closing went with a navigation (a page picked in the sheet),
      // the page has pushed its new address by then, and stepping back would undo it. The spare entry
      // is left; it only costs one Back that lands where you already are.
      window.setTimeout(() => {
        if (window.location.href !== entryHref) return;
        ignoreNextPopState();
        window.history.back();
      }, 0);
    };
  }, [open]);
}

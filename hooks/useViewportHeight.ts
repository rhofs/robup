'use client';

import { useEffect } from 'react';

// Publishes the *visually available* height as `--app-height` on <html>.
//
// The app root is sized with `h-dvh`, which correctly follows the browser's own collapsing address
// bar — but `dvh` does not account for the on-screen keyboard. On iOS the layout viewport keeps its
// full height when the keyboard opens; only the VISUAL viewport shrinks. Safari then scrolls the
// page to bring the focused input into view, which pushes the header off the top while the bottom
// of the app sits behind the keyboard. Reported as the chat being "cropped" while writing and fine
// otherwise — the width was never the problem, which is why an earlier attempt at horizontal
// overflow changed nothing.
//
// window.visualViewport is the only thing that reports the real remaining space, so the root height
// follows it. Only the height is published: compensating for the viewport's own scroll offset would
// need a transform on the app root, and a transform there establishes a containing block that would
// relocate every `position: fixed` element in the app.
//
// Falls back silently where visualViewport is unavailable — the CSS keeps `100dvh` as its default,
// so nothing changes for those browsers.
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const apply = () => {
      const root = document.documentElement;
      root.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
    };

    apply();
    vv.addEventListener('resize', apply);
    // Safari can report the new height on 'scroll' rather than 'resize' when the keyboard settles,
    // so both are needed; `apply` is idempotent, so the overlap costs nothing.
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.documentElement.style.removeProperty('--app-height');
    };
  }, []);
}

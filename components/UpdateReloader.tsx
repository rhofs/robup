'use client';

import { useEffect } from 'react';

// Reloads the app when you come back to it after a deploy. A phone keeps the app — the home-screen
// web app, the Android shell — alive in the background for days, still running the code it opened
// with. That stopped being harmless once the collab server began turning away editors on older code
// (DOC_SCHEMA_VERSION, lib/collab/schema.ts): a phone left open across the 2026-10-01 deploy showed
// docs as empty until it was closed and reopened ("vises ikke docs på mobil").
//
// The commit the server reports when the app starts is taken as the code this page is running; each
// time the app comes back into view it asks again, and reloads if production has moved on. Only on
// coming back — never in the middle of something — and at most once per minute.
export default function UpdateReloader() {
  useEffect(() => {
    let loadedCommit: string | null = null;
    let lastCheck = 0;
    const current = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        return res.ok ? ((await res.json()).commit as string | undefined) ?? null : null;
      } catch {
        return null;
      }
    };
    void current().then((c) => {
      loadedCommit = c;
    });
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || !loadedCommit) return;
      if (Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      const now = await current();
      if (now && now !== loadedCommit) window.location.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return null;
}

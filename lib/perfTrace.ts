'use client';

// Temporary on-device measurement (2026-10-04). Two problems could not be seen from here and two rounds
// of fixes by reasoning missed them: the new-task card on Android stutters and sometimes overshoots,
// and the first List opened after launch hitches once. So the phone records what actually happens —
// for about a second after each of the first few of those moments per launch — and sends it to the
// server (app/api/debug/trace), where it is read back.
//
// Per frame: how long the frame took, the page/viewport heights, and the positions of the elements
// named by `selectors`. Plus the browser's own "long animation frame" entries where it has them
// (Chrome/WebView 123+), which name the scripts that made a frame long.
//
// Remove this file and its callers once the two problems are understood.

const counts: Record<string, number> = {};
const MAX_PER_KIND = 3;

type Sample = Record<string, number | null>;

export function traceMoment(kind: string, selectors: Record<string, string>, durationMs = 1100) {
  if (typeof window === 'undefined' || window.innerWidth >= 768) return;
  counts[kind] = (counts[kind] ?? 0) + 1;
  if (counts[kind] > MAX_PER_KIND) return;
  const seq = counts[kind];
  const t0 = performance.now();
  const samples: Sample[] = [];
  const loaf: unknown[] = [];
  let last = t0;

  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Array<Record<string, unknown>>) {
        loaf.push({
          start: Math.round((e.startTime as number) - t0),
          duration: Math.round(e.duration as number),
          blocking: Math.round((e.blockingDuration as number) ?? 0),
          renderStart: e.renderStart ? Math.round((e.renderStart as number) - t0) : null,
          styleAndLayoutStart: e.styleAndLayoutStart ? Math.round((e.styleAndLayoutStart as number) - t0) : null,
          scripts: ((e.scripts as Array<Record<string, unknown>>) ?? []).slice(0, 6).map((sc) => ({
            invoker: sc.invoker,
            fn: sc.sourceFunctionName,
            src: typeof sc.sourceURL === 'string' ? (sc.sourceURL as string).split('/').pop() : null,
            duration: Math.round(sc.duration as number),
            forcedLayout: Math.round((sc.forcedStyleAndLayoutDuration as number) ?? 0),
          })),
        });
      }
    });
    observer.observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    observer = null;
  }

  const frame = () => {
    const now = performance.now();
    const vv = window.visualViewport;
    const s: Sample = {
      t: Math.round(now - t0),
      dt: Math.round(now - last),
      innerH: window.innerHeight,
      vvH: vv ? Math.round(vv.height) : null,
      vvTop: vv ? Math.round(vv.offsetTop) : null,
      scrollY: Math.round(window.scrollY),
    };
    for (const [name, sel] of Object.entries(selectors)) {
      const el = document.querySelector(sel);
      if (!el) {
        s[`${name}Top`] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      s[`${name}Top`] = Math.round(r.top);
      s[`${name}Bottom`] = Math.round(r.bottom);
    }
    samples.push(s);
    last = now;
    if (now - t0 < durationMs) requestAnimationFrame(frame);
    else finish();
  };
  requestAnimationFrame(frame);

  const finish = () => {
    // Let the observer deliver the last entries.
    window.setTimeout(() => {
      observer?.disconnect();
      const body = JSON.stringify({ kind, seq, ua: navigator.userAgent, dpr: window.devicePixelRatio, samples, loaf });
      void fetch('/api/debug/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }, 300);
  };
}

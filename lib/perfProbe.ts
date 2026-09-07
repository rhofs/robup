'use client';

// Temporary instrumentation for the Spaces/My Tasks stutter, enabled only by `?perf=1`.
//
// Remote debugging over USB could not be made to work on the device in question (the phone reached
// "pending authentication" and the authorisation dialog never appeared), so this stands in for a
// real Chrome performance profile. It is deliberately far less than one — it cannot say WHICH
// function is spending the time — but it can answer the questions that actually separate the
// remaining hypotheses: is it one long block or many small ones, how long, and does it land before
// or after the sheet is painted.
//
// DELETE THIS FILE once the cause is known. It exists to answer one question.

export type PerfEntry = {
  kind: 'interaction' | 'longtask' | 'paint';
  label: string;
  // ms since the most recent interaction — the number that matters, since an 80ms block half a
  // second after the tap is a very different problem from one 5ms after it.
  sinceInteraction: number;
  duration: number;
};

const listeners = new Set<(entries: PerfEntry[]) => void>();
let entries: PerfEntry[] = [];
let lastInteractionAt = 0;
let started = false;

export function isPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('perf') === '1';
}

function push(entry: PerfEntry) {
  // Newest first, capped — a long session must not turn this into a memory leak on the user's
  // phone, and only the moments around the last tap are ever interesting.
  entries = [entry, ...entries].slice(0, 12);
  listeners.forEach((fn) => fn(entries));
}

// Called at the moment of a tap, so every block that follows can be reported relative to it.
export function markInteraction(label: string) {
  if (!isPerfEnabled()) return;
  lastInteractionAt = performance.now();
  entries = [];
  push({ kind: 'interaction', label, sinceInteraction: 0, duration: 0 });
}

// Called once the thing the tap opened has actually been laid out.
export function markPainted(label: string) {
  if (!isPerfEnabled() || !lastInteractionAt) return;
  push({ kind: 'paint', label, sinceInteraction: Math.round(performance.now() - lastInteractionAt), duration: 0 });
}

export function subscribePerf(fn: (entries: PerfEntry[]) => void): () => void {
  listeners.add(fn);
  fn(entries);

  if (!started && isPerfEnabled()) {
    started = true;
    try {
      // 'longtask' reports anything that blocked the main thread for over 50ms — i.e. anything that
      // could have dropped a frame. This is the browser's own measurement, not an approximation.
      const observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          push({
            kind: 'longtask',
            label: (e as PerformanceEntry & { attribution?: { name?: string }[] }).attribution?.[0]?.name || 'blocked',
            sinceInteraction: lastInteractionAt ? Math.round(e.startTime - lastInteractionAt) : -1,
            duration: Math.round(e.duration),
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // Not supported everywhere; the overlay then just shows interaction/paint marks, which still
      // answers "how long until it appeared".
    }
  }

  return () => listeners.delete(fn);
}

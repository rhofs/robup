'use client';

import { useEffect, useState } from 'react';
import { isPerfEnabled, subscribePerf, type PerfEntry } from '../lib/perfProbe';

// On-screen readout for the perf probe — see lib/perfProbe.ts. Rendered only with `?perf=1`, so it
// cannot appear for anyone who has not deliberately asked for it. Deliberately plain and
// unstyled-looking: it is a measuring instrument, not part of the app.
export default function PerfOverlay() {
  const [entries, setEntries] = useState<PerfEntry[]>([]);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isPerfEnabled()) return;
    setEnabled(true);
    return subscribePerf(setEntries);
  }, []);

  if (!enabled) return null;

  const blocked = entries.filter((e) => e.kind === 'longtask');
  const total = blocked.reduce((sum, e) => sum + e.duration, 0);

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-black/85 text-white text-[10px] font-mono p-2 leading-tight pointer-events-none">
      <div className="font-bold">
        perf · {blocked.length} block(s) · {total}ms total
      </div>
      {entries.length === 0 && <div>tap Spaces or My Tasks…</div>}
      {entries.map((e, i) => (
        <div key={i}>
          {e.kind === 'interaction' && <span className="text-emerald-400">TAP {e.label}</span>}
          {e.kind === 'paint' && <span className="text-sky-400">PAINTED {e.label} +{e.sinceInteraction}ms</span>}
          {e.kind === 'render' && <span className="text-neutral-400">render {e.label} +{e.sinceInteraction}ms</span>}
          {e.kind === 'longtask' && (
            <span className={e.duration > 150 ? 'text-red-400' : 'text-amber-400'}>
              BLOCK {e.duration}ms @ +{e.sinceInteraction}ms ({e.label})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

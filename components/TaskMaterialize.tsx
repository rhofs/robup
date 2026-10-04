'use client';

import { useEffect, useMemo } from 'react';
import { hapticTap } from '../lib/haptics';

// The moment a task you just made arrives in its List: star dust rushes in from around the card and
// gathers on its edges, a line of blue light traces the frame, and the card itself materialises inside
// it (TaskRow fades and sharpens it in step), finished by a sweep of light across it and a short glow.
// Asked for as: "partikkeleffektene på en måte danner rammer … at det liksom den spåner inn", because a
// new task used to appear at the bottom of the list with nothing to say it had — "det er nesten så du
// ikke vet om den blir laget eller ikke".
//
// Drawn over the card by TaskRow while `materialize` is set; app/page.tsx clears it again after
// MATERIALIZE_MS. Everything is CSS (globals.css, .siqt-mat-*): transforms, opacity and one stroke, so
// it stays smooth on a phone that is also busy saving the task.
//
// Random-looking but deterministic: seeded from the task's id, because a render must give the same
// result every time it runs.

export const MATERIALIZE_MS = 1500;

function seeded(seedText: string) {
  let h = 1779033703;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// `radius` matches the row it sits on: 16 for a phone's card (rounded-2xl), smaller for a desktop row.
export default function TaskMaterialize({ seed, radius = 16 }: { seed: string; radius?: number }) {
  // Specks start out past the card and land on its edge — the frame is built from them.
  const specks = useMemo(() => {
    const rand = seeded(seed);
    const out: { left: number; top: number; dx: number; dy: number; size: number; delay: number; dur: number; star: boolean }[] = [];
    const N = 44;
    for (let i = 0; i < N; i++) {
      // A point on the edge: which side (weighted to the long ones), and where along it.
      const r = rand();
      const along = rand() * 100;
      const side = r < 0.34 ? 'top' : r < 0.68 ? 'bottom' : r < 0.84 ? 'left' : 'right';
      const left = side === 'left' ? 0 : side === 'right' ? 100 : along;
      const top = side === 'top' ? 0 : side === 'bottom' ? 100 : along;
      // Flying in from outside, roughly away from that edge, with some sideways drift.
      const out_ = 34 + rand() * 46;
      const drift = (rand() - 0.5) * 50;
      const dx = side === 'left' ? -out_ : side === 'right' ? out_ : drift;
      const dy = side === 'top' ? -out_ : side === 'bottom' ? out_ : drift * 0.6;
      out.push({
        left,
        top,
        dx,
        dy,
        size: 2 + rand() * 3,
        delay: rand() * 220,
        dur: 420 + rand() * 220,
        star: i % 9 === 0,
      });
    }
    return out;
  }, [seed]);

  // The tick of a haptic as the frame closes — the "click into place".
  useEffect(() => {
    const t = window.setTimeout(() => hapticTap(), 560);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div aria-hidden className="siqt-mat pointer-events-none absolute inset-0 z-20">
      {specks.map((s, i) => (
        <span
          key={i}
          className={s.star ? 'siqt-mat-star' : 'siqt-mat-dust'}
          style={
            {
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.star ? s.size * 2.6 : s.size,
              height: s.star ? s.size * 2.6 : s.size,
              '--dx': `${s.dx}px`,
              '--dy': `${s.dy}px`,
              animationDelay: `${s.delay}ms`,
              animationDuration: `${s.dur}ms`,
            } as React.CSSProperties
          }
        />
      ))}
      {/* The line of light around the frame: a rounded rectangle drawn by its own length (pathLength
          100), so it traces the same regardless of the card's size. */}
      <svg className="siqt-mat-frame absolute inset-0 w-full h-full overflow-visible">
        <rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} pathLength={100} fill="none" />
      </svg>
      <span className="siqt-mat-glow absolute inset-0" style={{ borderRadius: radius }} />
      <span className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius }}>
        <span className="siqt-mat-sheen" />
      </span>
    </div>
  );
}

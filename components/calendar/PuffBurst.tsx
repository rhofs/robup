'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// The "pop" when a long press on a Planner day takes: a soft cloud that puffs out from under the
// thumb, past the edges of the day, in pastel pink, peach, blue and lilac — asked for as "et 'pop'
// som avgir partikler i form av en 'sky' … som poffer ut … Rosa, blå, fersken … myke", and so that
// it reaches past the thumb and you can see where the event is being made.
//
// Drawn in a fixed layer on top of everything (a portal to <body>) at the finger's screen position,
// so it is not clipped by the calendar row it started in. It removes itself when the animation is
// over. Motion lives in CSS (.siqt-puff-* in app/globals.css) with each particle's direction, size
// and timing passed as custom properties — one keyframe for all of them.

export const PUFF_COLORS = ['#FFB8CF', '#FFD2B8', '#B8D4FF', '#E4CFFF', '#FFE0EA', '#CFE4FF'];

export type PuffParticle = { dx: number; dy: number; size: number; scale: number; delay: number; duration: number; color: string };

// Random per burst, so no two pops look the same. Made where the burst is started (an event, not a
// render), because a render has to be able to run twice and give the same result.
export function makePuffParticles(): PuffParticle[] {
  const out: PuffParticle[] = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    // Spread evenly round the circle with some jitter, so the cloud is round rather than clumped.
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 48 + Math.random() * 52;
    out.push({
      dx: Math.cos(angle) * dist,
      // A little lift, the way a puff of smoke rises.
      dy: Math.sin(angle) * dist - 10,
      size: 20 + Math.random() * 18,
      scale: 1 + Math.random() * 0.7,
      delay: Math.random() * 60,
      duration: 650 + Math.random() * 300,
      color: PUFF_COLORS[i % PUFF_COLORS.length],
    });
  }
  return out;
}

export default function PuffBurst({ x, y, particles, onDone }: { x: number; y: number; particles: PuffParticle[]; onDone: () => void }) {
  // Through a ref: the caller passes a new function on every render, and restarting the timer with
  // each one would keep a burst on screen for as long as the calendar kept re-rendering.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    const t = window.setTimeout(() => onDoneRef.current(), 1100);
    return () => window.clearTimeout(t);
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div aria-hidden className="siqt-puff-layer" style={{ left: x, top: y }}>
      <span className="siqt-puff-ring" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="siqt-puff"
          style={
            {
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--s': p.scale,
              '--c': p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body
  );
}

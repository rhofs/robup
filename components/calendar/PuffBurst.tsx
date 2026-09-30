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

// Blues and white — the app's own accent, not a separate palette. The pastel pink/peach/blue of the
// first versions was pulled back to keep the design continuous ("For å få appen til å være mer
// kontinuerlig lik i design tror jeg vi må gå tilbake på den pastellfargen").
export const PUFF_COLORS = ['#BFDBFE', '#93C5FD', '#60A5FA', '#DBEAFE', '#FFFFFF', '#A5C8FF'];

export type PuffParticle = {
  kind: 'dust' | 'star';
  dx: number;
  dy: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
  spin: number;
};

// Random per burst, so no two pops look the same. Made where the burst is started (an event, not a
// render), because a render has to be able to run twice and give the same result.
//
// Magic dust rather than a cloud — the second version's soft blobs read as "tegneserieskyer". Many
// tiny glowing specks that fly out at different speeds and flicker as they fade, and a handful of
// four-pointed sparkles that twinkle and turn.
// `amount` scales the burst: 1 for the pop when a hold takes, less for the small puff each day gives
// on release. `quick` is the release puff: shorter-lived and closer in, so it has settled before the
// "New" sheet opens — "Kan de partiklene … forsvinne før det arket … popper opp? De er litt voldsomme".
export function makePuffParticles(amount = 1, quick = false): PuffParticle[] {
  const out: PuffParticle[] = [];
  const dust = Math.round(30 * amount);
  const stars = Math.max(2, Math.round(7 * amount));
  for (let i = 0; i < dust + stars; i++) {
    const isStar = i >= dust;
    const angle = Math.random() * Math.PI * 2;
    // Dust spreads unevenly — most of it close, some flung far — which is what makes it read as a
    // spray of glitter rather than a ring.
    const dist = ((isStar ? 40 : 25) + Math.pow(Math.random(), 0.7) * (isStar ? 70 : 95)) * (0.5 + amount / 2) * (quick ? 0.6 : 1);
    out.push({
      kind: isStar ? 'star' : 'dust',
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - (isStar ? 14 : 8),
      size: isStar ? 9 + Math.random() * 7 : 2.5 + Math.random() * 4,
      delay: Math.random() * (quick ? 40 : isStar ? 140 : 90),
      duration: quick ? 320 + Math.random() * 120 : (isStar ? 900 : 700) + Math.random() * 450,
      color: PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)],
      spin: (Math.random() - 0.5) * 180,
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
    const t = window.setTimeout(() => onDoneRef.current(), 1500);
    return () => window.clearTimeout(t);
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div aria-hidden className="siqt-puff-layer" style={{ left: x, top: y }}>
      <span className="siqt-puff-ring" />
      {particles.map((p, i) => (
        <span
          key={i}
          className={p.kind === 'star' ? 'siqt-star' : 'siqt-dust'}
          style={
            {
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--c': p.color,
              '--r': `${p.spin}deg`,
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

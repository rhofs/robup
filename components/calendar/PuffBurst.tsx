"use client";

import { memo, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

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
export const PUFF_COLORS = [
  "#BFDBFE",
  "#93C5FD",
  "#60A5FA",
  "#DBEAFE",
  "#FFFFFF",
  "#A5C8FF",
];

export type PuffParticle = {
  kind: "dust" | "star";
  dx: number;
  dy: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
  spin: number;
  // Per-particle variation for the nudge when "New" comes up (see `pushed` below), 0–1.
  jitter: number;
};

// Random per burst, so no two pops look the same. Made where the burst is started (an event, not a
// render), because a render has to be able to run twice and give the same result.
//
// Magic dust rather than a cloud — the second version's soft blobs read as "tegneserieskyer". Many
// tiny glowing specks that fly out at different speeds and flicker as they fade, and a handful of
// four-pointed sparkles that twinkle and turn.
// `amount` scales the burst: 1 for the pop when a hold takes, less for the small puff each day gives
// on release. `calm` is the release puff: finer and more of it, gliding out and slowing almost to a
// standstill, still there while "New" slides up and only fading after — "litt mindre partikler, men
// flere … roligere og roligere mot slutten … ikke forsvinner … før kortet har dukket helt opp, så det
// ikke virker så 'hakkete'". (A first try made them vanish before the sheet; that read as abrupt.)
export function makePuffParticles(amount = 1, calm = false): PuffParticle[] {
  const out: PuffParticle[] = [];
  const dust = Math.round((calm ? 70 : 30) * amount);
  const stars = Math.max(2, Math.round((calm ? 5 : 7) * amount));
  for (let i = 0; i < dust + stars; i++) {
    const isStar = i >= dust;
    const angle = Math.random() * Math.PI * 2;
    // Dust spreads unevenly — most of it close, some flung far — which is what makes it read as a
    // spray of glitter rather than a ring.
    const dist =
      ((isStar ? 40 : 25) + Math.pow(Math.random(), 0.7) * (isStar ? 70 : 95)) *
      (0.5 + amount / 2) *
      (calm ? 0.8 : 1);
    out.push({
      kind: isStar ? "star" : "dust",
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - (isStar ? 14 : 8),
      size: calm
        ? isStar
          ? 6 + Math.random() * 4
          : 1.5 + Math.random() * 2
        : isStar
        ? 9 + Math.random() * 7
        : 2.5 + Math.random() * 4,
      delay: Math.random() * (calm ? 60 : isStar ? 140 : 90),
      duration: calm
        ? 1700 + Math.random() * 300
        : (isStar ? 900 : 700) + Math.random() * 450,
      color: PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)],
      spin: (Math.random() - 0.5) * 180,
      jitter: Math.random(),
    });
  }
  return out;
}

// `pushed`: the "New" sheet is sliding up from the bottom and nudges the dust out of its way — "kunne de
// blitt 'dytta' vekk oppover og til siden av det kortet? Trenger ikke å bli dytta hardt, men at de
// reagerer på den, og fader ut". Each particle drifts up and away from the screen's middle, harder and
// sooner the lower it sits (the sheet reaches those first), and fades as it goes. It sits on a wrapper
// span so the nudge adds to the particle's own drift instead of fighting its transform.
function PuffBurst({
  x,
  y,
  particles,
  calm = false,
  pushed = false,
  id,
}: {
  x: number;
  y: number;
  particles: PuffParticle[];
  calm?: boolean;
  pushed?: boolean;
  id: number;
}) {
  useEffect(() => {
    // Gone once its last particle is (plus a frame of margin), however long this burst's are.
    const t = window.setTimeout(
      () => removePuff(id),
      Math.max(0, ...particles.map((p) => p.delay + p.duration)) + 50
    );
    return () => window.clearTimeout(t);
    // Once per burst: a burst's particles are made once and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pushed) return;
    const t = window.setTimeout(() => removePuff(id), 1100);
    return () => window.clearTimeout(t);
  }, [pushed, id]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden
      className={`siqt-puff-layer${calm ? " siqt-puff-calm" : ""}${
        pushed ? " siqt-puff-pushed" : ""
      }`}
      style={{ left: x, top: y }}
    >
      {!calm && <span className="siqt-puff-ring" />}
      {particles.map((p, i) => {
        // Where the particle has drifted to on screen, as a share of the height (0 top, 1 bottom).
        const vh = window.innerHeight || 800;
        const low = Math.min(1, Math.max(0, (y + p.dy) / vh));
        const strength = 0.35 + 0.65 * low;
        const side = x + p.dx < window.innerWidth / 2 ? -1 : 1;
        return (
          <span
            key={i}
            className="siqt-push"
            style={
              {
                "--px": `${side * (18 + p.jitter * 40) * strength}px`,
                "--py": `${-(45 + p.jitter * 55) * strength}px`,
                transitionDelay: `${Math.round(
                  (1 - low) * 220 + p.jitter * 60
                )}ms`,
              } as React.CSSProperties
            }
          >
            <span
              className={p.kind === "star" ? "siqt-star" : "siqt-dust"}
              style={
                {
                  width: p.size,
                  height: p.size,
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  "--c": p.color,
                  "--r": `${p.spin}deg`,
                  animationDelay: `${p.delay}ms`,
                  animationDuration: `${p.duration}ms`,
                } as React.CSSProperties
              }
            />
          </span>
        );
      })}
    </div>,
    document.body
  );
}

// The bursts on screen live here, outside React's tree of the calendar, and are drawn by one
// <PuffHost /> (mounted once by CalendarView). They used to be state in WeekRow, so every new puff —
// up to nine in one release, plus the push — re-rendered a whole calendar row with all its events,
// on the very frames the animation needed. Now adding a burst re-renders only the host, and the
// memoised bursts already on screen skip even that.
type Burst = {
  id: number;
  x: number;
  y: number;
  particles: PuffParticle[];
  calm?: boolean;
  pushed?: boolean;
};
let bursts: Burst[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
const setBursts = (next: Burst[]) => {
  bursts = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const NONE: Burst[] = [];

export function addPuff(burst: Omit<Burst, "id">) {
  setBursts([...bursts, { ...burst, id: ++nextId }]);
}
// The "New" sheet is coming up: nudge the release dust out of its way.
export function pushCalmPuffs() {
  setBursts(bursts.map((b) => (b.calm && !b.pushed ? { ...b, pushed: true } : b)));
}
const removePuff = (id: number) => setBursts(bursts.filter((b) => b.id !== id));

const MemoBurst = memo(PuffBurst);

export function PuffHost() {
  const list = useSyncExternalStore(subscribe, () => bursts, () => NONE);
  // Leaving the Planner mid-animation unmounts the bursts and their removal timers with them; without
  // this their leftovers would replay the next time the Planner opened.
  useEffect(() => () => setBursts([]), []);
  return (
    <>
      {list.map((b) => (
        <MemoBurst key={b.id} id={b.id} x={b.x} y={b.y} particles={b.particles} calm={b.calm} pushed={b.pushed} />
      ))}
    </>
  );
}

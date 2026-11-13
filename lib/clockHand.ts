// The geometry of the "Pick time" clock face (components/mobile/TimeDialSheet.tsx), kept apart from
// the component so it can be checked without a browser.
//
// The hand is described the way a hand moves — an angle and a length — not as an x/y point. Animating
// the point made the knob cut straight across the face from 3 to 9; animating the angle sweeps it
// round the edge, and the line and the knob cannot disagree because both are drawn from the same two
// numbers (2026-11-13: "streken kommer umiddelbart, så den blinker liksom, mens ballen kommer etter").

export const DIAL_SIZE = 280;
export const DIAL_CENTER = DIAL_SIZE / 2;
export const OUTER_RING = DIAL_SIZE * 0.4;
export const INNER_RING = DIAL_SIZE * 0.265;
export const KNOB_RADIUS = 22;

export type DialMode = 'hour' | 'minute';

// Where the hand points for a time: degrees clockwise from 12 o'clock, and how far out it reaches.
// 1–12 sit on the outer ring; 13–23 and 0 on the inner one, each under the hour it shares a spot with.
export function handTarget(mode: DialMode, h: number, m: number): { deg: number; r: number } {
  if (mode === 'minute') return { deg: m * 6, r: OUTER_RING };
  return { deg: (h % 12) * 30, r: h === 0 || h > 12 ? INNER_RING : OUTER_RING };
}

// How far to turn from where the hand is (any number of whole turns in) to face `toDeg` the short way
// round. Added to the running angle rather than replacing it — otherwise 11 → 1 would wind back the
// long way through 6.
export function shortestTurn(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

export function pointOnDial(deg: number, r: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: DIAL_CENTER + r * Math.sin(a), y: DIAL_CENTER - r * Math.cos(a) };
}

// A pointer on the face → the time it means. `dx`/`dy` are from the centre, in the dial's own pixels.
export function hourAt(dx: number, dy: number): number {
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const idx = Math.round(deg / 30) % 12;
  const inner = Math.hypot(dx, dy) < (OUTER_RING + INNER_RING) / 2;
  return inner ? (idx === 0 ? 0 : idx + 12) : idx === 0 ? 12 : idx;
}
export function minuteAt(dx: number, dy: number): number {
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return Math.round(deg / 6) % 60;
}

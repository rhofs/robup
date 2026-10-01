'use client';

import { addPuff, makePuffParticles } from '../calendar/PuffBurst';
import { hapticTap } from '../../lib/haptics';

// Ticking a checklist item in a doc: a small pop of the same star dust as the Planner, out of the box
// you ticked, that drifts and lingers a little before fading — "det kommer litt partikler osv når vi
// checker tasks … de partiklene går litt igjen" — and the item itself gives a short nudge to the right
// as its line is struck through and it dims ("en passende animasjon for at tasken går ut"). It stays in
// the doc: a checklist is the doc's own content, and nothing ticked off should disappear from it.
//
// Only for the person who ticked it (this runs off their click); everyone else sees the strike-through
// and dimming fade in through the CSS transitions on data-checked.
export function celebrateCheck(checkbox: HTMLInputElement, item: HTMLElement) {
  const r = checkbox.getBoundingClientRect();
  addPuff({ x: r.left + r.width / 2, y: r.top + r.height / 2, particles: makePuffParticles(0.3, true), calm: true });
  hapticTap();
  item.classList.remove('siqt-just-checked');
  // Restart the animation if the same item is ticked again quickly.
  void item.offsetWidth;
  item.classList.add('siqt-just-checked');
  window.setTimeout(() => item.classList.remove('siqt-just-checked'), 800);
}

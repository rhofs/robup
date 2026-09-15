'use client';

import { useEffect } from 'react';
import { hapticTap } from '../lib/haptics';

// Every button in the app gets a haptic tick, from one listener.
//
// Asked for after living with the app: "jeg tror vi trenger haptic når vi trykker oss rundt også."
// Correct — feedback had been added gesture by gesture (the nav, the popup menu, opening a
// conversation, long-press), which meant the controls someone happened to mention were the ones
// that felt alive and the other few hundred did not.
//
// Delegation rather than wiring each control: there is no realistic path where several hundred
// onClick handlers get a hapticTap added and keep it as the app grows. One listener on the document
// covers everything that exists now and everything added later, including controls inside libraries
// this app does not own.
//
// The components that already call hapticTap themselves keep doing so — they cover gestures that
// are not taps at all (long-press to open a menu, picking up a drag), which this cannot see. Where
// the two overlap on the same press, the de-duplication inside lib/haptics.ts collapses them to one
// click.
export default function GlobalTapFeedback() {
  useEffect(() => {
    // A mouse gets nothing. Haptics on a desktop mean a phone buzzing in someone's pocket while
    // they use the site on a laptop, which is not a thing any app should do.
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      // On press, not on click. A tick that arrives when the finger lands reads as the control
      // responding; the same tick on click arrives after the touch has already been released and
      // reads as a delayed rattle.
      //
      // `closest` so a tap on a label or icon inside a button still counts — those are the majority
      // of real taps.
      const control = target.closest('button, a[href], [role="button"], summary, input[type="checkbox"], input[type="radio"]');
      if (!control) return;

      // Nothing for a control that cannot act.
      if (control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return;

      // An explicit way out, for anywhere a tick would be wrong — a control pressed repeatedly in
      // quick succession, say. Nothing uses it yet; it exists so that the answer to "this one
      // shouldn't buzz" is one attribute rather than unpicking this listener.
      if (control.closest('[data-no-haptic]')) return;

      hapticTap();
    };

    // Capture phase: a handler that stops propagation should not also stop the feedback for a press
    // that plainly happened.
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, []);

  return null;
}

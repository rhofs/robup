'use client';

import { useState, useSyncExternalStore } from 'react';

// One clock for a page push, so that everything in it starts moving on the same frame.
//
// A board push (app/page.tsx, startBoardPush) does not start moving at the tap. It waits two frames,
// so the incoming screen is mounted and painted before anything travels. But the things that leave
// *with* the page — the floating nav, the Spaces drawer — are plain declarative animations, and those
// start the moment their prop changes, at the tap. While framer ran every slide in JavaScript the
// difference was two frames and nobody saw it. Once the slides became browser-run `transform`
// animations (2026-11-13) it grew to however long the main thread was busy after the tap, because
// the nav no longer waits for the main thread and the two-frame wait still does. Reported at once:
// "floating menyen og bakgrunnen forskyver seg ulikt".
//
// So: startBoardPush arms the clock in the tap itself, the nav and the drawer hold the pose they had
// while it is armed, and the push effect releases it in the very frame it starts the board. One
// writer, and readers that only ever wait.
//
// The token is what keeps a second push from being released by the first one's cleanup. The timer is
// the guarantee that nothing can be left holding: an armed clock that nobody releases — the page
// unmounted, a frame that never came — would freeze the nav where it was.

let armed = 0;
let next = 1;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const MAX_ARMED_MS = 1000;

export function armPush(): number {
  const token = next++;
  armed = token;
  if (expiry) clearTimeout(expiry);
  expiry = setTimeout(() => releasePush(token), MAX_ARMED_MS);
  emit();
  return token;
}

export function releasePush(token: number) {
  if (armed !== token) return;
  armed = 0;
  if (expiry) clearTimeout(expiry);
  expiry = null;
  emit();
}

/** True from the tap that starts a board push until the frame the board starts moving. */
export function usePushArmed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => armed !== 0,
    () => false
  );
}

/**
 * `value`, except that while a push is armed it stays what it was before the tap. For the prop that
 * decides an element's pose in a push: it changes at the tap, and should take effect when the board
 * moves.
 */
export function useHeldUntilPushMoves<T>(value: T): T {
  const isArmed = usePushArmed();
  const [held, setHeld] = useState(value);
  if (!isArmed && !Object.is(held, value)) setHeld(value);
  return isArmed ? held : value;
}

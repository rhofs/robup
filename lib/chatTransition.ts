// The mobile chat push — one conversation sliding in over the list, and back out again.
//
// These live in their own module because two different components have to agree on them exactly.
// app/page.tsx runs the slide itself; ChatSidebar fades the selected row's highlight out underneath
// it. When those two numbers drifted apart the result was the highlight snapping off the instant
// the panel finished leaving — reported as the row "popping" or being "cut" rather than fading with
// the page it belongs to.

export const CHAT_PUSH_MS = 520;

// A long, soft tail. The curve matters as much as the duration here: a linear fade over the same
// 520ms still reads as mistimed against an eased slide, because the eye tracks the panel's
// deceleration and expects the highlight to settle with it.
export const CHAT_PUSH_EASE_CSS = 'cubic-bezier(0.42, 0, 0.18, 1)';
export const CHAT_PUSH_EASE: readonly [number, number, number, number] = [0.42, 0, 0.18, 1];

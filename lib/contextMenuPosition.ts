// Where a right-click menu should actually open, given where the click was.
//
// Shared rather than copied: this positions the task, Space, Folder, List, Doc and column menus in
// app/page.tsx and the Planner's own day menu in CalendarView.tsx, and a second copy of these numbers
// would drift the first time one menu changed width. This session has paid for that kind of drift
// more than once.
//
// Two steps. contextMenuPosition is the first guess, made before the menu exists, from an assumed
// size. fitMenuElement then corrects it from the menu's real size the moment it is on the page, before
// it is painted — given to the menu as its ref: `ref={(el) => fitMenuElement(el, x, y)}`. The guess alone used to be the whole story,
// with a fixed 240px "max height" — and the task menu grew past it (Create next…, Apply template), so
// opened near the bottom of the screen it ran off the edge: "Høyreklikk blir croppa om den er for nær
// bunnen på desktop" (2026-10-21).
const CONTEXT_MENU_WIDTH_PX = 192; // w-48
const CONTEXT_MENU_GUESS_HEIGHT_PX = 240;
const CONTEXT_MENU_MARGIN_PX = 8;

export function contextMenuPosition(x: number, y: number): { top: number; left: number } {
  if (typeof window === 'undefined') return { top: y, left: x };
  const maxLeft = window.innerWidth - CONTEXT_MENU_WIDTH_PX - CONTEXT_MENU_MARGIN_PX;
  const maxTop = window.innerHeight - CONTEXT_MENU_GUESS_HEIGHT_PX - CONTEXT_MENU_MARGIN_PX;
  return {
    left: Math.max(CONTEXT_MENU_MARGIN_PX, Math.min(x, maxLeft)),
    top: Math.max(CONTEXT_MENU_MARGIN_PX, Math.min(y, maxTop)),
  };
}

// Places a menu of a known size at a click, the way the system's own menus do: below and to the right
// of the pointer when it fits, otherwise opening upward (its bottom at the pointer) or to the left —
// so the item under the pointer is never one you did not aim at. Anything that still does not fit is
// pushed inside the window, and a menu taller than the window is pinned to its top and scrolls.
export function fitMenuToViewport(
  x: number,
  y: number,
  width: number,
  height: number
): { top: number; left: number; maxHeight?: number } {
  const m = CONTEXT_MENU_MARGIN_PX;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + width + m <= vw ? x : x - width;
  let top = y + height + m <= vh ? y : y - height;
  left = Math.max(m, Math.min(left, vw - width - m));
  if (height > vh - 2 * m) return { top: m, left, maxHeight: vh - 2 * m };
  top = Math.max(m, Math.min(top, vh - height - m));
  return { top, left };
}

// The menu's ref. A ref runs after React has written the element's style and before the browser
// paints, so the correction is never seen; written as an inline arrow, it runs again on every render,
// after anything React wrote over it. (x, y) is the click itself, not the guess.
export function fitMenuElement(el: HTMLElement | null, x: number, y: number) {
  if (!el) return;
  // Measured at its natural height: a cap from an earlier pass must not shrink it first.
  el.style.maxHeight = '';
  el.style.overflowY = '';
  const fit = fitMenuToViewport(x, y, el.offsetWidth, el.offsetHeight);
  el.style.top = `${fit.top}px`;
  el.style.left = `${fit.left}px`;
  if (fit.maxHeight !== undefined) {
    el.style.maxHeight = `${fit.maxHeight}px`;
    el.style.overflowY = 'auto';
  }
}

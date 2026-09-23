// Where a right-click menu should actually open, given where the click was.
//
// Shared rather than copied: this now positions the task, Space, Folder, List and Doc menus in
// app/page.tsx and the Planner's own day menu in CalendarView.tsx, and a second copy of these three
// numbers would drift the first time one menu changed width. This session has paid for that kind of
// drift more than once.
//
// The max-height is a cap rather than a measurement — menus here are short, and opening slightly
// higher than strictly necessary near the bottom of the screen is invisible, while overflowing it is
// not.
const CONTEXT_MENU_WIDTH_PX = 192; // w-48
const CONTEXT_MENU_MAX_HEIGHT_PX = 240;
const CONTEXT_MENU_MARGIN_PX = 8;

export function contextMenuPosition(x: number, y: number): { top: number; left: number } {
  if (typeof window === 'undefined') return { top: y, left: x };
  const maxLeft = window.innerWidth - CONTEXT_MENU_WIDTH_PX - CONTEXT_MENU_MARGIN_PX;
  const maxTop = window.innerHeight - CONTEXT_MENU_MAX_HEIGHT_PX - CONTEXT_MENU_MARGIN_PX;
  return {
    left: Math.max(CONTEXT_MENU_MARGIN_PX, Math.min(x, maxLeft)),
    top: Math.max(CONTEXT_MENU_MARGIN_PX, Math.min(y, maxTop)),
  };
}

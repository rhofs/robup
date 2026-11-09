import type React from 'react';

// Props for a modal's backdrop: close on a click that both started and ended on the backdrop itself.
//
// A plain onClick closes on more than that. Press inside the window — selecting text in a field —
// drag out past its edge and let go, and the browser fires `click` on the nearest element containing
// both the press and the release: the backdrop. The window closed in the middle of a text selection
// ("Om jeg markerer i den beskrivelsen, og musa går utenfor tasken, og jeg slipper, så går man ut av
// tasken"). Where the press began is kept on the element itself, so a re-render in between (the
// selection can cause one) does not lose it.
export function closeOnBackdrop(onClose: () => void) {
  return {
    [ESCAPE_ATTR]: '',
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressedSelf = e.target === e.currentTarget ? '1' : '';
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const pressedSelf = e.currentTarget.dataset.pressedSelf === '1';
      e.currentTarget.dataset.pressedSelf = '';
      if (pressedSelf && e.target === e.currentTarget) onClose();
    },
  };
}

// Escape closes the window on top — "trykke escape for å lukke vinduer som flyter over, som tasks som
// er åpen" (2026-11-09). Every backdrop that closes on a click carries this attribute (closeOnBackdrop
// adds it; the context menus' and a few dialogs' own backdrops say it themselves), and Escape clicks
// the topmost one — so it does exactly what a click outside would, with no second list of what is
// open to keep in step.
export const ESCAPE_ATTR = 'data-escape-closes';

// The backdrop Escape would click, or null.
export function topOverlay(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[${ESCAPE_ATTR}]`)).filter((el) => el.getClientRects().length > 0);
  if (all.length === 0) return null;
  const z = (el: HTMLElement) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
  // Highest z-index; among equals the one later in the page, which is drawn over the others.
  let top = all[0];
  for (const el of all) if (z(el) >= z(top)) top = el;
  return top;
}

export function closeTopOverlay(): boolean {
  const top = topOverlay();
  if (!top) return false;
  // closeOnBackdrop only closes for a press that began on the backdrop itself.
  top.dataset.pressedSelf = '1';
  top.click();
  return true;
}

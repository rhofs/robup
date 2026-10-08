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

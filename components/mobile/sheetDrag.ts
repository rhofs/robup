'use client';

import { useDragControls, type PanInfo } from 'framer-motion';

// Swipe a bottom sheet down to close it — asked for because the sheets have the grabber bar on top
// that promises exactly that. Only the grabber and header start the drag (dragListener: false +
// controls started from those), so the fields and the scrolling list inside still take touches as
// before. Pulled far enough, or flicked, it closes; otherwise it springs back.
export function useSheetDrag(onClose: () => void) {
  const controls = useDragControls();
  return {
    sheetProps: {
      drag: 'y' as const,
      dragListener: false,
      dragControls: controls,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0, bottom: 0.85 },
      onDragEnd: (_: unknown, info: PanInfo) => {
        if (info.offset.y > 110 || info.velocity.y > 650) onClose();
      },
    },
    handleProps: {
      onPointerDown: (e: React.PointerEvent) => controls.start(e),
      style: { touchAction: 'none' } as React.CSSProperties,
    },
  };
}

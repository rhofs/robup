'use client';

import { motion } from 'framer-motion';

// The layer every bottom sheet sits in: the screen behind dimmed, the sheet at the bottom.
//
// The dimming fades in as the sheet slides up and out as it slides away. It used to be the layer's own
// background, which is all there at once — "den slider fint opp, men den blir umiddelbar mørk, den bør
// fades inn samtidig". And a tap on the dimmed area is this sheet's alone: it closes this sheet and
// goes no further. Sheets open inside other sheets (Assignees inside the new-task card), and the tap
// used to bubble on to the sheet underneath and close that too — the whole task, half written.
export default function SheetLayer({
  z,
  dim = 0.5,
  style,
  onClose,
  children,
}: {
  z: number;
  dim?: number;
  style?: React.CSSProperties;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 flex flex-col justify-end pt-[calc(env(safe-area-inset-top)+12px)]"
      style={{ zIndex: z, ...style }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-scrim pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: dim }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      />
      {children}
    </div>
  );
}

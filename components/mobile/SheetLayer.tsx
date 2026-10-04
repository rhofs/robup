'use client';

import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';

// In the Android app the page itself is resized frame by frame with the keyboard's own animation
// (MainActivity), so the layer must follow that exactly — a transition of its own on top lags behind
// and opens a gap between sheet and keyboard. Elsewhere (iOS, the web) the layer's box jumps when the
// keyboard settles, and the transition is what smooths it.
const followsKeyboardNatively = typeof window !== 'undefined' && Capacitor.getPlatform() === 'android';

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
      // The layer's height follows the keyboard (the visible box), and it glides there rather than
      // jumping when the keyboard opens or closes — the sheet rises with the keyboard.
      style={{ zIndex: z, transition: followsKeyboardNatively ? undefined : 'height 240ms cubic-bezier(0.22, 1, 0.36, 1)', ...style }}
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

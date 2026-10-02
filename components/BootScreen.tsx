'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import SiqtMark from './SiqtMark';
import { SIQT_BG, BOOT_TILE_DP, BOOT_GLOW_SCALE, BOOT_GLOW_OPACITY } from '../lib/siqtMark';

// The boot screen: the Siqt tile on its blue glow, exactly as Android's splash and the Capacitor splash
// draw it just before (scripts/generate-brand.ts renders the same SVG at the same fixed size — a CSS px
// is a dp in the WebView — on the same glow and the same #0a0a0a). So the handover changes nothing, and
// then the tile starts to breathe and pulses of blue light ring out of it and linger as they fade: "at
// det pulser blått lys, som går litt igjen" (design A, 2026-10-02).
//
// It is drawn in two places during one launch — app/page.tsx's loading return, then the overlay that
// stays over the loaded app until the intro has had its time — so its animations are offset by the time
// since the FIRST one appeared (a module-level start). The second instance picks up mid-breath where the
// first left off instead of restarting, which would show as a hitch.
//
// Hard-coded colours, not theme tokens: it has to match a native splash that is always dark.
let bootStartedAt: number | null = null;

export default function BootScreen() {
  const [offsetMs] = useState(() => {
    const now = performance.now();
    if (bootStartedAt === null) bootStartedAt = now;
    return now - bootStartedAt;
  });
  return (
    <div
      className="flex h-dvh w-screen items-center justify-center overflow-hidden"
      style={{ background: SIQT_BG, ['--boot-offset' as string]: `${-offsetMs}ms` }}
      role="status"
      aria-label="Loading Siqt"
    >
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: BOOT_TILE_DP, height: BOOT_TILE_DP }}
        // On the way out (the overlay fading away over the app), the tile swells a little as it fades,
        // as if the app came out of it.
        exit={{ scale: 1.14 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* The still glow the splash also has, then the moving light on top of it. */}
        <span
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${BOOT_GLOW_SCALE * 100}%`,
            height: `${BOOT_GLOW_SCALE * 100}%`,
            background: `radial-gradient(circle closest-side, rgb(59 130 246 / ${BOOT_GLOW_OPACITY}) 0%, rgb(59 130 246 / 0) 70%)`,
          }}
        />
        <span aria-hidden className="siqt-boot-pulse">
          <i />
          <i />
          <i />
        </span>
        <SiqtMark className="siqt-boot-tile relative w-full h-full" />
      </motion.div>
    </div>
  );
}

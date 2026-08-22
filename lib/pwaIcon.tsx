import type { CSSProperties } from 'react';

// Matches the app's dark theme (neutral-950 background) and the blue-400 accent used everywhere
// else for "active"/brand state (nav-rail active tab, etc.) — no separate logo asset exists yet,
// so this is a simple, consistent placeholder rather than a new unrelated design.
const BG = '#0a0a0a';
const ACCENT = '#60a5fa';

// Shared by app/icon.tsx, app/apple-icon.tsx, and the dedicated PWA manifest icon routes — one
// definition so all of Siqt's generated icons agree on look and background/foreground colors.
export function siqtIconElement(sizePx: number, maskable = false) {
  // A maskable icon must have its background fill the entire canvas edge-to-edge (a launcher may
  // crop it into a circle/squircle), with the actual glyph kept inside a smaller "safe zone" so it
  // survives that crop — hence the smaller font size than the plain (non-maskable) icon, which is
  // sized to fill the square directly since nothing crops it.
  const fontSize = maskable ? sizePx * 0.42 : sizePx * 0.62;
  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    background: BG,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <div style={style}>
      <span style={{ fontSize, fontWeight: 700, color: ACCENT, fontFamily: 'sans-serif' }}>S</span>
    </div>
  );
}

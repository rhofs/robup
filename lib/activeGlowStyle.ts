import type { CSSProperties } from 'react';

// Only the icon indicates an item's assigned color in the sidebar; the name text no longer turns
// blue when a row is the currently active/open one — instead it shows a brighter, bolder version
// of the item's own color. Colorless items (no custom color set) get nothing at all — a lit-up
// gray reads as broken, not intentional — the caller's own default className handles that case.
//
// First cut used a `text-shadow` halo (a real glow) — reported back as "too hazy on the text
// itself" with a visible rectangular artifact around it (the shadow's bounding box showing
// through, a known text-shadow-on-inline-text rendering quirk). Replaced with the simpler,
// visually reliable fallback the user offered instead of guessing at blur/opacity values with no
// browser available to check the result: a lightened tint of the same color (`color-mix`, blended
// toward white so it reads as "lit up" without being a different hue) plus bold weight — no shadow.
export function activeGlowStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return { color: `color-mix(in srgb, ${color} 65%, white)`, fontWeight: 600 };
}

// Appends an alpha channel to one of this app's existing 6-digit hex Space/Folder/List colors
// (`#RRGGBB`) — used by the Planner's "lighter, tinted" event treatment (subtle background/border
// instead of a solid fill) without introducing any new colors of its own, just varying the alpha
// of whatever color a Task/Event already cascades to.
export function withAlpha(hex: string, alphaPercent: number): string {
  const clamped = Math.max(0, Math.min(100, alphaPercent));
  const alphaHex = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`;
}

// A Task/Event colour made legible against the Planner's background. Bars and chips draw their
// text in the colour itself over a faint tint of it, so a colour close to the background vanishes:
// black (a profile colour someone picked) was almost invisible in dark mode — "Events i planner som
// har fargen sort går nesten ikke an å se i dark mode". Too-dark colours are mixed toward white in
// dark mode, too-light ones toward black in light mode, just far enough to read; every other colour
// is returned unchanged, so nobody's chosen colour shifts unless it had to. Output stays `#RRGGBB`
// because withAlpha appends to it. Anything that is not a hex colour passes through untouched.
const MIN_LUMINANCE_ON_DARK = 0.18;
const MAX_LUMINANCE_ON_LIGHT = 0.6;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

export function readableOn(theme: 'light' | 'dark', hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = theme === 'dark' ? 255 : 0;
  const ok = (l: number) => (theme === 'dark' ? l >= MIN_LUMINANCE_ON_DARK : l <= MAX_LUMINANCE_ON_LIGHT);
  if (ok(luminance(rgb))) return toHex(rgb);
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = rgb.map((c) => c + (target - c) * t);
    if (ok(luminance(mixed as [number, number, number]))) return toHex(mixed);
  }
  return toHex(rgb.map(() => target));
}

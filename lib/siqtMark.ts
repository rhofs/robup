// The Siqt mark — design "A, Glow tile", chosen 2026-10-02 from a sheet of five directions ("Jeg liker
// A!"): a soft rounded tile in a sky → blue → indigo gradient with a gloss, and a white "S" drawn as one
// rounded stroke. Replaced the bold blue sans "S" on black.
//
// ONE definition, as an SVG string, for every place the mark appears: the in-app logo (SiqtMark.tsx),
// the generated web icons (lib/pwaIcon.tsx), and the Android launcher icons, splash screen and boot
// screen (scripts/generate-brand.ts). The splash and the web boot screen must match exactly or the
// handover between them shows — a lesson already paid for once, when two renderings of the old "S" used
// two different fonts. A path cannot come out in a different typeface.

export const SIQT_BG = '#0a0a0a';

// The S, as a single stroke in a 100×100 box (bounding box ≈ x 28–72, y 18–84, centred near 50,51).
export const SIQT_S_PATH =
  'M68 28 C62 20 52 18 44 20 C34 22 28 30 31 38 C34 47 46 49 54 52 C64 55 72 61 69 71 C66 81 52 84 42 81 C36 79 32 76 30 72';

const STOPS = [
  { offset: 0, color: '#7dd3fc' },
  { offset: 0.55, color: '#3b82f6' },
  { offset: 1, color: '#4f46e5' },
];

// The tile's size on the boot screen and the splash, as a share of screen width (capped on the web).
// The contract between scripts/generate-brand.ts and app/page.tsx's boot screen: change it there and
// regenerate, never one alone.
export const BOOT_TILE_SHARE = 0.24;
export const BOOT_TILE_MAX_PX = 132;
// The soft glow behind the tile on both: its diameter as a multiple of the tile, and its strength.
export const BOOT_GLOW_SCALE = 2.4;
export const BOOT_GLOW_OPACITY = 0.38;

export type SiqtMarkOptions = {
  // 'tile' — the rounded tile (the logo). 'square' — gradient to the edges, for icons the platform
  // crops itself (Apple, maskable, Android adaptive background). 'circle' — Android's round icon.
  // 'glyph' — only the white S on transparent (the Android adaptive foreground).
  shape?: 'tile' | 'square' | 'circle' | 'glyph';
  // How large the S is: 1 fills the 100-box as drawn; the tile uses 0.58. 0 leaves it out (the
  // Android adaptive background, which gets its S from the foreground layer).
  glyph?: number;
  // Stroke width of the S in path units (before `glyph` scaling). Thicker for tiny sizes.
  stroke?: number;
  // A unique prefix for the gradient ids, when several marks share one HTML document.
  id?: string;
};

export function siqtMarkSvg(opts: SiqtMarkOptions = {}): string {
  const { shape = 'tile', glyph = 0.58, stroke = 12, id = 'siqt' } = opts;
  const g = `${id}-g`;
  const gloss = `${id}-gloss`;
  const shade = `${id}-shade`;
  const rim = `${id}-rim`;
  const stops = STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
  // The ground, in the shape asked for. A tile's corner is 30% of its side — iOS-like.
  const ground = (fill: string, inset = 0) => {
    const x = inset;
    const w = 100 - inset * 2;
    if (shape === 'circle') return `<circle cx="50" cy="50" r="${50 - inset}" fill="${fill}"/>`;
    const rx = shape === 'tile' ? 30 - inset : 0;
    return `<rect x="${x}" y="${x}" width="${w}" height="${w}" rx="${rx}" fill="${fill}"/>`;
  };
  const body =
    shape === 'glyph'
      ? ''
      : [
          ground(`url(#${g})`),
          // A darker band low down and a soft white bloom up-left: the "lit from above" depth.
          ground(`url(#${shade})`),
          ground(`url(#${gloss})`),
          // A hairline of light along the top edge, fading out by a third of the way down.
          shape === 'tile'
            ? `<rect x="0.6" y="0.6" width="98.8" height="98.8" rx="29.4" fill="none" stroke="url(#${rim})" stroke-width="1.2"/>`
            : '',
        ].join('');
  const s = glyph === 0 ? '' : `<path d="${SIQT_S_PATH}" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" transform="translate(50 51) scale(${glyph}) translate(-50 -51)"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">` +
    `<defs>` +
    `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
    `<linearGradient id="${shade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#1e1b4b" stop-opacity="0"/><stop offset="1" stop-color="#1e1b4b" stop-opacity="0.32"/></linearGradient>` +
    `<radialGradient id="${gloss}" cx="0.3" cy="0.08" r="0.62"><stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${rim}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="0.33" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` +
    `</defs>` +
    body +
    s +
    `</svg>`
  );
}

export function siqtMarkDataUri(opts: SiqtMarkOptions = {}): string {
  return `data:image/svg+xml;base64,${Buffer.from(siqtMarkSvg(opts)).toString('base64')}`;
}

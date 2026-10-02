// Generates every raster form of the Siqt mark for Android from the one shared definition
// (lib/siqtMark.ts): the launcher icons (legacy, round, and the adaptive foreground/background pair)
// and the splash screen. Replaced scripts/generate-splash.mjs when the mark changed to the glow tile
// (2026-10-02).
//
// The splash is the contract with app/page.tsx's boot screen: the same tile, at the same share of
// screen width (BOOT_TILE_SHARE), on the same glow (BOOT_GLOW_*), on the same #0a0a0a — so the native
// splash giving way to the web boot screen changes nothing on screen until the web one starts to
// breathe. Change those constants, run this again, rebuild the app.
//
// Run with: npx tsx scripts/generate-brand.ts   (then a clean Android build — see AGENTS.md)
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { siqtMarkSvg, SIQT_BG, BOOT_TILE_SHARE, BOOT_GLOW_SCALE, BOOT_GLOW_OPACITY, type SiqtMarkOptions } from '../lib/siqtMark';

const RES = 'android/app/src/main/res';

async function main() {

const png = (opts: SiqtMarkOptions, px: number) =>
  sharp(Buffer.from(siqtMarkSvg(opts).replace('width="100%" height="100%"', `width="${px}" height="${px}"`)))
    .resize(px, px)
    .png({ compressionLevel: 9 })
    .toBuffer();

// ---- launcher icons ----
const DENSITIES: [string, number][] = [
  ['ldpi', 0.75],
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];
for (const [d, f] of DENSITIES) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * f);
  const adaptive = Math.round(108 * f);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await png({ shape: 'tile', stroke: legacy <= 48 ? 14 : 12 }, legacy));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await png({ shape: 'circle', glyph: 0.52, stroke: legacy <= 48 ? 14 : 12 }, legacy));
  // Adaptive: the launcher masks a 108dp canvas to its own shape and shows roughly the middle 72dp, so
  // the S sits small in the middle of a full-bleed gradient.
  fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'), await png({ shape: 'square', glyph: 0 }, adaptive));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await png({ shape: 'glyph', glyph: 0.4, stroke: 12 }, adaptive));
}
// The adaptive layers fill the canvas themselves now; the 16.7% inset the old generator used would
// shrink the gradient into a smaller square inside the launcher's mask.
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptiveXml);
fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptiveXml);

// ---- splash ----
// A typical modern phone. Drawn CENTER_CROP, which scales by width on a screen of about this shape, so
// shares of this width land on the same shares of the screen — which is how the boot screen sizes
// itself (vw).
const W = 1080;
const H = 2400;
const tile = Math.round(W * BOOT_TILE_SHARE);
const glow = tile * BOOT_GLOW_SCALE;
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow">
      <stop offset="0" stop-color="#3b82f6" stop-opacity="${BOOT_GLOW_OPACITY}"/>
      <stop offset="0.7" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${SIQT_BG}"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="${glow / 2}" fill="url(#glow)"/>
</svg>`;
const splash = await sharp(Buffer.from(background))
  .composite([{ input: await png({ shape: 'tile' }, tile), gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toBuffer();
for (const entry of fs.readdirSync(RES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const p = path.join(RES, entry.name, 'splash.png');
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
fs.mkdirSync(path.join(RES, 'drawable'), { recursive: true });
fs.writeFileSync(path.join(RES, 'drawable', 'splash.png'), splash);

console.log(`launcher icons: ${DENSITIES.length} densities; splash ${W}x${H}, ${Math.round(splash.length / 1024)} KB, tile ${tile}px`);
}

void main();

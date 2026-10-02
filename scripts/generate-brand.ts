// Generates every raster form of the Siqt mark for Android from the one shared definition
// (lib/siqtMark.ts): the launcher icons (legacy, round, and the adaptive foreground/background pair)
// and the splash screen. Replaced scripts/generate-splash.mjs when the mark changed to the glow tile
// (2026-10-02).
//
// The splash pictures are the contract with components/BootScreen.tsx: the same tile at the same fixed
// size (BOOT_TILE_DP), on the same glow (BOOT_GLOW_*), on the same #0a0a0a — so Android's splash, the
// Capacitor splash and the web boot screen show one unchanging picture until the web one starts to
// breathe. Change those constants, run this again, rebuild the app.
//
// Run with: npx tsx scripts/generate-brand.ts   (then a clean Android build — see AGENTS.md)
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { siqtMarkSvg, BOOT_TILE_DP, BOOT_GLOW_SCALE, BOOT_GLOW_OPACITY, type SiqtMarkOptions } from '../lib/siqtMark';

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
// Two pictures of the same thing — the tile, BOOT_TILE_DP across, on its glow, on transparent (the
// dark ground comes from the window/plugin background colour) — at a fixed dp size, so they match
// each other and the web boot screen on every phone:
//   splash_icon — Android 12+'s own splash icon (windowSplashScreenAnimatedIcon). An icon without an
//                 icon background is a 288dp canvas whose middle 192dp circle shows; tile and glow
//                 sit well inside it.
//   splash      — the Capacitor splash that follows it, drawn unscaled and centred (scaleType CENTER),
//                 and also centred on the old-Android launch background (drawable/launch_background).
// Both in drawable-xxxhdpi only: Android scales them down for lower densities, never up.
const PX_PER_DP = 4;
const art = async (canvasDp: number) => {
  const c = canvasDp * PX_PER_DP;
  const tile = BOOT_TILE_DP * PX_PER_DP;
  const glow = tile * BOOT_GLOW_SCALE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c}" height="${c}">
    <defs>
      <radialGradient id="glow">
        <stop offset="0" stop-color="#3b82f6" stop-opacity="${BOOT_GLOW_OPACITY}"/>
        <stop offset="0.7" stop-color="#3b82f6" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${c / 2}" cy="${c / 2}" r="${glow / 2}" fill="url(#glow)"/>
  </svg>`;
  return sharp(Buffer.from(svg))
    .composite([{ input: await png({ shape: 'tile' }, tile), gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};
for (const entry of fs.readdirSync(RES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const name of ['splash.png', 'splash_icon.png']) {
    const p = path.join(RES, entry.name, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
const dir = path.join(RES, 'drawable-xxxhdpi');
fs.mkdirSync(dir, { recursive: true });
const splash = await art(240);
fs.writeFileSync(path.join(dir, 'splash.png'), splash);
fs.writeFileSync(path.join(dir, 'splash_icon.png'), await art(288));
fs.writeFileSync(
  path.join(RES, 'drawable', 'launch_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by scripts/generate-brand.ts. The launch window on Android 11 and older: the dark ground
     with the Siqt tile centred at its own size (a bare bitmap as a window background would stretch). -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splashBackground" />
    <item>
        <bitmap android:gravity="center" android:src="@drawable/splash" />
    </item>
</layer-list>
`
);

console.log(`launcher icons: ${DENSITIES.length} densities; splash ${Math.round(splash.length / 1024)} KB, tile ${BOOT_TILE_DP}dp`);
}

void main();

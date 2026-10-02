import { siqtMarkDataUri } from './siqtMark';

// Every icon Siqt generates on the fly — favicon, Apple touch icon, the PWA manifest icons — drawn from
// the one shared mark (lib/siqtMark.ts), so they cannot drift from the logo in the app or the Android
// icons. Rendered by next/og, which draws an SVG <img> through resvg.
//
//   'any'      — the rounded tile on transparent: browser tabs, desktop installs.
//   'apple'    — gradient to the edges: iOS masks it into its own rounded square.
//   'maskable' — gradient to the edges with a smaller S, kept inside the safe zone a launcher may crop
//                to a circle or squircle.
export function siqtIconElement(sizePx: number, variant: 'any' | 'apple' | 'maskable' = 'any') {
  const src =
    variant === 'maskable'
      ? siqtMarkDataUri({ shape: 'square', glyph: 0.42 })
      : variant === 'apple'
        ? siqtMarkDataUri({ shape: 'square', glyph: 0.56 })
        : // Small sizes get a thicker stroke so the S survives at favicon scale.
          siqtMarkDataUri({ shape: 'tile', stroke: sizePx <= 48 ? 15 : 12 });
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'transparent' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser */}
      <img src={src} width={sizePx} height={sizePx} alt="" />
    </div>
  );
}

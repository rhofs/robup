import { ImageResponse } from 'next/og';
import { siqtIconElement } from '@/lib/pwaIcon';

// A `purpose: 'maskable'` icon (see manifest.ts) — Android's launcher may crop this into a
// circle/squircle/rounded-square, so the glyph is kept inside a smaller safe zone (see
// siqtIconElement's own comment) rather than sized to fill the square like the plain icon above.
export async function GET() {
  return new ImageResponse(siqtIconElement(512, true), { width: 512, height: 512 });
}

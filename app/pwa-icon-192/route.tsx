import { ImageResponse } from 'next/og';
import { siqtIconElement } from '@/lib/pwaIcon';

// Separate from app/icon.tsx (the browser-tab favicon) — the special icon-file convention's URL
// includes a build-generated query string Next controls, not a stable path, so the PWA manifest
// (which needs a literal, fixed `src` to reference) gets its own dedicated fixed-path routes
// instead, at exactly the sizes Chrome's installability check looks for (192 and 512).
export async function GET() {
  return new ImageResponse(siqtIconElement(192), { width: 192, height: 192 });
}

import { ImageResponse } from 'next/og';
import { siqtIconElement } from '@/lib/pwaIcon';

// 180x180 is Apple's recommended apple-touch-icon size — this is what shows on an iOS home
// screen after "Add to Home Screen", separate from the manifest icons (which only Android/
// desktop Chrome's installer reads).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(siqtIconElement(size.width), { ...size });
}

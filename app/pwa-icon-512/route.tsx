import { ImageResponse } from 'next/og';
import { siqtIconElement } from '@/lib/pwaIcon';

export async function GET() {
  return new ImageResponse(siqtIconElement(512), { width: 512, height: 512 });
}

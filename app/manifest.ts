import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Siqt',
    short_name: 'Siqt',
    description: 'Siqt — task management, docs, planning, and chat in one place.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Matches app/layout.tsx's <html>/<body> background (neutral-950) so the OS splash screen/
    // status bar and the app's own chrome read as one continuous surface, not two different
    // shades meeting at a hard edge.
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/pwa-icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon-512-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

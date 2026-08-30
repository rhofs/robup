'use client';

import { useEffect } from 'react';
import { applyTheme, readThemePreference, THEME_STORAGE_KEY } from '../lib/theme';

// Keeps `data-theme` correct after the initial paint (which layout.tsx's inline script handles).
// Two cases the init script can't cover on its own, since it only ever runs once:
//   1. The OS flips light/dark while the app is open and the preference is 'system'.
//   2. Another tab changes the preference — `storage` fires in every *other* tab, so both stay in
//      sync instead of silently disagreeing until reload.
// Renders nothing; it exists purely for these two subscriptions.
export default function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');

    const onSystemChange = () => {
      // Only follow the OS while the user hasn't pinned a theme explicitly.
      if (readThemePreference() === 'system') applyTheme('system');
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) applyTheme(readThemePreference());
    };

    mq.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}

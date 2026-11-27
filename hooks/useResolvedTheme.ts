import { useSyncExternalStore } from 'react';
import type { ResolvedTheme } from '../lib/theme';

// The theme actually on screen, read from the `data-theme` attribute lib/theme.ts writes on <html>
// — the single source of truth, so this can never disagree with what the CSS is showing. Re-renders
// when the attribute changes (theme toggle, or the OS switching while the preference is 'system').
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const read = (): ResolvedTheme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, read, () => 'dark');
}

// Theme preference: 'system' follows the OS, 'light'/'dark' pin it explicitly.
//
// Deliberately resolved to a concrete 'light' | 'dark' in JS and written to `data-theme` on
// <html>, rather than letting CSS handle the system case via `prefers-color-scheme`. Two reasons:
// the app's light palette is a scoped override of the whole neutral scale (see globals.css), and
// having *two* mechanisms that can each decide the theme is exactly how they end up disagreeing;
// and an explicit attribute is what lets the toggle switch themes instantly without a reload.
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'siqt.theme';

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

// Single writer for the attribute the CSS keys off — also updates <meta name="theme-color"> so
// the mobile browser chrome (address bar, task switcher card) matches instead of staying stuck on
// the dark value baked into layout.tsx's metadata.
export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#ffffff' : '#101218');
  return resolved;
}

export function setThemePreference(pref: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {}
  return applyTheme(pref);
}

// Injected as a blocking inline <script> in layout.tsx's <head> so `data-theme` is on <html>
// before the first paint. Without it every load would flash the default (dark) theme before
// React hydrated and corrected it — the classic FOUC, and especially ugly when the correction is
// a full light/dark inversion. Stringified deliberately: it has to run standalone, before any
// bundle loads, so it can't import from this module.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var p = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (p !== 'light' && p !== 'dark') {
      p = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', p);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

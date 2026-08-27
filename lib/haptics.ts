// Web Vibration API — no native app needed, but real platform limits: Chrome/Android supports it
// (including installed PWAs) and Safari/iOS has never implemented it at all (WebKit has no
// navigator.vibrate, in Safari or in an iOS PWA — a long-standing Apple platform decision, not a
// missing permission or a bug here). This is a pure best-effort enhancement: it silently no-ops
// everywhere unsupported (iOS, desktop, an older Android WebView) rather than throwing, so calling
// it is always safe regardless of platform.
export function hapticTap(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

// A more pronounced pulse than hapticTap's default 10ms — for a surface the user specifically
// asked for stronger feedback on (the mobile popup menu's own buttons: tiles, Settings/Trash/
// Archive, the workspace picker) without changing the subtler default every other tap in the app
// (bottom nav, task rows, etc.) already uses.
export function hapticTapStrong(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(20);
  }
}

// Web Vibration API — no native app needed, but real platform limits: Chrome/Android supports it
// (including installed PWAs) and Safari/iOS has never implemented it at all (WebKit has no
// navigator.vibrate, in Safari or in an iOS PWA — a long-standing Apple platform decision, not a
// missing permission or a bug here). This is a pure best-effort enhancement: it silently no-ops
// everywhere unsupported (iOS, desktop, an older Android WebView) rather than throwing, so calling
// it is always safe regardless of platform.
//
// Note for anyone debugging "haptics don't work" on a device that *should* support them: Android's
// Do Not Disturb / bedtime mode suppresses vibration system-wide, and it silently affects
// navigator.vibrate too — worth ruling out before looking at this file.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export type HapticStrength = 'off' | 'light' | 'strong';

export const HAPTIC_STORAGE_KEY = 'siqt.hapticStrength';

// Durations in ms, per strength, for the two call sites this app distinguishes:
// [ordinary tap, deliberate/menu tap].
//
// IMPORTANT: `navigator.vibrate()` controls DURATION ONLY — the Web Vibration API has no
// amplitude parameter at all. Native apps get their crisp, strong tick from Android's
// VibrationEffect (EFFECT_CLICK and friends), which the web platform simply cannot reach. So
// "stronger" here can only ever be approximated through duration, and the first attempt at that
// got it backwards: raising these to 30/55ms made the pulse *longer*, which reads as a buzz
// rather than a firmer click. Reported directly against ClickUp's own feel — "short like the
// softer one in our app, but more strong."
//
// The useful range comes from how the motor itself behaves. An LRA takes roughly 15-20ms to spin
// up to full amplitude, so:
//   - under ~15ms it never reaches peak      -> feels weak (the original 10-12ms values)
//   - around 25-30ms it hits peak and stops  -> reads as a single sharp click  <- what we want
//   - beyond ~45ms it sustains at peak       -> reads as a buzz, i.e. long, not strong
// Everything below therefore stays inside that short-but-peaking band; going higher again would
// undo the very thing this is tuned for.
const DURATIONS: Record<Exclude<HapticStrength, 'off'>, { tap: number; strong: number }> = {
  light: { tap: 12, strong: 20 },
  strong: { tap: 25, strong: 32 },
};

const DEFAULT_STRENGTH: HapticStrength = 'strong';

export function readHapticStrength(): HapticStrength {
  if (typeof window === 'undefined') return DEFAULT_STRENGTH;
  try {
    const raw = localStorage.getItem(HAPTIC_STORAGE_KEY);
    return raw === 'off' || raw === 'light' || raw === 'strong' ? raw : DEFAULT_STRENGTH;
  } catch {
    return DEFAULT_STRENGTH;
  }
}

export function setHapticStrength(value: HapticStrength): void {
  try {
    localStorage.setItem(HAPTIC_STORAGE_KEY, value);
  } catch {}
  // Fire one pulse at the newly-picked strength so the choice is felt at the moment it's made,
  // rather than only on some later unrelated tap.
  if (value === 'off') return;
  if (Capacitor.isNativePlatform()) nativeImpact('strong', value);
  else vibrate(DURATIONS[value].strong);
}

// Inside the native app, use the platform's own predefined effects instead of a raw duration.
// This is the whole reason the app exists: `navigator.vibrate` can only say "buzz for N
// milliseconds", so every value in DURATIONS above is an approximation of a click. Android and iOS
// both ship real, tuned impact effects — Android's VibrationEffect, iOS's Taptic Engine — and
// Capacitor maps `Haptics.impact` onto whichever one is underneath. A tap in the app therefore
// feels like a button rather than like a motor being switched on and off.
//
// `Capacitor.isNativePlatform()` is false in a browser and in an installed PWA, so the web path
// below stays exactly as it is today for everyone not using the app. Nothing here degrades.
function nativeImpact(kind: 'tap' | 'strong', strength: Exclude<HapticStrength, 'off'>): void {
  // 'light' keeps the app's own gentler setting meaningfully gentler; without this every tap would
  // land on the same medium impact and the Off/Light/Strong choice would be two options, not three.
  const style =
    strength === 'light'
      ? ImpactStyle.Light
      : kind === 'strong'
        ? ImpactStyle.Medium
        : ImpactStyle.Light;
  // Fire-and-forget: the promise only reports whether the platform accepted the request, and a
  // failed buzz must never surface as an error in the middle of a tap handler.
  void Haptics.impact({ style }).catch(() => {});
}

function vibrate(ms: number): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(ms);
}

// Read per call rather than cached at module load — the setting can change mid-session (see
// SettingsPanel), and a cached copy would leave every already-mounted component on the old value
// until reload.
function pulse(kind: 'tap' | 'strong'): void {
  const strength = readHapticStrength();
  if (strength === 'off') return;
  if (Capacitor.isNativePlatform()) {
    nativeImpact(kind, strength);
    return;
  }
  vibrate(DURATIONS[strength][kind]);
}

export function hapticTap(): void {
  pulse('tap');
}

// A more pronounced pulse than hapticTap — for a surface the user specifically asked for stronger
// feedback on (the mobile popup menu's own buttons: tiles, Settings/Trash/Archive, the workspace
// picker) without changing the subtler default every other tap in the app (bottom nav, task rows,
// etc.) already uses.
export function hapticTapStrong(): void {
  pulse('strong');
}

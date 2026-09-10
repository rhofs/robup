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

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

// Our own tiny native plugin (android/app/src/main/java/no/siqt/app/SiqtHapticsPlugin.java). It
// exists for one reason @capacitor/haptics cannot cover — see NATIVE_DURATIONS below.
interface SiqtHapticsPlugin {
  click(options: { style: 'light' | 'strong'; fallbackMs: number }): Promise<void>;
}
const SiqtHaptics = registerPlugin<SiqtHapticsPlugin>('SiqtHaptics');

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

// Native durations, deliberately much shorter than the web ones above.
//
// CORRECTION, measured rather than assumed — an earlier version of this file claimed the app got
// Android's "real, tuned impact effects" (EFFECT_CLICK and friends) through `Haptics.impact`. It
// does not. Read
// `node_modules/@capacitor/haptics/android/.../arguments/HapticsImpactType.java`: the plugin builds
// its own `VibrationEffect.createWaveform` from a duration and an amplitude, exactly like the web
// path, just with amplitude available too. The actual values are
//
//     LIGHT  50ms @ 110/255      MEDIUM  43ms @ 180/255      HEAVY  60ms @ 255
//
// which produced two problems on a real device. Every one of those is longer than the web's own
// 32ms, so the app read as *stronger* only because it buzzed for longer — reported directly against
// ClickUp: "i clickup er den mye kortere, typ 1/3." And LIGHT, which this file used for ordinary
// taps, is 50ms — **longer than the MEDIUM used for the deliberate ones**, so the two were
// inverted relative to their names.
//
// So the app now uses `Haptics.vibrate({ duration })` instead, which is
// `createOneShot(duration, DEFAULT_AMPLITUDE)` — the device's own full-strength default rather than
// a fraction of it. That is what makes a genuinely short pulse still feel firm, and it is the one
// thing the browser could not do: short *and* strong, instead of trading one for the other.
//
// These stay well under the ~15-20ms LRA spin-up discussed above on purpose. That reasoning was
// derived for the web path, where amplitude is out of reach; at the default amplitude the motor is
// driven hard from the first millisecond, so the band that reads as a click sits lower.
const NATIVE_DURATIONS: Record<Exclude<HapticStrength, 'off'>, { tap: number; strong: number }> = {
  light: { tap: 6, strong: 10 },
  strong: { tap: 10, strong: 15 },
};

// `Capacitor.isNativePlatform()` is false in a browser and in an installed PWA, so the web path
// stays exactly as it is today for everyone not using the app. Nothing here degrades.
// Shortening the pulse to 15ms got the length right but not the character. Reported next: ClickUp's
// "varer ca like lenge, men sparker med ifra" — same duration, but it hits and stops dead, while
// ours starts softly and rings out. That is not a number this file can pick. Driving an LRA for a
// flat duration means it ramps up over ~15ms and then oscillates freely once the current stops;
// Android's own EFFECT_CLICK is a vendor-tuned waveform that reaches full amplitude immediately and
// then *brakes* the motor by driving it in reverse. Neither the Web Vibration API nor
// @capacitor/haptics exposes it, hence SiqtHapticsPlugin.
//
// The duration below is still passed along: the plugin uses it for its own fallback on a device
// with no tuned effect, so the two stay in step instead of drifting apart in two files.
function nativeImpact(kind: 'tap' | 'strong', strength: Exclude<HapticStrength, 'off'>): void {
  const fallbackMs = NATIVE_DURATIONS[strength][kind];
  // Fire-and-forget: the promise only reports whether the platform accepted the request, and a
  // failed buzz must never surface as an error in the middle of a tap handler.
  //
  // The .catch is load-bearing rather than defensive: an app installed from an APK built before
  // this plugin existed has no 'SiqtHaptics' registered, and the call rejects with "not
  // implemented". Since the JS ships from the web and updates the moment production redeploys,
  // while the APK only changes when someone installs a new one, those two versions are routinely
  // out of step. Falling back keeps haptics working on the older build instead of silently dying.
  void SiqtHaptics.click({ style: strength === 'light' ? 'light' : 'strong', fallbackMs }).catch(
    () => Haptics.vibrate({ duration: fallbackMs }).catch(() => {}),
  );
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

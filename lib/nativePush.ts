import { Capacitor } from '@capacitor/core';

// Native push registration, the app-side half of lib/fcm.ts.
//
// Everything here is dynamically imported and guarded by isNativePlatform(), so a browser and an
// installed PWA never load the plugin at all — they keep using the web push path in ./pushClient.ts,
// which is the only one that works for them.

export type NativePushResult = { ok: true } | { ok: false; error: string };

export function isNativePushAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

// Asks the OS for permission, registers with FCM, and hands the resulting token to our server.
//
// Note the shape: registration is not request/response. `register()` resolves as soon as the
// request is *made*, and the token arrives later on a listener — so the promise below is settled by
// whichever of the two listeners fires, not by register() itself. Awaiting register() alone and
// assuming a token exists afterwards is the classic mistake with this plugin, and it fails
// intermittently rather than consistently, which makes it expensive to find later.
export async function enableNativePush(): Promise<NativePushResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false, error: 'Not running in the app' };

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      return { ok: false, error: 'Notification permission was denied' };
    }

    const token = await new Promise<string>((resolve, reject) => {
      // A ceiling on waiting: without it, a device that never completes registration (no Play
      // Services, no network, a misconfigured Firebase project) leaves the caller's promise pending
      // forever and the UI stuck on a spinner with nothing to report.
      const timeout = setTimeout(() => reject(new Error('Registration timed out')), 15_000);

      void PushNotifications.addListener('registration', (t) => {
        clearTimeout(timeout);
        resolve(t.value);
      });
      void PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timeout);
        reject(new Error(typeof err?.error === 'string' ? err.error : 'Registration failed'));
      });

      void PushNotifications.register();
    });

    const res = await fetch('/api/push/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
    if (!res.ok) return { ok: false, error: 'Could not register this device with the server' };
    setNativePushOff(false);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not enable notifications' };
  }
}

// Tells the server to stop sending to this device. The OS-level permission is deliberately left
// alone: revoking it is the user's to do in Android settings, and an app that quietly drops a
// permission it was granted is harder to turn back on than one that simply stops using it.
export async function disableNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const token = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5_000);
      void PushNotifications.addListener('registration', (t) => {
        clearTimeout(timeout);
        resolve(t.value);
      });
      void PushNotifications.register();
    });
    // Remembered on the device, so syncNativePushToken does not quietly register it again at the
    // next launch — the OS permission stays granted when notifications are turned off in the app.
    setNativePushOff(true);
    if (!token) return;
    await fetch('/api/push/device-token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Nothing useful to do or say: the device simply stays registered, and a dead token is cleaned
    // up by lib/fcm.ts the first time Google reports it as gone.
  }
}

// Whether this install is already registered with the server. Asked on mount so Settings can show
// the right label without prompting for a permission nobody asked for.
export async function isNativePushRegistered(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    return permission.receive === 'granted';
  } catch {
    return false;
  }
}

const NATIVE_PUSH_OFF_KEY = 'siqt.nativePushOff';

function setNativePushOff(off: boolean) {
  try {
    if (off) localStorage.setItem(NATIVE_PUSH_OFF_KEY, '1');
    else localStorage.removeItem(NATIVE_PUSH_OFF_KEY);
  } catch {}
}

function isNativePushOff(): boolean {
  try {
    return localStorage.getItem(NATIVE_PUSH_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

// Registers this install's CURRENT token with the server, at every launch — without asking anything.
//
// The token used to be sent once, when "Enable push notifications" was tapped, and never again, while
// Settings showed "on" for as long as the Android permission was granted. But the token is not
// permanent: reinstalling the app (which a new APK can require), clearing its data, or Firebase
// rotating it gives the install a new one, and the server kept sending to the old. Google can accept
// messages for a stale token for a while, so the new delivery record said "delivered" while the
// phone received nothing. Reported 2026-09-28: "jeg får varslet på pcn, men ingenting kommer opp på
// mobilen."
//
// Only when the permission is already granted (never prompts) and notifications have not been
// turned off in the app. Also listens for later token refreshes for as long as the app runs. Safe to
// call repeatedly: the server upserts on the token.
let syncStarted = false;
export async function syncNativePushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform() || syncStarted || isNativePushOff()) return;
  syncStarted = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') {
      syncStarted = false;
      return;
    }
    void PushNotifications.addListener('registration', (t) => {
      if (isNativePushOff()) return;
      void fetch('/api/push/device-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t.value, platform: Capacitor.getPlatform() }),
      }).catch(() => {});
    });
    await PushNotifications.register();
  } catch {
    syncStarted = false;
  }
}

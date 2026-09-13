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

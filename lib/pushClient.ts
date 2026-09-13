import { Capacitor } from '@capacitor/core';
import { enableNativePush, disableNativePush, isNativePushRegistered } from './nativePush';

// Inside the Android app this module delegates to ./nativePush, and that indirection is the reason
// SettingsPanel needed no changes at all when native push was added.
//
// The two transports are not interchangeable: Android's WebView does not implement PushManager, so
// every function below would report "unsupported" in the app however the server is configured —
// which is exactly what the Settings panel used to say. Branching here rather than at the UI keeps
// a single three-state interface for callers and puts the platform knowledge next to the code that
// acts on it.
function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Boilerplate conversion the Push API itself requires: applicationServerKey wants a raw
// Uint8Array, but the VAPID public key is handed around everywhere else (server env var, this
// fetch) as a URL-safe base64 string. Standard, widely-copied snippet — not this app's own
// invention, just isolated here instead of inlined at the one call site.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

// The three-state read SettingsPanel.tsx needs: 'unsupported' (browser can't do this at all),
// 'subscribed' (this browser already has a live PushSubscription), or 'not-subscribed'.
export async function getPushStatus(): Promise<'unsupported' | 'subscribed' | 'not-subscribed'> {
  // In the app, "subscribed" is read from the OS permission rather than from a server round trip.
  // The two can in principle disagree — permission granted but the token never stored — but the
  // only path that grants permission also registers the token immediately afterwards, and a token
  // that later goes stale is deleted by lib/fcm.ts the first time Google rejects it.
  if (isNative()) return (await isNativePushRegistered()) ? 'subscribed' : 'not-subscribed';
  if (!isPushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'not-subscribed';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'not-subscribed';
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (isNative()) {
    const result = await enableNativePush();
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }
  if (!isPushSupported()) return { ok: false, error: 'Push isn’t supported in this browser' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, error: 'Notification permission was denied' };

  const keyRes = await fetch('/api/push/vapid-public-key');
  if (!keyRes.ok) return { ok: false, error: 'Push notifications aren’t configured on this server' };
  const { publicKey } = await keyRes.json();

  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // TS's DOM lib types this array's generic parameter more strictly than the real runtime API
    // cares about — applicationServerKey accepts any BufferSource, this is a real Uint8Array
    // either way.
    applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) return { ok: false, error: 'Could not save subscription' };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (isNative()) {
    await disableNativePush();
    return;
  }
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

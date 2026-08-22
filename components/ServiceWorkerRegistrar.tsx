'use client';

import { useEffect } from 'react';

// Registers the service worker unconditionally on every load — unlike lib/pushClient.ts's own
// `register('/sw.js')` call, which only ever runs once a user opts into push notifications. A
// controlling service worker registration is part of what Chrome/Edge require before they'll
// consider this app installable as a PWA at all (see useInstallPrompt.ts), regardless of whether
// push ever gets turned on. Registering the same script/scope twice is a harmless no-op (the spec
// just returns the existing registration), so this doesn't conflict with that later call.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

// Dismisses the native splash screen once the web app has actually rendered.
//
// This matters more here than in a typical Capacitor app. Because capacitor.config.ts uses
// `server.url` rather than a bundled build, there is no local HTML to show instantly — the WebView
// sits with nothing to paint until https://siqt.no answers over the network. Without something
// covering that gap the user watched a blank screen for the whole round trip, which over a VPN
// from China was long enough to look like the app had failed to start.
//
// The splash also auto-hides after launchShowDuration as a safety net, so this component only ever
// makes it disappear *sooner*. That ordering is deliberate: if this code never runs, the user still
// gets into the app.
export default function NativeSplashGate() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    // Imported lazily so the plugin's module never has to load in a browser or an installed PWA,
    // which is every visitor who is not using the Android app.
    void import('@capacitor/splash-screen')
      .then(({ SplashScreen }) => {
        if (cancelled) return;
        // One frame after mount rather than immediately: hiding during the same paint that renders
        // the app swaps a complete picture for a half-drawn one, which reads as a flicker — the
        // opposite of what the splash is there to prevent.
        requestAnimationFrame(() => {
          void SplashScreen.hide().catch(() => {});
        });
      })
      .catch(() => {
        // An APK built before this plugin was added has no SplashScreen to hide, and there is
        // nothing to do about that from here — it simply has no splash to begin with.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

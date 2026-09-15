'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

// Makes Android's Back gesture go back *within* Siqt instead of closing it.
//
// Without a listener, Capacitor's default is to leave the app — so every Back, from anywhere, quit.
// That is the one thing Android users never expect: Back is how you undo a navigation, and an app
// that exits instead has no way back to where you were. Reported directly: "når jeg trykker tilbake
// bør jeg gå tilbake til forrige sted i appen jeg var, mens nå lukker den bare appen uansett."
//
// This app already maintains real history. app/page.tsx pushes a URL for every navigation — a Space,
// a List, an open task, an open mobile sheet — through window.history.pushState, and reads it back
// to restore that state. So `history.back()` is not an approximation of in-app back; it *is* the
// app's own navigation, run in reverse.
export default function NativeBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | null = null;
    let cancelled = false;

    void import('@capacitor/app')
      .then(async ({ App }) => {
        if (cancelled) return;
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          // canGoBack is the WebView's own history, which includes the pushState entries above —
          // they are same-document entries but still history entries.
          if (canGoBack) {
            window.history.back();
            return;
          }
          // Nothing left to go back to: this is the first screen of the session, and Back there
          // genuinely means "leave". Exiting rather than doing nothing matters — a Back button that
          // silently ignores you on the home screen feels broken in a different way.
          void App.exitApp();
        });
        if (cancelled) {
          void handle.remove();
          return;
        }
        remove = () => void handle.remove();
      })
      .catch(() => {
        // An APK built before this plugin was added simply keeps the old behaviour. Nothing to do
        // from here, and nothing worth reporting to the user about it.
      });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}

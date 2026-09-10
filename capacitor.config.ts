import type { CapacitorConfig } from '@capacitor/cli';

// Siqt as a native shell around the live web app.
//
// `server.url` points at production rather than bundling the web build into the app, and that is
// forced by the architecture rather than chosen for convenience: this app has server routes, an
// auth layer and a database behind it, so it cannot be exported as static files. Loading the real
// site is the only option — and it happens to be the better one, because every web change ships
// the moment the server is redeployed, with no app-store review in the way. A new build only goes
// to the store when something *native* changes, which is rare.
//
// androidScheme https: the WebView is then a secure context, which the app needs for service
// workers, push and the clipboard. On http it silently loses all three.
const config: CapacitorConfig = {
  appId: 'no.siqt.app',
  appName: 'Siqt',
  // Required by the CLI even when the app loads a remote URL — nothing is copied from it in that
  // mode, so it only needs to exist.
  webDir: 'public',
  android: {
    // Cleartext stays off: everything goes to https://siqt.no, and allowing plain http would only
    // widen what the WebView will load.
    allowMixedContent: false,
    // The WebView's own background, seen for as long as it has nothing to paint. It defaults to
    // white, which on a dark app is not a neutral gap but a full-screen flash — and it lasts much
    // longer here than in a normal app, because there is no bundled HTML to fall back on: the
    // WebView is idle until https://siqt.no comes back over the network. Reported on device from
    // China over a VPN, where that wait is at its worst: "når jeg åpner appen så er skjermen bare
    // helt hvit." Same value as themeColor in app/layout.tsx and the manifest.
    backgroundColor: '#0A0A0A',
  },
  plugins: {
    // The launch theme (AppTheme.NoActionBarLaunch) already points at the generated @drawable/
    // splash, but on its own that only covers the moment before the window is drawn. This keeps it
    // up until the web app is actually on screen, which is the gap that was showing as white.
    SplashScreen: {
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      // Hidden from JS as soon as the app has rendered (components/NativeSplashGate.tsx), so this
      // duration is only ever a ceiling. It stays an *auto*-hide on purpose: with
      // launchAutoHide:false, anything that stops that JS from running — no network, siqt.no down,
      // a redeploy mid-launch — would strand the user on a splash screen with no way forward.
      // Failing into the app's own error handling beats failing into a picture.
      launchAutoHide: true,
      launchShowDuration: 3000,
    },
  },
  server: {
    url: 'https://siqt.no',
    androidScheme: 'https',
    // Only siqt.no is treated as "inside the app". Anything else — a Google sign-in page, a link
    // someone pasted into chat — opens in the real browser instead of being trapped in a WebView
    // with no address bar, which is both better for the user and required for OAuth to work at
    // all (Google refuses to authenticate inside an embedded WebView).
    allowNavigation: ['siqt.no'],
  },
};

export default config;

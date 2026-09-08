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

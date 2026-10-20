import { Capacitor, registerPlugin } from '@capacitor/core';

// Downloads in the Android app (android/app/src/main/java/no/siqt/app/SiqtDownloadsPlugin.java). A
// WebView drops every download unless the app handles it, and the app did not before APK 2.1 — so
// "Download PDF" did nothing on a phone (2026-10-20).
interface SiqtDownloadsPlugin {
  download(options: { url: string; filename?: string; mimeType?: string }): Promise<void>;
}
const SiqtDownloads = registerPlugin<SiqtDownloadsPlugin>('SiqtDownloads');

// 'browser': a normal link does it. 'app': hand it to the app. 'outdated-app': an app from before
// downloads worked, where a link does nothing at all — say so instead.
export function downloadSupport(): 'browser' | 'app' | 'outdated-app' {
  if (!Capacitor.isNativePlatform()) return 'browser';
  return Capacitor.isPluginAvailable('SiqtDownloads') ? 'app' : 'outdated-app';
}

// The in-app Settings hide the APK row (it is pointless inside the app), so the address is given.
export const OUTDATED_APP_MESSAGE = 'Downloads need the newest Siqt app. Open siqt.no/siqt.apk in your phone’s browser to install it.';

// Starts the download in the app. False if it could not.
export async function downloadInApp(path: string, filename?: string, mimeType?: string): Promise<boolean> {
  try {
    await SiqtDownloads.download({ url: new URL(path, window.location.href).href, filename, mimeType });
    return true;
  } catch {
    return false;
  }
}

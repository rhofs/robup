import { Capacitor, registerPlugin } from '@capacitor/core';

// The app's own native keyboard control (android/app/src/main/java/no/siqt/app/SiqtKeyboardPlugin.java).
interface SiqtKeyboardPlugin {
  hideInstant(): Promise<void>;
  setOverlay(options: { on: boolean }): Promise<void>;
}
const SiqtKeyboard = registerPlugin<SiqtKeyboardPlugin>('SiqtKeyboard');

// Puts the keyboard away in a single frame, without its slide — so a sheet can rise where the keyboard
// was, as if over it (the new-task card's calendar). True if that happened; false where it cannot be
// done (iOS, the web, an older app build without the plugin), and the caller does something else.
// While a bottom sheet is open, the app stops resizing the page for the keyboard and hands the page
// the keyboard's height instead, every frame, as the CSS variable --kb (and window.__siqtKb, in CSS
// px); the sheets lift themselves by it. See MainActivity.setKeyboardOverlay for why. A no-op off
// Android or in an app build without it.
export function setKeyboardOverlay(on: boolean): void {
  if (Capacitor.getPlatform() !== 'android') return;
  SiqtKeyboard.setOverlay({ on }).catch(() => {});
}

export async function hideKeyboardInstantly(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    await SiqtKeyboard.hideInstant();
    return true;
  } catch {
    return false;
  }
}

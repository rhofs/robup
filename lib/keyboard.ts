import { Capacitor, registerPlugin } from '@capacitor/core';

// The app's own native keyboard control (android/app/src/main/java/no/siqt/app/SiqtKeyboardPlugin.java).
interface SiqtKeyboardPlugin {
  hideInstant(): Promise<void>;
}
const SiqtKeyboard = registerPlugin<SiqtKeyboardPlugin>('SiqtKeyboard');

// Puts the keyboard away in a single frame, without its slide — so a sheet can rise where the keyboard
// was, as if over it (the new-task card's calendar). True if that happened; false where it cannot be
// done (iOS, the web, an older app build without the plugin), and the caller does something else.
export async function hideKeyboardInstantly(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    await SiqtKeyboard.hideInstant();
    return true;
  } catch {
    return false;
  }
}

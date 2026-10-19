// A single place for the app to say what Android's Back gesture should do.
//
// The gesture is captured in the root layout (components/NativeBackButton.tsx), but everything that
// knows what "back" means — an open conversation, an open List — lives in app/page.tsx. Rather than
// lifting that state up or duplicating the decision, the page registers a handler here and the
// listener asks it first.
//
// Returning true means "handled, do nothing else". Returning false falls through to
// history.back(), which is the right answer for every navigation the page has no animation for.
//
// WHY IT MATTERS THAT THE PAGE HANDLES THESE: history.back() changes the URL, and the page restores
// its state from the URL *immediately*. The visible Back buttons instead go through handlers that
// animate first and change state after. So a raw history.back() produced exactly the two faults
// reported — a conversation whose contents were cleared before it had finished sliding away, and a
// List that cut straight back with no movement at all.

type BackHandler = () => boolean;

let handler: BackHandler | null = null;

export function setNativeBackHandler(next: BackHandler | null): void {
  handler = next;
}

// Overlays that Back closes before anything else — a sheet opened inside a view the page does not
// know about (the Wiki's Contents sheet). Registered by hooks/useBackLayer.ts; the newest is on top.
// Without this, Back went past the open sheet to the page's own handler and left the Wiki altogether.
const layers: (() => void)[] = [];

export function pushBackLayer(close: () => void): () => void {
  layers.push(close);
  return () => {
    const i = layers.lastIndexOf(close);
    if (i !== -1) layers.splice(i, 1);
  };
}

// A layer that closed some other way (×, a tap outside) steps back over its own history entry; the
// pop that causes is ours and must not be read as the user's Back.
let ignoreNextPop = false;
export function ignoreNextPopState(): void {
  ignoreNextPop = true;
}
export function consumeIgnoredPopState(): boolean {
  if (!ignoreNextPop) return false;
  ignoreNextPop = false;
  return true;
}

// Back on the app's top screen: to the background, the way Android apps leave their first screen.
// Not history.back() — history behind Home is old screens (a List, the old Spaces sheet), and replaying
// them is what "det kommer en task list som spawner inn … en gammel look av spaces" was (2026-10-19).
// In a browser there is no app to leave, so nothing happens.
export function leaveApp(): void {
  void import('@capacitor/core')
    .then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      return import('@capacitor/app').then(({ App }) => App.minimizeApp().catch(() => App.exitApp()));
    })
    .catch(() => {});
}

export function runNativeBackHandler(): boolean {
  const top = layers.pop();
  if (top) {
    top();
    return true;
  }
  try {
    return handler ? handler() : false;
  } catch {
    // A throwing handler must not swallow the gesture — falling through to history.back() leaves
    // the user able to navigate, which is the thing that actually matters here.
    return false;
  }
}

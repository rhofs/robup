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

export function runNativeBackHandler(): boolean {
  try {
    return handler ? handler() : false;
  } catch {
    // A throwing handler must not swallow the gesture — falling through to history.back() leaves
    // the user able to navigate, which is the thing that actually matters here.
    return false;
  }
}

// Which navigation layout the app uses, stored per device.
//
// The new layout is a structural change — two contexts (Home and Office), each with a toggle
// between working and talking — and it replaces how every screen is reached. That is too much to
// land as a redeploy and find out afterwards, so it ships switchable: both layouts exist in the
// same build and a setting decides which one renders.
//
// Why a setting rather than a branch: the Pterodactyl Startup page has no branch variable, so a
// branch could not be deployed for testing without merging it anyway. A setting gives three things
// a branch could not — the two layouts can be compared in one sitting on the same data, nobody else
// sees the new one until they turn it on, and undoing it is unticking a box rather than reverting
// code.
//
// When the new layout is settled, this file, the setting, and every `oldLayout` path go out
// together. It is scaffolding, and scaffolding that outlives the building is just clutter.

export const LAYOUT_STORAGE_KEY = 'siqt.newLayout';

export type LayoutPreference = 'classic' | 'contexts';

// Classic stays the default until the new one has been lived with. A structural change that
// arrives unasked is a worse first impression than the same change chosen.
const DEFAULT_LAYOUT: LayoutPreference = 'classic';

export function readLayoutPreference(): LayoutPreference {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'contexts' ? 'contexts' : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// Fired when the preference changes, so the app can react in THIS tab.
//
// `storage` is not enough and is the trap this exists to avoid: the browser fires it only in *other*
// tabs, never in the one that made the change. Reading the preference once on mount and listening
// for `storage` therefore looks completely correct and does nothing at all — the switch writes, the
// app never hears, and nothing happens until a reload. Reported exactly that way: "bryteren er på",
// with the old layout still on screen.
export const LAYOUT_CHANGE_EVENT = 'siqt:layout-change';

export function setLayoutPreference(value: LayoutPreference): void {
  try {
    if (value === 'contexts') localStorage.setItem(LAYOUT_STORAGE_KEY, 'contexts');
    else localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {}
  // Outside the try: a browser that refuses to store still changed the preference for this
  // session, and the app should follow it rather than ignore the tap.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LAYOUT_CHANGE_EVENT, { detail: value }));
  }
}

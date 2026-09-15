import type { LucideIcon } from 'lucide-react';
import type { NavTabId } from '../SettingsPanel';

// Shared between the desktop icon rail (app/page.tsx) and the mobile bottom nav / app-launcher
// grid, so both surfaces read one derived list instead of re-deriving hiddenNavTabs/
// hasRealWorkspace independently and risking drift.
export type NavTab = {
  id: NavTabId;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active: boolean;
  badge?: number;
};

// Same shape as NavTab, but not restricted to the 5 rail-tab ids — used for entries that don't
// correspond to a hideable nav-rail tab (the mobile "Me" section: My Tasks/Assigned/Network/
// Profile), which the desktop sidebar's own "Me zone" exposes but the rail's hiddenNavTabs concept
// has never covered.
export type MenuTile = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active: boolean;
  badge?: number;
};

// The 3 tabs pinned to fixed slots in the bottom pill nav (MobileBottomNav.tsx) — shared with
// app/page.tsx and AppLauncherGrid.tsx so "everything else" is filtered consistently in one place
// instead of three separate hardcoded copies of the same 3 ids.
export const PRIMARY_NAV_TAB_IDS: NavTabId[] = ['board', 'calendar', 'chat'];

// The same three fixed slots under the new two-context layout: Home, Office, Planner.
//
// This constant is the fix for a bug that cost a whole round of "bryteren er på" / "fortsatt
// samme": the bottom nav does NOT render the navTabs list it is handed. It looks each of the ids
// above up in that list and drops everything else. So the contexts layout could build a perfectly
// correct Home/Office/Planner list and still paint the old bar — `office` is not in
// PRIMARY_NAV_TAB_IDS, so it was filtered out, leaving exactly the two surviving slots plus the
// launcher. The switch worked the whole time; the nav was throwing its output away one layer down.
//
// The lesson generalises past this file: a prop named `navTabs` that is treated as a lookup table
// rather than a list is invisible at the call site. Anything that builds a nav list has to be read
// together with what consumes it.
export const CONTEXT_NAV_TAB_IDS: NavTabId[] = ['board', 'office', 'calendar'];

export function primaryNavTabIds(layout: 'classic' | 'contexts'): NavTabId[] {
  return layout === 'contexts' ? CONTEXT_NAV_TAB_IDS : PRIMARY_NAV_TAB_IDS;
}

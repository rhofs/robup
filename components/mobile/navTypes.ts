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

// The three tabs pinned to the fixed slots in the bottom pill nav (MobileBottomNav.tsx) — shared
// with app/page.tsx and AppLauncherGrid.tsx so "everything else" is filtered consistently in one
// place instead of three separate hardcoded copies of the same ids.
//
// NOT rendered as given by the nav: it looks each of these up in the navTabs list it is handed and
// drops everything else. That cost two rounds once — a correctly built tab list whose ids were not
// on this list simply vanished, with nothing anywhere to say why. Anything building a nav list has
// to be read together with what consumes it.
//
// The old PRIMARY_NAV_TAB_IDS (board/calendar/chat) and the primaryNavTabIds(layout) helper that
// chose between them are gone with the layout setting: mobile is always this list now.
export const CONTEXT_NAV_TAB_IDS: NavTabId[] = ['board', 'office', 'calendar'];

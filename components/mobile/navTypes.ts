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

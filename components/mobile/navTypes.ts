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

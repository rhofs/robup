'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, Settings, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MenuTile } from './navTypes';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

type Props = {
  open: boolean;
  onClose: () => void;
  // Everything not already pinned to the bottom nav's 3 fixed slots (app/page.tsx's
  // visibleNavTabs minus PRIMARY_NAV_TAB_IDS) plus the "Me" section (My Tasks/Assigned/
  // Connections/Profile) — both selectable as the nav's 4th, dynamic slot.
  contentTiles: MenuTile[];
  meItems: MenuTile[];
  pinnedTileId: string | null;
  onSelectTile: (id: string) => void;
  onOpenSettings: () => void;
  onOpenTrash: () => void;
};

type TileProps = {
  icon: LucideIcon;
  label: string;
  selected?: boolean;
  badge?: number;
  onClick: () => void;
};

function Tile({ icon: Icon, label, selected, badge, onClick }: TileProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 cursor-pointer">
      <span
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition ${
          selected ? 'bg-neutral-800 ring-2 ring-blue-500' : 'bg-neutral-800/60'
        }`}
      >
        <Icon className={`w-6 h-6 ${selected ? 'text-blue-400' : 'text-neutral-300'}`} />
        {!!badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium text-neutral-300 leading-none">{label}</span>
    </button>
  );
}

// Mobile-only "more" grid — opened from the bottom nav's dynamic 4th slot (MobileBottomNav.tsx),
// which also shows whichever tile was last picked here as its own icon/label so the two act as one
// ClickUp-style shortcut-or-switcher control. Selecting a tile here both performs its action *and*
// pins it (onSelectTile) so it becomes the nav's shortcut going forward; the currently-pinned tile
// gets a highlighted ring, matching the reference screenshot's bordered "selected" tile.
//
// Grows directly out of that nav button rather than sliding up as a bottom sheet: the panel shares
// a framer-motion layoutId ("mobileMenuMorph") with the button's own background pill (only one of
// the two is ever mounted at a time), so opening/closing reads as one pill expanding into a
// rounded-rectangle panel and back — a real container-transform, not two independent animations.
export default function AppLauncherGrid({
  open,
  onClose,
  contentTiles,
  meItems,
  pinnedTileId,
  onSelectTile,
  onOpenSettings,
  onOpenTrash,
}: Props) {
  // Only ever a real actionable tile on Chrome/Edge-family browsers that fired
  // `beforeinstallprompt` (see useInstallPrompt.ts) — iOS has no programmatic install prompt at
  // all, so it gets a longer text hint in AccountSettingsPanel.tsx instead of a dead tile here.
  const { canInstall, promptInstall } = useInstallPrompt();
  const pinnableTiles = [...contentTiles, ...meItems];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            layoutId="mobileMenuMorph"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="absolute inset-x-3 bg-neutral-900 border border-neutral-800/80 rounded-2xl shadow-2xl shadow-black/40 px-3 pt-4 pb-2 max-h-[60vh] overflow-y-auto"
            style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom) + 8px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16, delay: 0.05 }}
            >
              <div className="grid grid-cols-3 gap-4">
                {pinnableTiles.map((tile) => (
                  <Tile
                    key={tile.id}
                    icon={tile.icon}
                    label={tile.label}
                    badge={tile.badge}
                    selected={tile.id === pinnedTileId}
                    onClick={() => {
                      onSelectTile(tile.id);
                      tile.onClick();
                      onClose();
                    }}
                  />
                ))}
              </div>

              <div className="h-px bg-neutral-800/70 my-4" />

              <div className="grid grid-cols-3 gap-4 pb-2">
                <Tile
                  icon={Settings}
                  label="Settings"
                  onClick={() => {
                    onOpenSettings();
                    onClose();
                  }}
                />
                <Tile
                  icon={Trash2}
                  label="Trash"
                  onClick={() => {
                    onOpenTrash();
                    onClose();
                  }}
                />
                {canInstall && (
                  <Tile
                    icon={Download}
                    label="Install"
                    onClick={() => {
                      promptInstall();
                      onClose();
                    }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

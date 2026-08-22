'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, Settings, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NavTab, MenuTile } from './navTypes';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

type Props = {
  open: boolean;
  onClose: () => void;
  navTabs: NavTab[];
  meItems: MenuTile[];
  onOpenSettings: () => void;
  onOpenTrash: () => void;
};

type TileProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
};

function Tile({ icon: Icon, label, active, badge, onClick }: TileProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg transition cursor-pointer ${
        active ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 bg-neutral-800/40'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[11px] font-medium leading-none">{label}</span>
      {!!badge && badge > 0 && (
        <span className="absolute top-1 right-[calc(50%-22px)] min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// Mobile-only "more" grid (opened from MobileBottomNav's Menu button) — covers everything the
// desktop icon rail exposes (app/page.tsx's visibleNavTabs) plus Settings/Trash, which don't fit
// in the bottom nav's 4 fixed slots, plus a "Me" section (My Tasks/Assigned/Network/Profile) that
// mirrors the desktop sidebar's own Me zone (hidden below md, otherwise unreachable on mobile).
// Every tile calls a setter the desktop UI already calls elsewhere; no new state is introduced
// here beyond the install-prompt hook.
export default function AppLauncherGrid({ open, onClose, navTabs, meItems, onOpenSettings, onOpenTrash }: Props) {
  // Only ever a real actionable tile on Chrome/Edge-family browsers that fired
  // `beforeinstallprompt` (see useInstallPrompt.ts) — iOS has no programmatic install prompt at
  // all, so it gets a longer text hint in AccountSettingsPanel.tsx instead of a dead tile here.
  const { canInstall, promptInstall } = useInstallPrompt();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="relative bg-neutral-900 border-t border-neutral-800/80 rounded-t-2xl px-4 pt-3 pb-6 max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-neutral-300">Menu</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {navTabs.map((tab) => (
                <Tile
                  key={tab.id}
                  icon={tab.icon}
                  label={tab.label}
                  active={tab.active}
                  badge={tab.badge}
                  onClick={() => {
                    tab.onClick();
                    onClose();
                  }}
                />
              ))}
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

            <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold px-1 mt-4 mb-2">Me</div>
            <div className="grid grid-cols-4 gap-3">
              {meItems.map((item) => (
                <Tile
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={item.active}
                  badge={item.badge}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

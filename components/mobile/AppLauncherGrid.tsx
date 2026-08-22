'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Settings, Trash2, X } from 'lucide-react';
import type { NavTab } from './navTypes';

type Props = {
  open: boolean;
  onClose: () => void;
  navTabs: NavTab[];
  onOpenSettings: () => void;
  onOpenTrash: () => void;
};

// Mobile-only "more" grid (opened from MobileBottomNav's Menu button) — covers everything the
// desktop icon rail exposes (app/page.tsx's visibleNavTabs) plus Settings/Trash, which don't fit
// in the bottom nav's 4 fixed slots. Every tile calls a setter the desktop rail already calls;
// no new state is introduced here.
export default function AppLauncherGrid({ open, onClose, navTabs, onOpenSettings, onOpenTrash }: Props) {
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
            className="relative bg-neutral-900 border-t border-neutral-800/80 rounded-t-2xl px-4 pt-3 pb-6"
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
                <button
                  key={tab.id}
                  onClick={() => {
                    tab.onClick();
                    onClose();
                  }}
                  className={`relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg transition cursor-pointer ${
                    tab.active ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 bg-neutral-800/40'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium leading-none">{tab.label}</span>
                  {!!tab.badge && tab.badge > 0 && (
                    <span className="absolute top-1 right-[calc(50%-22px)] min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg bg-neutral-800/40 text-neutral-300 cursor-pointer"
              >
                <Settings className="w-5 h-5" />
                <span className="text-[11px] font-medium leading-none">Settings</span>
              </button>
              <button
                onClick={() => {
                  onOpenTrash();
                  onClose();
                }}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg bg-neutral-800/40 text-neutral-300 cursor-pointer"
              >
                <Trash2 className="w-5 h-5" />
                <span className="text-[11px] font-medium leading-none">Trash</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

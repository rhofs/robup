'use client';

import { LayoutGrid, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import type { NavTab } from './navTypes';

const PRIMARY_TAB_IDS = ['board', 'calendar', 'chat'] as const;

type Props = {
  navTabs: NavTab[];
  menuOpen: boolean;
  onToggleMenu: () => void;
  // The "board" tab is relabeled "Spaces" here and opens the Spaces sheet instead of jumping
  // straight into the board — mobile-only behavior. visibleNavTabs/its onClick stay untouched
  // for the desktop rail, which still goes straight to the board on click; this only overrides
  // what happens when *this* component renders that one tab.
  onOpenSpaces: () => void;
};

// Mobile-only bottom nav (md:hidden) — reads the exact same visibleNavTabs/setActiveView plumbing
// the desktop icon rail uses (app/page.tsx), just picks 3 of them for fixed slots and adds a
// 4th "Menu" slot that opens the app-launcher grid instead of switching activeView directly.
// Floating rounded pill (not a flush-edge bar) with a shared-layout "bubble" that slides between
// tabs on selection — matches the reference (ClickUp's own mobile nav) the user pointed at.
export default function MobileBottomNav({ navTabs, menuOpen, onToggleMenu, onOpenSpaces }: Props) {
  const primaryTabs = PRIMARY_TAB_IDS
    .map((id) => navTabs.find((t) => t.id === id))
    .filter((t): t is NavTab => !!t);

  return (
    <div
      className="flex md:hidden justify-center px-3 pt-1.5"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      <nav className="flex items-center gap-0.5 bg-neutral-900 border border-neutral-800/80 rounded-full px-1.5 py-1.5 shadow-lg shadow-black/30">
        {primaryTabs.map((tab) => {
          const isSpaces = tab.id === 'board';
          const Icon = isSpaces ? LayoutGrid : tab.icon;
          const label = isSpaces ? 'Spaces' : tab.label;
          return (
            <button
              key={tab.id}
              onClick={isSpaces ? onOpenSpaces : tab.onClick}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-full transition cursor-pointer ${
                tab.active ? 'text-blue-400' : 'text-neutral-500'
              }`}
            >
              {tab.active && (
                <motion.div
                  layoutId="mobileNavPill"
                  className="absolute inset-0 bg-neutral-800 rounded-full -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
              {!!tab.badge && tab.badge > 0 && (
                <span className="absolute top-0.5 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onToggleMenu}
          className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-full transition cursor-pointer ${
            menuOpen ? 'text-blue-400' : 'text-neutral-500'
          }`}
        >
          {menuOpen && (
            <motion.div
              layoutId="mobileNavPill"
              className="absolute inset-0 bg-neutral-800 rounded-full -z-10"
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Menu</span>
        </button>
      </nav>
    </div>
  );
}

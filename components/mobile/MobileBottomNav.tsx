'use client';

import { ChevronDown, ChevronUp, LayoutGrid, Menu as MenuIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { NavTab, MenuTile } from './navTypes';
import { PRIMARY_NAV_TAB_IDS } from './navTypes';

type Props = {
  navTabs: NavTab[];
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  // The "board" tab is relabeled "Spaces" here and opens the Spaces sheet instead of jumping
  // straight into the board — mobile-only behavior. visibleNavTabs/its onClick stay untouched
  // for the desktop rail, which still goes straight to the board on click; this only overrides
  // what happens when *this* component renders that one tab.
  onOpenSpaces: () => void;
  // Whichever tile the user last picked from the app-launcher grid (AppLauncherGrid.tsx) — the
  // 4th slot renders *that* tile's icon/label instead of a generic "Menu" hamburger, ClickUp-style.
  // null only before any tile has ever been picked (falls back to a plain Menu icon/label).
  pinnedTile: MenuTile | null;
};

// Mobile-only bottom nav (md:hidden) — reads the exact same visibleNavTabs/setActiveView plumbing
// the desktop icon rail uses (app/page.tsx), just picks 3 of them for fixed slots and adds a
// 4th slot that doubles as a shortcut to the last-picked grid tile AND the grid's opener —
// matches ClickUp's own mobile nav (the reference the user pointed at): tapping it when you're
// NOT already on the pinned destination jumps straight there; tapping it while you ARE there (or
// while the grid is already open) opens/closes the picker grid instead. The small chevron is the
// only visual "this is also a menu button" cue, also flipping open ClickUp-style.
// Floating rounded pill (not a flush-edge bar) with a shared-layout "bubble" that slides between
// the 3 primary tabs on selection — matches the reference. The 4th slot's own highlight is a plain
// framer-motion opacity fade (not a shared layoutId with the grid panel — see AppLauncherGrid.tsx
// for why that turned out to be the wrong tool here).
export default function MobileBottomNav({ navTabs, menuOpen, onOpenMenu, onCloseMenu, onOpenSpaces, pinnedTile }: Props) {
  const primaryTabs = PRIMARY_NAV_TAB_IDS
    .map((id) => navTabs.find((t) => t.id === id))
    .filter((t): t is NavTab => !!t);

  const handlePinnedTap = () => {
    if (menuOpen) {
      onCloseMenu();
    } else if (pinnedTile && !pinnedTile.active) {
      pinnedTile.onClick();
    } else {
      onOpenMenu();
    }
  };

  const PinnedIcon = pinnedTile?.icon ?? MenuIcon;
  const pinnedActive = menuOpen || !!pinnedTile?.active;

  return (
    // relative z-40: MobileSpacesSheet.tsx is deliberately a full-height page rather than a
    // blocking modal (z-30, lower than this), so the nav stays visible/tappable above it —
    // relative is needed for z-index to apply at all on a non-fixed element, since a bare
    // z-index is ignored on a statically-positioned one.
    <div
      className="relative z-40 flex md:hidden justify-center px-3 pt-1.5"
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
          onClick={handlePinnedTap}
          className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-full transition cursor-pointer ${
            pinnedActive ? 'text-blue-400' : 'text-neutral-500'
          }`}
        >
          <AnimatePresence>
            {pinnedActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0 bg-neutral-800 rounded-full -z-10"
              />
            )}
          </AnimatePresence>
          <PinnedIcon className="w-5 h-5" />
          <span className="flex items-center gap-0.5 text-[10px] font-medium leading-none">
            {pinnedTile?.label ?? 'Menu'}
            {menuOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </span>
          {!!pinnedTile?.badge && pinnedTile.badge > 0 && (
            <span className="absolute top-0.5 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
              {pinnedTile.badge > 99 ? '99+' : pinnedTile.badge}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}

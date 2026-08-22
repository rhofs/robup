'use client';

import { Menu } from 'lucide-react';
import type { NavTab } from './navTypes';

const PRIMARY_TAB_IDS = ['board', 'calendar', 'chat'] as const;

type Props = {
  navTabs: NavTab[];
  menuOpen: boolean;
  onToggleMenu: () => void;
};

// Mobile-only bottom nav (md:hidden) — reads the exact same visibleNavTabs/setActiveView plumbing
// the desktop icon rail uses (app/page.tsx), just picks 3 of them for fixed slots and adds a
// 4th "Menu" slot that opens the app-launcher grid instead of switching activeView directly.
export default function MobileBottomNav({ navTabs, menuOpen, onToggleMenu }: Props) {
  const primaryTabs = PRIMARY_TAB_IDS
    .map((id) => navTabs.find((t) => t.id === id))
    .filter((t): t is NavTab => !!t);

  return (
    <nav
      className="flex md:hidden items-center justify-around border-t border-neutral-800/80 bg-neutral-950 shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {primaryTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={tab.onClick}
          className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition cursor-pointer ${
            tab.active ? 'text-blue-400' : 'text-neutral-500'
          }`}
        >
          <tab.icon className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">{tab.label}</span>
          {!!tab.badge && tab.badge > 0 && (
            <span className="absolute top-0.5 right-[calc(50%-18px)] min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </button>
      ))}
      <button
        onClick={onToggleMenu}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition cursor-pointer ${
          menuOpen ? 'text-blue-400' : 'text-neutral-500'
        }`}
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none">Menu</span>
      </button>
    </nav>
  );
}

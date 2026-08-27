'use client';

import { ChevronDown, ChevronUp, LayoutGrid, Menu as MenuIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { NavTab, MenuTile } from './navTypes';
import { PRIMARY_NAV_TAB_IDS } from './navTypes';
import { hapticTap } from '../../lib/haptics';

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
  // Opening Spaces never sets activeView itself (only actually picking a Space does — see
  // MobileSpacesSheet.tsx), so the tab's own `active` flag (derived from activeView) stays false
  // the whole time you're just browsing it. Passed in separately so the button can still light up
  // while the sheet is open, not only once you've landed on a board.
  spacesOpen: boolean;
  // Whichever tile the user last picked from the app-launcher grid (AppLauncherGrid.tsx) — the
  // 4th slot renders *that* tile's icon/label instead of a generic "Menu" hamburger, ClickUp-style.
  // null only before any tile has ever been picked (falls back to a plain Menu icon/label).
  pinnedTile: MenuTile | null;
  // Closes every mobile-only overlay screen (Spaces, the grid, the Chat/Planner filter sheets).
  // Called explicitly at the start of every tap here, not left to a `useEffect` keyed on
  // activeView alone — re-tapping a destination you were already on before opening Spaces (e.g.
  // Planner → open Spaces to browse → tap Planner again) never actually changes activeView's
  // *value*, so an effect watching only that would silently never fire, leaving Spaces stuck open
  // and reading as "the tap did nothing." Calling this directly guarantees a clean slate regardless
  // of whether the destination happens to match what's already active.
  onNavigate: () => void;
};

// Mobile-only bottom nav (md:hidden) — reads the exact same visibleNavTabs/setActiveView plumbing
// the desktop icon rail uses (app/page.tsx), just picks 3 of them for fixed slots and adds a
// 4th slot that doubles as a shortcut to the last-picked grid tile AND the grid's opener —
// matches ClickUp's own mobile nav (the reference the user pointed at): tapping it when you're
// NOT already on the pinned destination jumps straight there; tapping it while you ARE there (or
// while the grid is already open) opens/closes the picker grid instead. The small chevron is the
// only visual "this is also a menu button" cue, also flipping open ClickUp-style.
// Floating rounded pill (not a flush-edge bar). All 4 slots share one sliding "bubble"
// (`layoutId="mobileNavPill"`) that moves between whichever is active, including the 4th
// (dynamic) slot — so switching to/from it slides like the other 3, not a hard cut. That 4th
// slot used to also carry a second, invisible `layoutId="mobileMenuMorph"` anchor shared with the
// grid panel (AppLauncherGrid.tsx), growing the panel directly out of this button's geometry —
// dropped along with that panel's own layoutId morph per feedback that the open animation felt
// choppy (a `layout` animation isn't compositor-only the way transform/opacity are); the panel now
// just scales/fades in on its own, so this slot doesn't need a matching anchor for it any more.
export default function MobileBottomNav({ navTabs, menuOpen, onOpenMenu, onCloseMenu, onOpenSpaces, spacesOpen, pinnedTile, onNavigate }: Props) {
  const primaryTabs = PRIMARY_NAV_TAB_IDS
    .map((id) => navTabs.find((t) => t.id === id))
    .filter((t): t is NavTab => !!t);

  // Same !spacesOpen guard primaryTabs' own `active` already applies (see its comment above) —
  // opening Spaces never changes activeView (only actually picking a Space does), so whatever tab
  // was active before stays "true" underneath the whole time Spaces is open. Used for both the
  // pinned slot's color AND its tap behavior below — without this guard, the *tap* bug was worse
  // than just a cosmetic color glitch: handlePinnedTap's own "is the pinned tile already where I
  // am" check read this same stale true, so tapping Menu from Spaces skipped the shortcut-navigate
  // entirely and opened the grid on the very first tap every time (reported live: happened from
  // Spaces specifically, never from Planner/Chat — because only Spaces leaves activeView
  // unchanged underneath it).
  const pinnedIsCurrentDestination = !!pinnedTile?.active && !spacesOpen;

  const handlePinnedTap = () => {
    hapticTap();
    onNavigate();
    if (menuOpen) {
      onCloseMenu();
    } else if (pinnedTile && !pinnedIsCurrentDestination) {
      pinnedTile.onClick();
    } else {
      onOpenMenu();
    }
  };

  const PinnedIcon = pinnedTile?.icon ?? MenuIcon;
  const pinnedActive = menuOpen || pinnedIsCurrentDestination;

  return (
    // relative z-40: MobileSpacesSheet.tsx is deliberately a full-height page rather than a
    // blocking modal (z-30, lower than this), so the nav stays visible/tappable above it —
    // relative is needed for z-index to apply at all on a non-fixed element, since a bare
    // z-index is ignored on a statically-positioned one.
    <div
      className="relative z-40 flex md:hidden justify-center px-3 pt-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
    >
      <nav className="flex items-center gap-0.5 bg-neutral-900 border border-neutral-800/80 rounded-full px-1.5 py-1.5 shadow-lg shadow-black/30">
        {primaryTabs.map((tab) => {
          const isSpaces = tab.id === 'board';
          const Icon = isSpaces ? LayoutGrid : tab.icon;
          const label = isSpaces ? 'Spaces' : tab.label;
          // Opening Spaces doesn't change activeView, so whatever tab was active before stays
          // "true" underneath — without the `!spacesOpen` guard here, that stale tab and Spaces
          // would both light up at once. The Spaces screen visually covers everything while open,
          // so nothing else should read as active at the same time.
          const active = isSpaces ? tab.active || spacesOpen : tab.active && !spacesOpen;
          return (
            <button
              key={tab.id}
              onClick={() => {
                hapticTap();
                onNavigate();
                (isSpaces ? onOpenSpaces : tab.onClick)();
              }}
              className={`relative z-0 flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-full transition cursor-pointer ${
                active ? 'text-blue-400' : 'text-neutral-500'
              }`}
            >
              {/* z-0 on the button (above) + -z-10 here is deliberate, not decorative: a negative
                  z-index escapes to the nearest ancestor that actually establishes a stacking
                  context, not just "one layer behind this element's own siblings." Without z-0 on
                  the button, that ancestor was the outer z-40 wrapper several levels up — meaning
                  this pill painted behind the *entire nav bar's own opaque background*, rendering
                  correctly in the DOM but completely invisible. z-0 scopes the negative z-index to
                  just this button, putting the pill behind its own icon/label as intended. */}
              {active && (
                <motion.div
                  layoutId="mobileNavPill"
                  className="absolute inset-0 bg-blue-500/15 rounded-full -z-10"
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
          className={`relative z-0 flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-full transition cursor-pointer ${
            pinnedActive ? 'text-blue-400' : 'text-neutral-500'
          }`}
        >
          <AnimatePresence>
            {!menuOpen && pinnedActive && (
              <motion.div
                layoutId="mobileNavPill"
                className="absolute inset-0 bg-blue-500/15 rounded-full -z-10"
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
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

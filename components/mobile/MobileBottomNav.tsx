'use client';

import { ChevronDown, ChevronUp, LayoutGrid, Menu as MenuIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { NavTab, MenuTile } from './navTypes';
import { PRIMARY_NAV_TAB_IDS } from './navTypes';
import { hapticTap } from '../../lib/haptics';
import AppLauncherGridContent from './AppLauncherGrid';
import type { HierarchyWorkspace } from '../../store/useTaskStore';

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
  // Whichever tile the user last picked from the app-launcher grid content — the 4th slot renders
  // *that* tile's icon/label instead of a generic "Menu" hamburger, ClickUp-style.
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
  // Everything below here used to be AppLauncherGrid.tsx's own Props — that file now only exports
  // the picker *content* (AppLauncherGridContent), rendered inside this component's own single
  // shared island box. See this file's own top-level comment for why the two were merged.
  contentTiles: MenuTile[];
  meItems: MenuTile[];
  onSelectTile: (id: string) => void;
  onOpenSettings: () => void;
  onOpenTrash: () => void;
  showArchived: boolean;
  onToggleArchive: () => void;
  realWorkspaces: HierarchyWorkspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
};

// NAV_CLOSED_HEIGHT: the island's total rendered height while collapsed to just the tab row —
// used both to reserve the right amount of space in the page's own normal flow (this component's
// outer wrapper, below) and as the clip-path reveal boundary (how much of the box's bottom stays
// visible while closed). The two *must* agree exactly or the collapsed pill either leaves a gap
// above the true bottom edge or gets cut off. This is the same expression this file used for years
// as the old floating pill's own natural height (tab row's own padding/icon/label sizing plus a
// flat 16px + safe-area for the home-indicator clearance) — kept identical rather than re-derived,
// since it was already effectively verified correct (zero visible gap) across many rounds of the
// popup-menu saga in PLANNING.md before the two components merged into one box.
const NAV_CLOSED_HEIGHT = 'calc(4.75rem + env(safe-area-inset-bottom))';

// Mobile-only bottom nav (md:hidden) AND the "more" popup panel it opens — merged into one single
// box after several rounds of trying to make two independently-bordered/rounded/animated elements
// (a separate floating pill + a separate floating panel) *look* like one continuous shape by
// carefully matching their corner radii, borders, and widths. That approach has a hard ceiling:
// two touching shapes can only ever approximate one shape, and every fix for one visible seam
// (a border line, a corner-radius mismatch) kept surfacing another. A single shared box — one
// background, one border, one border-radius, one clip-path — can't have an internal seam by
// construction. See PLANNING.md's full popup-menu saga for the whole history; the short version:
// fade → slide → clip-path → reduced-motion fix (nothing had actually been animating) → matched
// corners (animated, rejected as distracting) → matched borders → this merge.
//
// Structure: the outer wrapper stays in normal document flow (so the rest of the page still gets
// its bottom safe-area padding correctly, unaffected by whether the menu is open) and reserves
// exactly NAV_CLOSED_HEIGHT of real space. The actual island is `position: absolute; bottom: 0`
// inside that wrapper — its own natural height is always the *full* open height (tab row content
// is always mounted, never conditionally unmounted, so there's no remount-driven measurement jump
// the first time it opens), and a `clipPath` animation reveals/hides everything above the tab row.
// Purely paint-only (no `layout`-animated property), same reasoning as every round before this one.
export default function MobileBottomNav({
  navTabs,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onOpenSpaces,
  spacesOpen,
  pinnedTile,
  onNavigate,
  contentTiles,
  meItems,
  onSelectTile,
  onOpenSettings,
  onOpenTrash,
  showArchived,
  onToggleArchive,
  realWorkspaces,
  activeWorkspaceId,
  onSelectWorkspace,
}: Props) {
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
    // onNavigate() (closeMobileOverlays) used to fire unconditionally here, *including* when this
    // tap only opens the grid — but that means opening the menu ON TOP of an already-open Spaces/
    // Personal-Spaces tree sheet dismissed that sheet first, revealing whatever board content sat
    // underneath (often its own SpaceHome "card", since just browsing the tree doesn't select a
    // List) behind the menu's dimmed backdrop instead of the tree itself. Reported live as "jeg
    // går fra Personal Spaces... til My Tasks med Personal og 'kort'" when opening the menu — not
    // the menu showing the wrong background, the background *changing* out from under it. The
    // menu (z-50) already renders above the tree sheet (z-30) in normal stacking order, so it can
    // safely sit on top without needing to close it first — only a *real* destination change
    // (the shortcut-navigate branch below) should still dismiss other overlays first.
    if (menuOpen) {
      onCloseMenu();
    } else if (pinnedTile && !pinnedIsCurrentDestination) {
      onNavigate();
      pinnedTile.onClick();
    } else {
      onOpenMenu();
    }
  };

  const PinnedIcon = pinnedTile?.icon ?? MenuIcon;
  const pinnedActive = menuOpen || pinnedIsCurrentDestination;

  return (
    <>
      {/* Backdrop dims everything *except* the island itself — stops exactly at NAV_CLOSED_HEIGHT
          instead of covering the full screen, so it never paints over (and visibly darkens) the
          tab row sitting at the bottom of the very same box it's supposed to be excluding. z-40,
          one below the island's own z-50, and z-30 above MobileSpacesSheet.tsx's tree sheet (so
          the menu can open on top of it without needing to close it first, per handlePinnedTap's
          own comment above). No pointer-events wrapper juggling needed here any more — unlike the
          old separate-panel version, this backdrop isn't nested inside a full-screen ancestor div
          that could silently swallow clicks meant for something else underneath it. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ bottom: NAV_CLOSED_HEIGHT }}
            className="fixed inset-x-0 top-0 z-40 md:hidden bg-black/60"
            onClick={onCloseMenu}
          />
        )}
      </AnimatePresence>

      <div className="relative z-50 md:hidden" style={{ height: NAV_CLOSED_HEIGHT }}>
        <motion.div
          animate={{
            clipPath: menuOpen
              ? 'inset(0% 0% 0% 0% round 24px)'
              : `inset(calc(100% - ${NAV_CLOSED_HEIGHT}) 0% 0% 0% round 24px)`,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.9 }}
          className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[300px] max-w-[calc(100vw-48px)] bg-neutral-900 border border-neutral-800/80 shadow-2xl shadow-black/40"
        >
          {/* Grid content: always mounted (never conditionally unmounted), so there's no
              first-open measurement jump — the box's own natural height already includes this
              whether or not it's currently revealed. When collapsed, `clipPath` above hides *and*
              hit-test-disables this whole region (standard clip-path behavior), so it's never
              accidentally tappable while invisible. */}
          <div className="px-2.5 pt-3 pb-2 max-h-[50vh] overflow-y-auto">
            <AppLauncherGridContent
              menuOpen={menuOpen}
              onClose={onCloseMenu}
              contentTiles={contentTiles}
              meItems={meItems}
              onSelectTile={onSelectTile}
              onOpenSettings={onOpenSettings}
              onOpenTrash={onOpenTrash}
              showArchived={showArchived}
              onToggleArchive={onToggleArchive}
              onNavigate={onNavigate}
              realWorkspaces={realWorkspaces}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={onSelectWorkspace}
            />
          </div>
          <div className="h-px bg-neutral-800/70 mx-2.5" />
          {/* The tab row itself — same content/behavior as before the merge, just living inside
              the shared box instead of its own separate `<nav>` element. Its own bottom padding
              (moved down from the old outer wrapper) reproduces the same safe-area clearance the
              floating pill always had. */}
          <nav
            className="flex items-center justify-between gap-0.5 px-1.5 pt-1.5"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
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
                  className={`relative z-0 flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-full transition cursor-pointer ${
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
              className={`relative z-0 flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-full transition cursor-pointer ${
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
        </motion.div>
      </div>
    </>
  );
}

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
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
  onCreateWorkspace: () => void;
};

// Rough starting guesses only — corrected to the real measured values by a layout effect before
// the very first paint (see tabRowRef/islandRef below), so their exact numbers barely matter.
const CLOSED_HEIGHT_GUESS_PX = 76;
const ISLAND_HEIGHT_GUESS_PX = 300;

// The gap between the island's own bottom edge and the true bottom of the screen — on top of
// `env(safe-area-inset-bottom)`, not instead of it. This used to be baked into the tab row's own
// *internal* bottom padding (asymmetric vs. its 6px top padding), which had two problems: it made
// the tab icons/labels sit visibly off-center inside the pill, and it meant the pill's own visible
// bottom edge (with its rounded corners) sat flush against the literal screen edge — reported live
// as the pill "going under the frame" of the phone. Moving this into an *external* gap below the
// pill (its own internal padding is back to a plain symmetric `py-1.5`) fixes both: the tab content
// is centered again, and the rounded corners float clearly above the screen edge with visible air
// beneath them.
const ISLAND_EXTRA_BOTTOM_GAP_PX = 10;
const ISLAND_BOTTOM_OFFSET = `calc(env(safe-area-inset-bottom) + ${ISLAND_EXTRA_BOTTOM_GAP_PX}px)`;

// iOS Safari specifically: `backdrop-filter` is supported but repaints badly whenever anything
// around it animates, and no amount of layering has fixed it. Moving the blur onto its own
// fixed-size compositing layer (the previous attempt) did not help — the user still reported it
// "nesten som et blink" on an iPhone 15, while the same build looks correct on Android. So the
// blur is simply dropped there, per the plan recorded when that attempt shipped: the effect is
// decorative, the flicker is not. Android/desktop keep it.
//
// Detected from the user agent rather than a feature query, because the problem is not a missing
// feature — the property works, it just performs badly on one engine. iPadOS 13+ reports itself as
// a Mac, hence the maxTouchPoints half.
function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

// Mobile-only bottom nav (md:hidden) AND the "more" popup panel it opens — merged into one single
// box after several rounds of trying to make two independently-bordered/rounded/animated elements
// (a separate floating pill + a separate floating panel) *look* like one continuous shape by
// carefully matching their corner radii, borders, and widths. That approach has a hard ceiling:
// two touching shapes can only ever approximate one shape, and every fix for one visible seam
// (a border line, a corner-radius mismatch) kept surfacing another. A single shared box — one
// background, one border, one border-radius — can't have an internal seam by construction. See
// PLANNING.md's full popup-menu saga for the whole history; the short version: fade → slide →
// clip-path → reduced-motion fix (nothing had actually been animating) → matched corners (animated,
// rejected as distracting) → matched borders → merge into one box.
//
// Reveal mechanism: an earlier version of this merge animated `clip-path: inset(... round 24px)`
// directly. That reintroduced exactly the corner-sharpening glitch the "matched corners, rejected"
// round above had already ruled out, plus a stutter on close — `clip-path` combined with an
// animated rounded corner is a known rough edge in mobile browsers, and it persisted even once both
// keyframes were made token-for-token identical in shape (only the numbers differed), so the
// instability lives in animating the shape itself, not in how the values were written. Fixed by
// separating "what's rounded" from "what's animated": the outer box's `rounded-[32px] overflow-
// hidden` is completely static, never touched by any animation, so the corners can never glitch.
// Only a plain numeric `height` is animated (the simplest, most reliably-interpolated CSS value
// there is), and `flex flex-col justify-end` keeps the tab row pinned to the bottom the whole time,
// so shrinking the height clips away the grid content from the *top* while the tab row — the last
// child, bottom-anchored — stays fully visible. `height` isn't a compositor-only property the way
// `transform`/`opacity`/`clip-path` are, but this box is tiny (300px wide, a few tab buttons and a
// small grid) — the reflow cost here is not a real jank source, and it buys a construction where
// the rounded corners are structurally guaranteed to never move.
//
// The outer wrapper (below) is `fixed`, floating over whatever's scrolled underneath rather than
// reserving space for itself in document flow — content behind it (Spaces/My Tasks/Chat/Planner)
// scrolls its own full length, visible/blurred through the island's translucent background, per a
// ClickUp/Messenger-style reference the user pointed at: a page's content genuinely extends the
// whole way down, with the nav floating as its own rounded island on top, rather than the page
// stopping short to leave the nav a clear lane. Each scrollable surface still carries its own
// bottom padding (sized to clear the island) so its very last item can still be scrolled fully
// into view above it — see the padding added at each of those call sites. The animated box itself
// is `position: absolute; bottom: 0` inside this wrapper — its content is always fully mounted
// (never conditionally unmounted), so there's no remount-driven measurement jump the first time it
// opens.
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
  onCreateWorkspace,
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

  // Measures the tab row's own real rendered height (its plain symmetric padding + icon + label,
  // already baked into offsetHeight by the browser) instead of trusting a hand-tuned constant to
  // happen to match it exactly. Safe-area clearance is handled separately, *outside* this element
  // (see ISLAND_BOTTOM_OFFSET above), so this height is just the visible pill content — no env()
  // extraction needed here at all. Re-measures on resize (rotation, dynamic type size) since this
  // is a real layout fact, not a one-time constant. useLayoutEffect (not useEffect) so the
  // correction lands before the browser's first paint, not one frame after it.
  // Read once on mount rather than per render — the user agent cannot change mid-session, and a
  // lazy initializer keeps this correct on the very first paint (this file's own useIsMobile
  // lesson: a useState(false)-then-useEffect correction can visibly paint the wrong frame first).
  const [blurDisabled] = useState(isIosLike);

  // True once the real measured heights have replaced the guesses above. Until then the island's
  // height animation is suppressed (see `transition` on the motion.div below), because the very
  // first correction — guess to measured — is not a state change anyone asked to see animated.
  //
  // This is what produced the "rar lukke-animasjon" reported when backing out of a DM: the whole
  // nav is *unmounted* while a conversation is open (that is how full-screen chat works — see
  // app/page.tsx's MobileBottomNav mount condition), so returning to the DM list remounts it, the
  // height starts at CLOSED_HEIGHT_GUESS_PX again, and the spring plays the difference every
  // single time. It reads as the chat closing with an animation, but nothing about chat is
  // animated at all — there is not one motion component in ChatPanel or ChatSidebar.
  const [measured, setMeasured] = useState(false);

  const tabRowRef = useRef<HTMLElement | null>(null);
  const [closedHeightPx, setClosedHeightPx] = useState(CLOSED_HEIGHT_GUESS_PX);
  useLayoutEffect(() => {
    const node = tabRowRef.current;
    if (!node) return;
    const measure = () => {
      setClosedHeightPx(node.offsetHeight);
      setMeasured(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Measures the whole shared island's own real *natural* content height (grid content + divider
  // + tab row — always fully mounted regardless of open/closed, so this never changes just from
  // toggling the menu). Attached to an inner wrapper, not the outer animated box itself — once the
  // outer box's `height` is being driven by `animate` below, reading its own offsetHeight would
  // just echo back whatever we last set it to instead of the true content height.
  const islandRef = useRef<HTMLDivElement | null>(null);
  const [islandHeightPx, setIslandHeightPx] = useState(ISLAND_HEIGHT_GUESS_PX);
  useLayoutEffect(() => {
    const node = islandRef.current;
    if (!node) return;
    const measure = () => setIslandHeightPx(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Total reserved space, including the external gap below the island (see ISLAND_BOTTOM_OFFSET) —
  // used for the outer wrapper's document-flow height and the backdrop's own cutoff, so both agree
  // with where the island's visible top edge actually sits.
  const reservedHeight = `calc(${closedHeightPx}px + ${ISLAND_BOTTOM_OFFSET})`;

  return (
    <>
      {/* Backdrop dims everything *except* the island itself — stops exactly at `reservedHeight`
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
            transition={{ duration: 0.12 }}
            style={{ bottom: reservedHeight }}
            className="fixed inset-x-0 top-0 z-40 md:hidden bg-black/60"
            onClick={onCloseMenu}
          />
        )}
      </AnimatePresence>

      {/* The island floats ISLAND_BOTTOM_OFFSET above the true screen edge, and the backdrop above
          deliberately stops short of the island so it never darkens the tab row through the
          island's own translucency. That leaves the gap *below* the island covered by neither —
          showing the page itself, undimmed. Invisible while the app was dark-only (dark on dark),
          and a hard white band the moment light mode shipped: reported with a screenshot as "en
          hvit bar nederst som ikke ser så bra ut, når menyen popper."
          Dimmed by its own strip rather than by extending the main backdrop down: the island sits
          above the backdrop in z-order but is translucent, so anything painted behind it bleeds
          through and darkens it. This strip stops exactly where the island's bottom edge begins,
          so it can't. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ height: ISLAND_BOTTOM_OFFSET }}
            className="fixed inset-x-0 bottom-0 z-40 md:hidden bg-black/60 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        <motion.div
          // Only `height` is ever animated here — a plain number, not a shape/string — and the
          // rounding/clipping (`rounded-[32px] overflow-hidden`) below is completely static, so
          // there's no way for the corners to visibly change mid-transition (see top-level
          // comment). `flex flex-col justify-end` bottom-anchors the content: when height shrinks
          // below the content's natural size, the overflow is clipped off the *top* (grid content)
          // while the last child (the tab row) stays pinned fully visible at the bottom. `bottom`
          // is the external safe-area + air gap (ISLAND_BOTTOM_OFFSET), not 0 — see that constant's
          // comment for why the island no longer sits flush against the screen's true edge.
          animate={{ height: menuOpen ? islandHeightPx : closedHeightPx }}
          // Stiffer and lighter than the original 300/28/0.9, which took long enough to settle
          // that opening the menu read as a lag between the tap and the panel arriving ("litt
          // delay når du trykker på menyene"). Damping raised alongside stiffness so the faster
          // spring still lands without overshooting into a bounce.
          // No animation until the first real measurement has landed — otherwise every remount of
          // this component (which happens on every exit from a full-screen chat conversation)
          // springs from the guess height to the measured one in full view.
          transition={measured ? { type: 'spring', stiffness: 520, damping: 36, mass: 0.6 } : { duration: 0 }}
          style={{ bottom: ISLAND_BOTTOM_OFFSET }}
          // The background/blur itself is NOT on this element — see the static layer below for
          // why. This box is purely shape (rounding, clipping, border, shadow) plus the animated
          // height.
          className="absolute left-1/2 -translate-x-1/2 w-[300px] max-w-[calc(100vw-48px)] rounded-[32px] overflow-hidden flex flex-col justify-end border border-neutral-800/80 shadow-2xl shadow-black/40"
        >
          {/* Translucent + blurred backdrop, as its own out-of-flow layer at a FIXED height —
              deliberately not on the animated box above, where it used to live.
              `backdrop-filter` on an element whose own size is being animated (and which is
              simultaneously clipped by a border-radius) is a well-known repaint-flicker source in
              iOS Safari: the blur region is re-sampled against a changing geometry every frame.
              Reported live on an iPhone 15 — "blinker når du popupper menyen." Pinning the blurred
              element to the island's full natural height and bottom-anchoring it means its own box
              never changes at all while the menu opens/closes; only the parent's clip does, so
              there's no per-frame re-sampling of a resizing filter region. `translateZ(0)` puts it
              on its own compositing layer, the standard companion to that fix.

              Blur is set inline with an explicit `-webkit-` pair rather than Tailwind's
              `backdrop-blur-xl`, because iOS Safari still requires the prefixed property and this
              is exactly the surface where it must not silently no-op.

              If this ever still flickers on a real device, the next honest step is dropping the
              blur on iOS entirely (a solid bg-neutral-950) rather than adding more compositing
              hints — the effect is decorative, the flicker isn't.

              Colour rationale unchanged: bg-neutral-950, not -900, because the scrollable content
              sheets behind it (Spaces/Chat/board list/Planner) are all -900, and a -900 island
              blended into whatever was scrolled under it instead of reading as its own chrome. */}
          <div
            aria-hidden
            className={`absolute inset-x-0 bottom-0 pointer-events-none ${blurDisabled ? 'bg-neutral-950' : 'bg-neutral-950/90'}`}
            style={{
              height: islandHeightPx,
              // Opaque instead of translucent where the blur is dropped: a see-through panel with
              // nothing blurring behind it reads as a rendering fault, not a style choice.
              ...(blurDisabled
                ? {}
                : { backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }),
              transform: 'translateZ(0)',
            }}
          />
          {/* Single flex child, measured as a whole (see islandRef above) — its natural content
              height is always the *full* open height regardless of the animated parent's current
              height, since offsetHeight reflects this element's own content-driven size, not
              whatever the ancestor happens to be clipping it to. `relative` so it stacks above the
              backdrop layer, which is absolutely positioned and would otherwise paint over it. */}
          <div ref={islandRef} className="relative">
            {/* Grid content: always mounted (never conditionally unmounted), so there's no
                first-open measurement jump. When collapsed, the parent's shrunk height (via
                overflow-hidden) hides *and* hit-test-disables this whole region, so it's never
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
                onCreateWorkspace={onCreateWorkspace}
              />
            </div>
            <div className="h-px bg-neutral-800/70 mx-2.5" />
            {/* The tab row itself — same content/behavior as before the merge, just living inside
                the shared box instead of its own separate `<nav>` element. Plain symmetric padding
                (`py-1.5`) — safe-area clearance lives outside this element entirely now, as part of
                the island's own external `bottom` offset (ISLAND_BOTTOM_OFFSET above). */}
            <nav
              ref={tabRowRef}
              className="flex items-center justify-between gap-0.5 px-1.5 py-1.5"
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
                  {/* h-3, fixed: matches the pinned button's own label row below exactly (which
                      needs it explicitly since it wraps an icon alongside the text) so both rows
                      resolve to the identical height regardless of content — without it, a plain
                      text span here and a `flex items-center` icon+text span there could differ by
                      a pixel or two, enough to visibly shift *this* button's own icon up/down
                      relative to the other three, since `nav`'s `items-center` centers each button
                      by its own intrinsic (auto) height. Reported live as "My Tasks... the icon
                      more up while Spaces/Planner/Chat are lined nicely." */}
                  <span className="h-3 text-[10px] font-medium leading-none">{label}</span>
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
              {/* h-3, fixed: see the matching comment on the plain tab label above — this row
                  wraps a chevron icon alongside its text, which (without an explicit height) sized
                  this span very slightly taller than the plain-text-only label the other 3 tabs
                  use, visibly shifting this button's own icon up relative to theirs. */}
              <span className="h-3 flex items-center gap-0.5 text-[10px] font-medium leading-none">
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
        </motion.div>
      </div>
    </>
  );
}

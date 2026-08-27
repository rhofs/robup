'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, ChevronDown, Download, Settings, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MenuTile } from './navTypes';
import type { HierarchyWorkspace } from '../../store/useTaskStore';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { hapticTap } from '../../lib/haptics';

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
  // Moved here from the board view's own per-view header — that row is shared by every
  // activeView === 'board' screen (personal workspace included), so it read as confusingly
  // out-of-place ("under My Tasks") for what's really a utility toggle, not a per-view action.
  // Desktop's own Archive button (same header, unaffected) stays exactly where it was.
  showArchived: boolean;
  onToggleArchive: () => void;
  // Closes every other mobile-only overlay (Spaces, the Chat/Planner filter sheets) — called
  // alongside onClose() on every tile pick, since Spaces can be left open underneath the grid (the
  // pinned nav button can open this grid while Spaces is still open) and a tile here always means
  // "go somewhere else now."
  onNavigate: () => void;
  // Real (non-personal) workspaces — mobile previously had no way at all to switch between more
  // than one, unlike desktop's own top-left switcher dropdown (reported live after a related fix:
  // landing on the wrong real workspace was only discoverable, not choosable, on mobile). Rows,
  // not square icon tiles like the rest of this grid — workspace names vary too much in length to
  // read well as a tile label, same reasoning MobileSpacesSheet.tsx's own Space rows already use.
  realWorkspaces: HierarchyWorkspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
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
    <button
      onClick={() => {
        hapticTap();
        onClick();
      }}
      className="flex flex-col items-center gap-1 cursor-pointer"
    >
      <span
        className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition ${
          selected ? 'bg-neutral-800 ring-2 ring-blue-500' : 'bg-neutral-800/60'
        }`}
      >
        <Icon className={`w-5 h-5 ${selected ? 'text-blue-400' : 'text-neutral-300'}`} />
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
// Used to share a framer-motion `layoutId` ("mobileMenuMorph") with the 4th nav button's own
// background pill (MobileBottomNav.tsx) — a real container-transform growing the small pill into
// this panel. Dropped per direct feedback that the open animation felt choppy/low-FPS: a `layout`
// animation interpolates actual box-model geometry (width/height/position) every frame, which the
// browser can't hand off to the GPU compositor the way it can transform/opacity — exactly the kind
// of animation that visibly janks on a mid-range phone even though it looks fine on a dev machine.
// Replaced with a plain scale+opacity+y `initial`/`animate`/`exit` — compositor-only properties,
// smooth on real hardware — trading the fancier "grows out of the button" flourish for one that
// actually stays smooth. MobileBottomNav.tsx's own matching anchor was removed too.
export default function AppLauncherGrid({
  open,
  onClose,
  contentTiles,
  meItems,
  pinnedTileId,
  onSelectTile,
  onOpenSettings,
  onOpenTrash,
  showArchived,
  onToggleArchive,
  onNavigate,
  realWorkspaces,
  activeWorkspaceId,
  onSelectWorkspace,
}: Props) {
  // Only ever a real actionable tile on Chrome/Edge-family browsers that fired
  // `beforeinstallprompt` (see useInstallPrompt.ts) — iOS has no programmatic install prompt at
  // all, so it gets a longer text hint in AccountSettingsPanel.tsx instead of a dead tile here.
  const { canInstall, promptInstall } = useInstallPrompt();
  const pinnableTiles = [...contentTiles, ...meItems];
  // Accordion, not one row per workspace — a row-per-workspace list was the biggest single
  // contributor to the panel feeling cluttered/tall for anyone in 3+ real workspaces. Collapsed
  // by default, reset on every open/close so it doesn't stay expanded into an unrelated later
  // visit to the menu.
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const activeWorkspace = realWorkspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <AnimatePresence
      onExitComplete={() => setWorkspacePickerOpen(false)}
    >
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
            // Reveals upward from its own bottom edge — the nav bar "island" sitting right below —
            // via an animated clip-path inset, not scale/y: per direct feedback wanting the panel
            // to visually grow out of the nav island (bottom anchored, "lid" pushed up) rather than
            // pop in from a fixed point. clip-path is compositor-accelerated in modern browsers,
            // same reasoning as dropping the old layoutId morph for choppiness — this gets the
            // "grows from below" *feel* back without reintroducing a `layout`-animated (non-
            // compositable) property. Only the top inset moves (100% -> 0%, i.e. the visible sliver
            // starts at zero height right at the bottom edge and grows upward to the panel's full
            // height); the `round` component keeps the mask's own corners matching the panel's
            // rounded-2xl the whole way through, so it never looks like a rectangular window
            // clipping a rounded shape.
            initial={{ clipPath: 'inset(100% 0% 0% 0% round 16px)' }}
            animate={{ clipPath: 'inset(0% 0% 0% 0% round 16px)' }}
            exit={{ clipPath: 'inset(100% 0% 0% 0% round 16px)' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom) + 8px)' }}
            className="absolute inset-x-3 bg-neutral-900 border border-neutral-800/80 rounded-2xl shadow-2xl shadow-black/40 px-2.5 pt-3 pb-2 max-h-[60vh] overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.14, delay: 0.1 }}
            >
              {/* Only shown once there's actually more than one real workspace to switch between
                  — a switcher with nothing to switch to is just clutter. One row (the *active*
                  workspace, tap to expand the rest) instead of one row per workspace — per direct
                  feedback that a full list ate too much of the panel for anyone in several
                  workspaces. Matches MobileSpacesSheet.tsx's own Space-row shape rather than the
                  square icon grid below, since a workspace name is free text of unpredictable
                  length. */}
              {realWorkspaces.length > 1 && activeWorkspace && (
                <>
                  <button
                    onClick={() => setWorkspacePickerOpen((v) => !v)}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                  >
                    <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 text-white text-[11px] font-bold">
                      {activeWorkspace.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{activeWorkspace.name}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${workspacePickerOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {workspacePickerOpen && (
                    <div className="space-y-0.5 pt-0.5 pb-1.5 pl-3">
                      {realWorkspaces
                        .filter((ws) => ws.id !== activeWorkspaceId)
                        .map((ws) => (
                          <button
                            key={ws.id}
                            onClick={() => {
                              hapticTap();
                              onNavigate();
                              onSelectWorkspace(ws.id);
                              onClose();
                            }}
                            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                          >
                            <span className="w-6 h-6 rounded-md bg-neutral-700 flex items-center justify-center shrink-0 text-white text-[10px] font-bold">
                              {ws.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 text-sm text-neutral-300 truncate">{ws.name}</span>
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="h-px bg-neutral-800/70 my-2" />
                </>
              )}

              <div className="grid grid-cols-3 gap-3">
                {pinnableTiles.map((tile) => (
                  <Tile
                    key={tile.id}
                    icon={tile.icon}
                    label={tile.label}
                    badge={tile.badge}
                    selected={tile.id === pinnedTileId}
                    onClick={() => {
                      onNavigate();
                      onSelectTile(tile.id);
                      tile.onClick();
                      onClose();
                    }}
                  />
                ))}
              </div>

              <div className="h-px bg-neutral-800/70 my-3" />

              <div className="grid grid-cols-3 gap-3 pb-2">
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
                <Tile
                  icon={Archive}
                  label={showArchived ? 'Viewing archive' : 'Archive'}
                  selected={showArchived}
                  onClick={() => {
                    onToggleArchive();
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

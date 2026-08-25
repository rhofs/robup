'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Check, Download, Settings, Trash2 } from 'lucide-react';
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
      className="flex flex-col items-center gap-1.5 cursor-pointer"
    >
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
// The panel shares a framer-motion `layoutId` ("mobileMenuMorph") with the 4th nav button's own
// background pill (MobileBottomNav.tsx) — a real container-transform: the small rounded-full pill
// grows into this rounded-2xl panel and back, rather than an unrelated slide/fade. An earlier
// attempt at this was reverted after a real device reported the nav going totally unresponsive —
// that turned out to be an unrelated bug (a different mobile overlay never closing on navigation,
// see PLANNING.md's 2026-08-24 entries), not this animation, so it's back. Content (the tile grid)
// fades and scales in on its own short delay, once the container's own growth is mostly settled.
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ layout: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }, opacity: { duration: 0.12 } }}
            style={{ transformOrigin: 'bottom center', bottom: 'calc(4.75rem + env(safe-area-inset-bottom) + 8px)' }}
            className="absolute inset-x-3 bg-neutral-900 border border-neutral-800/80 rounded-2xl shadow-2xl shadow-black/40 px-3 pt-4 pb-2 max-h-[60vh] overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16, delay: 0.1, ease: 'easeOut' }}
            >
              {/* Only shown once there's actually more than one real workspace to switch between
                  — a switcher with nothing to switch to is just clutter. Rows, not tiles: matches
                  MobileSpacesSheet.tsx's own Space-row shape rather than the square icon grid
                  below, since a workspace name is free text of unpredictable length. */}
              {realWorkspaces.length > 1 && (
                <>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-1 pb-1.5">Workspace</p>
                  <div className="space-y-0.5 pb-3">
                    {realWorkspaces.map((ws) => {
                      const isActive = ws.id === activeWorkspaceId;
                      return (
                        <button
                          key={ws.id}
                          onClick={() => {
                            hapticTap();
                            onNavigate();
                            onSelectWorkspace(ws.id);
                            onClose();
                          }}
                          className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition cursor-pointer ${
                            isActive ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
                          }`}
                        >
                          <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 text-white text-[11px] font-bold">
                            {ws.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{ws.name}</span>
                          {isActive && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="h-px bg-neutral-800/70 mb-3" />
                </>
              )}

              <div className="grid grid-cols-3 gap-4">
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

'use client';

import { useEffect, useState } from 'react';
import { Archive, ChevronDown, Download, LayoutGrid, Plus, Settings, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MenuTile } from './navTypes';
import type { HierarchyWorkspace } from '../../store/useTaskStore';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { hapticTapStrong } from '../../lib/haptics';

type Props = {
  // Only used to reset the workspace-picker accordion back to collapsed once the menu closes —
  // this component's own content stays mounted at all times now (MobileBottomNav.tsx owns the
  // single shared box and reveals/hides it via clip-path, not mount/unmount), so there's no
  // AnimatePresence exit here to hang that reset off any more.
  menuOpen: boolean;
  onClose: () => void;
  // Everything not already pinned to the bottom nav's 3 fixed slots (app/page.tsx's
  // visibleNavTabs minus PRIMARY_NAV_TAB_IDS) plus the "Me" section (My Tasks/Assigned/
  // Connections/Profile) — both selectable as the nav's 4th, dynamic slot.
  contentTiles: MenuTile[];
  meItems: MenuTile[];
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
  // There was previously no way at all to *create* a real workspace from mobile — the desktop
  // sidebar's own switcher dropdown (the only place that form lived) is entirely `hidden md:flex`.
  // Opens app/page.tsx's own mobile "New workspace" modal (same handleCreateWorkspace/state as the
  // desktop form) rather than duplicating the form here, so there's exactly one place that owns it.
  onCreateWorkspace: () => void;
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
        hapticTapStrong();
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

// Mobile-only "more" grid content — rendered *inside* MobileBottomNav.tsx's single shared island
// box (that file owns the outer shape, clip-path reveal, border, background and corner radius; see
// its own file-level comment for why). This component only ever renders the scrollable content
// portion: the workspace switcher accordion and the tile grids. Previously owned its own separate
// floating panel (motion.div, backdrop, AnimatePresence) — merged into the nav pill's own box after
// several rounds of trying to fake "one seamless shape" out of two independently-bordered/rounded
// elements touching (fade → slide → clip-path → matched corners → matched borders — see
// PLANNING.md's whole popup-menu saga). Two elements touching can only ever *approximate* one
// shape; a single shared box can't have a seam by construction, which is the actual fix.
export default function AppLauncherGridContent({
  menuOpen,
  onClose,
  contentTiles,
  meItems,
  onSelectTile,
  onOpenSettings,
  onOpenTrash,
  showArchived,
  onToggleArchive,
  onNavigate,
  realWorkspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
}: Props) {
  // Only ever a real actionable tile on Chrome/Edge-family browsers that fired
  // `beforeinstallprompt` (see useInstallPrompt.ts) — iOS has no programmatic install prompt at
  // all, so it gets a longer text hint in SettingsPanel.tsx's Account tab instead of a dead tile here.
  const { canInstall, promptInstall } = useInstallPrompt();
  const pinnableTiles = [...contentTiles, ...meItems];
  // Accordion, not one row per workspace — a row-per-workspace list was the biggest single
  // contributor to the panel feeling cluttered/tall for anyone in 3+ real workspaces. Collapsed
  // by default, reset whenever the menu closes (this component's own content never unmounts any
  // more, so a plain effect on `menuOpen` replaces the old AnimatePresence onExitComplete reset).
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) setWorkspacePickerOpen(false);
  }, [menuOpen]);
  // Undefined whenever the *personal* workspace is what's active ("My Tasks"), since
  // realWorkspaces deliberately excludes it — which used to collapse this whole switcher down to
  // a bare "+ New workspace" row, hiding every real workspace the user actually has. Reported
  // live: "jeg har lagd en workspace, men den er ikke i lista." The picker below now keys off
  // `realWorkspaces.length` instead, and only the *header label* depends on this.
  const activeWorkspace = realWorkspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <div>
      {/* The header row names the *current* real workspace whenever one is active — tapping it
          expands an accordion listing every other real workspace, with "+ New workspace" always
          the last row in that list so creating another is never more than one tap further than
          switching. Gated on `realWorkspaces.length`, NOT on there being an active real
          workspace: the personal workspace ("My Tasks") is legitimately active a lot of the
          time and is deliberately excluded from realWorkspaces, which used to collapse this
          whole switcher to a bare "+ New workspace" row and hide every real workspace the user
          had. In that case the header shows a neutral "Workspaces" label instead of naming one
          — claiming a real workspace is current while My Tasks is actually on screen would just
          be wrong. Only the true zero-real-workspace case falls back to the plain create row. */}
      {realWorkspaces.length > 0 ? (
        <>
          <button
            onClick={() => {
              hapticTapStrong();
              setWorkspacePickerOpen((v) => !v);
            }}
            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
          >
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-[11px] font-bold ${
                activeWorkspace ? 'bg-blue-600' : 'bg-neutral-700'
              }`}
            >
              {activeWorkspace ? activeWorkspace.name.slice(0, 1).toUpperCase() : <LayoutGrid className="w-3.5 h-3.5" />}
            </span>
            <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{activeWorkspace?.name ?? 'Workspaces'}</span>
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
                      hapticTapStrong();
                      onNavigate();
                      onSelectWorkspace(ws.id);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                  >
                    <span className="w-6 h-6 rounded-md bg-neutral-700 flex items-center justify-center shrink-0 text-app-strong text-[10px] font-bold">
                      {ws.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-300 truncate">{ws.name}</span>
                  </button>
                ))}
              <button
                onClick={() => {
                  hapticTapStrong();
                  onNavigate();
                  onClose();
                  onCreateWorkspace();
                }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60 text-blue-400"
              >
                <span className="w-6 h-6 rounded-md bg-neutral-800/60 flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </span>
                <span className="text-sm font-medium">New workspace</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <button
          onClick={() => {
            hapticTapStrong();
            onNavigate();
            onClose();
            onCreateWorkspace();
          }}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60 text-blue-400"
        >
          <span className="w-7 h-7 rounded-lg bg-neutral-800/60 flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-sm font-medium">New workspace</span>
        </button>
      )}
      <div className="h-px bg-neutral-800/70 my-2" />

      {/* No `selected` ring on the pinned tile here any more — whichever tile is pinned
          already gets its own highlighted state down in the nav pill's 4th slot
          (MobileBottomNav.tsx), and showing it selected in *both* places at once read as
          two conflicting answers to "what's currently selected," per a redesign the user
          pointed at ("My Tasks valgt to steder med forskjellig utseende... nå er det bare
          My Tasks nederst som er markert som aktiv fane"). This grid is just the picker —
          only the nav slot itself represents "current." */}
      <div className="grid grid-cols-3 gap-4">
        {pinnableTiles.map((tile) => (
          <Tile
            key={tile.id}
            icon={tile.icon}
            label={tile.label}
            badge={tile.badge}
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
    </div>
  );
}

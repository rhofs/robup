'use client';

import { useState, useRef } from 'react';
import { ArrowRight, ChevronRight, ChevronDown, Folder as FolderIcon, List as ListIcon } from 'lucide-react';
import type { HierarchySpace } from '../../store/useTaskStore';
import { FOLDER_ICON_MAP } from '../FolderTree';
import { hapticTap } from '../../lib/haptics';

// The Spaces list shared by Home and Office.
//
// It exists because the first version of both screens was flat: a Space was a row, and tapping it
// left the screen entirely. That is a real loss against the tree it replaced — "jeg får ikke åpne
// opp sånn som jeg fikk før" — because reaching one List meant a full page change, and coming back
// put you at the top with everything shut again.
//
// So a Space row now does two different things depending on where it is tapped: the chevron opens
// it in place, the name goes into it. Expanding in place is the common case (find a List, open it)
// and it never leaves the screen, so Back keeps its meaning. This is not the old tree — it is two
// levels deep and has no drag, rename or reordering — but it is the part of the tree that was
// actually being used for navigation.
//
// Long-press opens the same Space menu as a right-click on desktop, which is how a Space gets
// renamed or deleted. Without it, a Space created here could not be removed from here — reported
// after creating a test Space and finding no way to get rid of it.

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

type Props = {
  spaces: HierarchySpace[];
  emptyText: string;
  onSelectSpace: (spaceId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSpaceMenu: (x: number, y: number, space: HierarchySpace) => void;
};

export default function ContextSpaceList({ spaces, emptyText, onSelectSpace, onSelectList, onSpaceMenu }: Props) {
  const [openSpaceIds, setOpenSpaceIds] = useState<Set<string>>(new Set());
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(new Set());

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    hapticTap();
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // One timer for the whole list: only one finger is ever held at a time, and keeping it here
  // rather than per row means a row that unmounts mid-hold cannot leave a timer running.
  const timerRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);
  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const holdHandlers = (space: HierarchySpace) => ({
    onPointerDown: (e: React.PointerEvent) => {
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      const { clientX, clientY } = e;
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        hapticTap();
        onSpaceMenu(clientX, clientY, space);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (timerRef.current === null) return;
      if (
        Math.abs(e.clientX - startRef.current.x) > LONG_PRESS_MOVE_TOLERANCE ||
        Math.abs(e.clientY - startRef.current.y) > LONG_PRESS_MOVE_TOLERANCE
      ) {
        clearTimer();
      }
    },
    onPointerUp: clearTimer,
    onPointerCancel: clearTimer,
    onContextMenu: (e: React.MouseEvent) => {
      // Suppresses the OS text-selection/context menu that a long press would otherwise raise on
      // top of ours.
      e.preventDefault();
    },
  });

  return (
    <>
      {spaces.length === 0 && <p className="px-2 py-3 text-xs text-neutral-500">{emptyText}</p>}
      {spaces.map((space) => {
        const Icon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
        const open = openSpaceIds.has(space.id);
        return (
          <div key={space.id}>
            {/* Tapping the row OPENS THE SPACE IN PLACE. It used to navigate, with a separate
                chevron for expanding, and that was reported twice as the same bug — "det ikke åpner
                seg, det bare kommer inn i en ny". A row that looks like a folder should behave like
                one; going into the Space is the rarer thing, so it moved to its own entry inside. */}
            <div className="w-full flex items-center gap-1 rounded-lg transition hover:bg-neutral-800/60">
              <button
                onClick={() => {
                  // A long press that already opened the menu still produces a click on release —
                  // swallow exactly that one rather than also acting behind the menu.
                  if (firedRef.current) {
                    firedRef.current = false;
                    return;
                  }
                  toggle(setOpenSpaceIds, space.id);
                }}
                {...holdHandlers(space)}
                className="min-w-0 flex-1 flex items-center gap-3 px-2 py-2.5 rounded-lg text-left cursor-pointer"
              >
                {/* text-white, not text-app-strong — the tile is filled with the Space's own colour,
                    and that token follows the neutral scale into near-black in light mode. */}
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: space.color || '#6366f1' }}
                >
                  {Icon ? (
                    <Icon className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-white text-xs font-bold">{space.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{space.name}</span>
                <span className="shrink-0 text-neutral-600">
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              </button>
            </div>

            {open && (
              <div className="ml-5 pl-3 border-l border-neutral-800 space-y-0.5">
                {/* The way into the Space itself — its board, overview and everything the expanded
                    view above does not show. Inside rather than on the row, because opening a
                    Space is the rarer intent: most taps here are looking for a List. */}
                <button
                  onClick={() => onSelectSpace(space.id)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                >
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                  <span className="min-w-0 flex-1 text-[13px] text-blue-400 truncate">Open {space.name}</span>
                </button>
                {space.folders.length === 0 && space.lists.length === 0 && (
                  <p className="px-2 py-2 text-[11px] text-neutral-600">Empty space.</p>
                )}
                {/* Top-level folders only, and one level of them. Lists carry folderId and folders
                    carry parentId, so the real structure nests arbitrarily deep — but this is a
                    way to reach a List, not a replacement for the tree, and a phone-width list that
                    indents four times over stops being one. Anything deeper is still reachable by
                    opening the Space itself. */}
                {space.folders.filter((f) => f.parentId === null).map((folder) => {
                  const folderOpen = openFolderIds.has(folder.id);
                  return (
                    <div key={folder.id}>
                      <button
                        onClick={() => toggle(setOpenFolderIds, folder.id)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                      >
                        {folderOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                        )}
                        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                        <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">{folder.name}</span>
                      </button>
                      {folderOpen && (
                        <div className="ml-4 pl-3 border-l border-neutral-800 space-y-0.5">
                          {space.lists.filter((l) => l.folderId === folder.id && !l.archived).length === 0 && (
                            <p className="px-2 py-1.5 text-[11px] text-neutral-600">No lists.</p>
                          )}
                          {space.lists.filter((l) => l.folderId === folder.id && !l.archived).map((list) => (
                            <button
                              key={list.id}
                              onClick={() => onSelectList(space.id, list.id)}
                              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                            >
                              <ListIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                              <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">{list.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {space.lists.filter((l) => l.folderId === null && !l.archived).map((list) => (
                  <button
                    key={list.id}
                    onClick={() => onSelectList(space.id, list.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                  >
                    <ListIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                    <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">{list.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

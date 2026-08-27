'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Globe, Search, X, Plus, Folder as FolderIconLucide, List as ListIconLucide, FileText } from 'lucide-react';
import { useTaskStore, type HierarchySpace } from '../../store/useTaskStore';
import { FOLDER_ICON_MAP } from '../FolderTree';
import { getChildFolders, getListsIn, getBoardDocsIn } from '../../lib/folderTree';
import { getChildDocFolders, getSpaceDocsIn } from '../../lib/docFolderTree';

type Props = {
  open: boolean;
  onClose: () => void;
  // Header title — "Spaces" for the real tree, "Personal Spaces" for My Tasks's own instance of
  // this same component (see app/page.tsx). Kept separate from workspaceName below since that's
  // used for the "All Tasks – {workspaceName}" row's own label, a different piece of text.
  title: string;
  // Opens the shared command palette (Ctrl+K search) — same control, same visual treatment, as the
  // global mobile header's own search pill (app/page.tsx), so the search affordance sits in a
  // consistent spot regardless of which mobile screen is showing.
  onOpenSearch: () => void;
  workspaceName: string;
  // Needed for "+ New Space" (createSpace itself, called directly via useTaskStore below like
  // FolderTree.tsx's own create-Folder/List already does, needs a workspaceId to attach to) — the
  // desktop sidebar's own "+" buttons live in a `hidden md:flex` <aside>, with nothing standing in
  // for them anywhere reachable on mobile before this.
  workspaceId: string | null;
  spaces: HierarchySpace[];
  activeSpaceId: string;
  // Used purely to auto-expand the tree to whatever's actually selected right now (the Space, and
  // every Folder ancestor above the active List if there is one) — see the effect below. Without
  // this, the tree only ever expanded from manual taps, so navigating away and back (Planner, My
  // Tasks, ...) and reopening this sheet showed everything collapsed even when activeSpaceId still
  // correctly pointed at exactly where you were, reported live as "husker ikke hvor Spaces var."
  activeListIds: Set<string>;
  onSelectSpace: (spaceId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSelectDoc: (spaceId: string, docId: string) => void;
  // Opens a Doc from the *standalone* Docs tab tree (folderId/DocFolder axis — see
  // lib/docFolderTree.ts), not the Tasks-tab board-folder axis onSelectDoc above already covers.
  // Kept as its own callback (with the doc's own folderId, unlike onSelectDoc) since the caller
  // (app/page.tsx) needs the real folderId to correctly seed Docs-tab breadcrumb navigation —
  // board-folder docs have no meaningful folderId to seed it with, this axis does.
  onSelectSpaceDoc: (spaceId: string, docId: string, folderId: string | null) => void;
};

// Mobile Spaces landing — reachable from the bottom nav's "Spaces" tab (see MobileBottomNav.tsx)
// and the board view's own header button. A full-height page (opaque background, no dimmed
// backdrop, no partial-height sheet) rather than a popup — tapping "Spaces" should feel like
// arriving at a real destination you can navigate onward from, not opening a dialog on top of
// wherever you were. Stops just above the bottom nav (z-index below MobileBottomNav's, which is
// deliberately bumped above every *other* mobile overlay only for this one) so the nav pill stays
// visible and tappable the whole time — you can jump straight to Planner/Chat/Menu without first
// closing this.
//
// A real inline-expanding tree now (Space > Folder > List/Doc, recursively), not a flat list that
// hands off to a separate SpaceHome card-grid screen — an earlier version did that, and it read as
// exactly the "this looks like it should expand right here, but instead takes me somewhere else"
// complaint that came back from real usage. Tapping a Space/Folder row toggles it open in place
// (matching what its own chevron visually promises); only Lists and Docs (the actual leaf
// destinations — a Folder has never been independently "openable" anywhere else in this app
// either, see SpaceHome.tsx's own folder-is-purely-organizational precedent) close the sheet and
// navigate. Docs alongside Lists at each level mirrors FolderTree.tsx's own desktop behavior
// exactly (a Folder in the Tasks-tab tree can hold both — lib/folderTree.ts's getBoardDocsIn is a
// second, independent axis from the standalone Docs tab's own folder tree).
export default function MobileSpacesSheet({
  open,
  onClose,
  title,
  onOpenSearch,
  workspaceName,
  workspaceId,
  spaces,
  activeSpaceId,
  activeListIds,
  onSelectSpace,
  onSelectList,
  onSelectDoc,
  onSelectSpaceDoc,
}: Props) {
  // Called directly via the store, same as FolderTree.tsx's own create-Folder/List/Space
  // buttons already do — no need to thread these through app/page.tsx as props.
  const { createSpace, createFolder, createList } = useTaskStore();
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceDraft, setNewSpaceDraft] = useState('');
  const commitNewSpace = () => {
    const trimmed = newSpaceDraft.trim();
    if (trimmed && workspaceId) createSpace(workspaceId, trimmed);
    setNewSpaceDraft('');
    setCreatingSpace(false);
  };
  const [expandedSpaceIds, setExpandedSpaceIds] = useState<Set<string>>(new Set());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  // Whether each Space's own "Docs" pseudo-row (the standalone Docs-tab tree, a completely
  // separate axis from the Task-Folder tree above it) is expanded — and, once it is, which of its
  // own DocFolders are. Two more sets rather than reusing expandedFolderIds/expandedSpaceIds: a
  // Task Folder and a DocFolder can legitimately share an id-lookalike coincidence is impossible
  // (real uuids), but conceptually they're different trees and deserve independent expand state.
  const [expandedDocsSpaceIds, setExpandedDocsSpaceIds] = useState<Set<string>>(new Set());
  const [expandedDocFolderIds, setExpandedDocFolderIds] = useState<Set<string>>(new Set());

  // Auto-expands the tree to wherever activeSpaceId/activeListIds actually point right now,
  // instead of relying purely on manual taps — but only when that target has genuinely *changed*
  // since the last time this ran, tracked via lastAutoExpandTargetRef rather than reacting to
  // `open` at all. Two failed attempts before this shape: (1) merging into the expand-state on
  // every open accumulated every Space ever visited forever, since this component is deliberately
  // never unmounted (see the file-level comment above) — the first Space it ever auto-expanded
  // never left the set again, reported live as "Test Space er alltid åpen, uansett hvor jeg er."
  // (2) *replacing* the expand-state on every closed->open transition fixed that, but then fought
  // the user's own manual taps: collapsing the current Space, navigating away, and back (still the
  // *same* target) re-expanded it anyway, reported live as toggling a Space "look[ing] like it did
  // nothing" once you left and returned. Comparing against the last *target* solves both — arriving
  // at a genuinely different Space/List replaces the expand-state to show exactly that; returning
  // to the same one you already left expanded (or collapsed) leaves whatever you last did alone.
  const lastAutoExpandTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSpaceId) return;
    const space = spaces.find((s) => s.id === activeSpaceId);
    if (!space) return;
    const activeList = space.lists.find((l) => activeListIds.has(l.id));
    const targetKey = `${space.id}:${activeList?.id ?? ''}`;
    if (lastAutoExpandTargetRef.current === targetKey) return;
    lastAutoExpandTargetRef.current = targetKey;
    setExpandedSpaceIds(new Set([space.id]));
    const ancestorIds = new Set<string>();
    if (activeList?.folderId) {
      let folderId: string | null = activeList.folderId;
      while (folderId) {
        ancestorIds.add(folderId);
        const folder = space.folders.find((f) => f.id === folderId);
        folderId = folder?.parentId ?? null;
      }
    }
    setExpandedFolderIds(ancestorIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId, activeListIds, spaces]);

  const toggleSpace = (spaceId: string) =>
    setExpandedSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });

  const toggleFolder = (folderId: string) =>
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });

  const toggleDocsSpace = (spaceId: string) =>
    setExpandedDocsSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });

  const toggleDocFolder = (folderId: string) =>
    setExpandedDocFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });

  // No entrance/exit animation at all now — a plain opacity fade (there used to be a y-slide too)
  // still read as a "blink" next to Planner/Chat's own per-view header, which has zero animation
  // since it's just always part of the page rather than a newly-mounted overlay. Appearing/
  // disappearing instantly, same as those, is what actually matches "feels the same as the other
  // tabs" rather than a fade that's merely shorter/simpler than the last one.
  return (
    <>
      {open && (
        <div
          className="fixed inset-x-0 top-0 z-30 md:hidden bg-neutral-950 flex flex-col"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
        >
          {/* h-14, matching the global mobile header's own fixed height exactly (app/page.tsx) —
              this row used to size itself from py-3 + the title text's line-height, which came out
              a few px shorter, pushing the search row (and everything in it) up slightly compared
              to Planner/Chat, where that taller h-14 global header sits above their own search row
              instead of this shorter title row. */}
          <div className="h-14 flex items-center justify-between px-4 shrink-0">
            <span className="text-lg font-semibold text-white">{title}</span>
            <div className="flex items-center gap-1">
              {workspaceId && (
                <button
                  onClick={() => setCreatingSpace((o) => !o)}
                  title="New space"
                  className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1"
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
          {/* Search moved to its own row below the title — matches the same "search sits in the
              row right under the title" spot every other mobile screen now uses (app/page.tsx's
              per-view header), rather than sharing the title's own row. No border, and no bg of
              its own either — reads as one continuous block with the title row above, same as
              that other header.
              Structurally identical to that other row now (px-3 row padding, an empty w-7
              reserved slot, gap-2, then the search button with flex-1 + mx-1) rather than a
              differently-shaped "w-full against px-4 padding" version — two different sizing
              mechanisms that were each individually reasonable still didn't reliably land on the
              exact same pixel position, since app/page.tsx's own row shifts its search bar right
              by the reserved back-button slot's width, which this row wasn't accounting for at
              all. Matching the structure exactly, not just eyeballing similar padding numbers,
              guarantees the same position regardless of which spacing values change later. */}
          <div className="relative px-3 pt-2 pb-3 shrink-0 flex items-center gap-2">
            <div className="relative z-10 w-7 h-7 shrink-0" aria-hidden />
            {/* True absolute centering on the row itself, same fix and same reasoning as
                app/page.tsx's own search row — a flex-1-based wrapper still centers only *within
                whatever space is left* after the reserved slot (and any gap reserved for trailing
                content even when nothing renders there), which drifted this row's own search bar
                out of sync with app/page.tsx's per-view header despite both trying to match the
                same position. Being positioned off the row's own bounding box makes it identical
                on literally every screen, this one included, full stop. */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(calc(100%-88px),420px)]">
              <button
                onClick={onOpenSearch}
                className="w-full flex items-center gap-1.5 bg-neutral-900/60 border border-neutral-800/80 rounded-full px-3 py-2.5 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] truncate">Search...</span>
              </button>
            </div>
          </div>
          {creatingSpace && workspaceId && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800/60 shrink-0 bg-neutral-900/40">
              <input
                autoFocus
                value={newSpaceDraft}
                onChange={(e) => setNewSpaceDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewSpace();
                  if (e.key === 'Escape') {
                    setNewSpaceDraft('');
                    setCreatingSpace(false);
                  }
                }}
                placeholder="Space name..."
                className="flex-1 bg-neutral-950 border border-blue-500 rounded px-3 py-1.5 text-sm text-white focus:outline-none"
              />
              <button
                onClick={commitNewSpace}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-medium cursor-pointer shrink-0"
              >
                Add
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            <button
              onClick={() => {
                onSelectSpace('everything');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer ${
                activeSpaceId === 'everything' ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
              }`}
            >
              <span className="w-8 h-8 rounded-lg bg-neutral-700 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-neutral-200 truncate">
                  All Tasks <span className="text-neutral-500 font-normal">– {workspaceName}</span>
                </span>
              </span>
            </button>

            {spaces.map((space) => {
              const Icon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
              const isExpanded = expandedSpaceIds.has(space.id);
              return (
                <div key={space.id}>
                  <button
                    onClick={() => toggleSpace(space.id)}
                    className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer ${
                      activeSpaceId === space.id ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: space.color || '#6366f1' }}>
                      {Icon ? (
                        <Icon className="w-4 h-4 text-white" />
                      ) : (
                        <span className="text-white text-xs font-bold">{space.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{space.name}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-neutral-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <>
                      <SpaceContents
                        space={space}
                        folderId={null}
                        depth={1}
                        expandedFolderIds={expandedFolderIds}
                        onToggleFolder={toggleFolder}
                        onSelectList={(listId) => {
                          onSelectList(space.id, listId);
                          onClose();
                        }}
                        onSelectDoc={(docId) => {
                          onSelectDoc(space.id, docId);
                          onClose();
                        }}
                        onCreateFolder={(name, parentId) => createFolder(space.id, name, parentId)}
                        onCreateList={(name, folderId) => createList(space.id, name, folderId)}
                      />
                      {/* Docs — a completely separate tree from the Task Folders above (the
                          standalone Docs-tab's own DocFolder/Doc axis, lib/docFolderTree.ts), not
                          nested under any Task Folder. Own top-level toggle row so it reads as its
                          own section rather than one more Task Folder. */}
                      <button
                        onClick={() => toggleDocsSpace(space.id)}
                        className="w-full flex items-center gap-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                        style={{ paddingLeft: 28, paddingRight: 8 }}
                      >
                        <FileText className="w-4 h-4 shrink-0 text-neutral-400" />
                        <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">Docs</span>
                        {expandedDocsSpaceIds.has(space.id) ? (
                          <ChevronDown className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                        )}
                      </button>
                      {expandedDocsSpaceIds.has(space.id) && (
                        <DocFolderContents
                          space={space}
                          folderId={null}
                          depth={2}
                          expandedDocFolderIds={expandedDocFolderIds}
                          onToggleDocFolder={toggleDocFolder}
                          onSelectDoc={(docId, docFolderId) => {
                            onSelectSpaceDoc(space.id, docId, docFolderId);
                            onClose();
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// Recursive — renders one Folder level's own child Folders (each independently expandable) plus
// its Lists/Docs (leaf rows), sorted together by `order` same as the desktop sidebar interleaves
// them.
function SpaceContents({
  space,
  folderId,
  depth,
  expandedFolderIds,
  onToggleFolder,
  onSelectList,
  onSelectDoc,
  onCreateFolder,
  onCreateList,
}: {
  space: HierarchySpace;
  folderId: string | null;
  depth: number;
  expandedFolderIds: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onSelectList: (listId: string) => void;
  onSelectDoc: (docId: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onCreateList: (name: string, folderId: string | null) => void;
}) {
  const childFolders = getChildFolders(space, folderId);
  const leaves = [
    ...getListsIn(space, folderId).map((l) => ({ kind: 'list' as const, id: l.id, name: l.name, color: l.color, icon: l.icon, order: l.order })),
    ...getBoardDocsIn(space, folderId).map((d) => ({
      kind: 'doc' as const,
      id: d.id,
      name: d.title || 'Untitled',
      color: d.textColor || d.color,
      icon: null as string | null,
      order: d.order,
    })),
  ].sort((a, b) => a.order - b.order);

  return (
    <>
      {childFolders.map((folder) => {
        const CustomIcon = folder.icon ? FOLDER_ICON_MAP[folder.icon] : null;
        const FIcon = CustomIcon || FolderIconLucide;
        const isExpanded = expandedFolderIds.has(folder.id);
        return (
          <div key={folder.id}>
            <button
              onClick={() => onToggleFolder(folder.id)}
              className="w-full flex items-center gap-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
              style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}
            >
              <FIcon className="w-4 h-4 shrink-0" style={{ color: folder.color || undefined }} />
              <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">{folder.name}</span>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
              )}
            </button>
            {isExpanded && (
              <SpaceContents
                space={space}
                folderId={folder.id}
                depth={depth + 1}
                expandedFolderIds={expandedFolderIds}
                onToggleFolder={onToggleFolder}
                onSelectList={onSelectList}
                onSelectDoc={onSelectDoc}
                onCreateFolder={onCreateFolder}
                onCreateList={onCreateList}
              />
            )}
          </div>
        );
      })}
      {leaves.map((leaf) => {
        const CustomIcon = leaf.icon ? FOLDER_ICON_MAP[leaf.icon] : null;
        const LIcon = CustomIcon || (leaf.kind === 'doc' ? FileText : ListIconLucide);
        return (
          <button
            key={leaf.id}
            onClick={() => (leaf.kind === 'list' ? onSelectList(leaf.id) : onSelectDoc(leaf.id))}
            className="w-full flex items-center gap-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
            style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}
          >
            <LIcon className="w-3.5 h-3.5 shrink-0" style={{ color: leaf.color || undefined }} />
            <span className="min-w-0 flex-1 text-[13px] text-neutral-400 truncate">{leaf.name}</span>
          </button>
        );
      })}
      <NewFolderOrListRow
        depth={depth}
        onCreateFolder={(name) => onCreateFolder(name, folderId)}
        onCreateList={(name) => onCreateList(name, folderId)}
      />
    </>
  );
}

// Compact "+ Folder" / "+ List" quick-add pair at the end of each SpaceContents level — the
// desktop sidebar's own equivalent inline-add buttons live in a hidden-below-md <aside>, with
// nothing standing in for them on mobile before this.
function NewFolderOrListRow({
  depth,
  onCreateFolder,
  onCreateList,
}: {
  depth: number;
  onCreateFolder: (name: string) => void;
  onCreateList: (name: string) => void;
}) {
  const [mode, setMode] = useState<'folder' | 'list' | null>(null);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) (mode === 'folder' ? onCreateFolder : onCreateList)(trimmed);
    setDraft('');
    setMode(null);
  };

  if (mode) {
    return (
      <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft('');
              setMode(null);
            }
          }}
          placeholder={mode === 'folder' ? 'Folder name...' : 'List name...'}
          className="flex-1 min-w-0 bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[13px] text-white focus:outline-none"
        />
        <button onClick={commit} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded font-medium cursor-pointer shrink-0">
          Add
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1.5" style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}>
      <button
        onClick={() => setMode('folder')}
        className="flex items-center gap-1 text-[12px] text-neutral-500 hover:text-blue-400 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Folder
      </button>
      <button
        onClick={() => setMode('list')}
        className="flex items-center gap-1 text-[12px] text-neutral-500 hover:text-blue-400 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> List
      </button>
    </div>
  );
}

// Recursive — the standalone Docs-tab's own DocFolder/Doc tree (lib/docFolderTree.ts), a genuinely
// separate axis from SpaceContents' Task-Folder tree above. Same expand-in-place shape.
function DocFolderContents({
  space,
  folderId,
  depth,
  expandedDocFolderIds,
  onToggleDocFolder,
  onSelectDoc,
}: {
  space: HierarchySpace;
  folderId: string | null;
  depth: number;
  expandedDocFolderIds: Set<string>;
  onToggleDocFolder: (folderId: string) => void;
  onSelectDoc: (docId: string, docFolderId: string | null) => void;
}) {
  const childDocFolders = getChildDocFolders(space, folderId);
  const docs = getSpaceDocsIn(space, folderId);

  if (childDocFolders.length === 0 && docs.length === 0) {
    return <p className="text-[11px] text-neutral-600 italic px-2 py-1.5" style={{ paddingLeft: 12 + depth * 20 }}>Empty</p>;
  }

  return (
    <>
      {childDocFolders.map((folder) => {
        const isExpanded = expandedDocFolderIds.has(folder.id);
        return (
          <div key={folder.id}>
            <button
              onClick={() => onToggleDocFolder(folder.id)}
              className="w-full flex items-center gap-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
              style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}
            >
              <FolderIconLucide className="w-4 h-4 shrink-0" style={{ color: folder.color || undefined }} />
              <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">{folder.name}</span>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
              )}
            </button>
            {isExpanded && (
              <DocFolderContents
                space={space}
                folderId={folder.id}
                depth={depth + 1}
                expandedDocFolderIds={expandedDocFolderIds}
                onToggleDocFolder={onToggleDocFolder}
                onSelectDoc={onSelectDoc}
              />
            )}
          </div>
        );
      })}
      {docs.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onSelectDoc(doc.id, folderId)}
          className="w-full flex items-center gap-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
          style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: doc.textColor || doc.color || undefined }} />
          <span className="min-w-0 flex-1 text-[13px] text-neutral-400 truncate">{doc.title || 'Untitled'}</span>
        </button>
      ))}
    </>
  );
}

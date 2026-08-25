'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ChevronDown, Globe, X, Folder as FolderIconLucide, List as ListIconLucide, FileText } from 'lucide-react';
import type { HierarchySpace } from '../../store/useTaskStore';
import { FOLDER_ICON_MAP } from '../FolderTree';
import { getChildFolders, getListsIn, getBoardDocsIn } from '../../lib/folderTree';
import { getChildDocFolders, getSpaceDocsIn } from '../../lib/docFolderTree';

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  spaces: HierarchySpace[];
  activeSpaceId: string;
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
  workspaceName,
  spaces,
  activeSpaceId,
  onSelectSpace,
  onSelectList,
  onSelectDoc,
  onSelectSpaceDoc,
}: Props) {
  const [expandedSpaceIds, setExpandedSpaceIds] = useState<Set<string>>(new Set());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  // Whether each Space's own "Docs" pseudo-row (the standalone Docs-tab tree, a completely
  // separate axis from the Task-Folder tree above it) is expanded — and, once it is, which of its
  // own DocFolders are. Two more sets rather than reusing expandedFolderIds/expandedSpaceIds: a
  // Task Folder and a DocFolder can legitimately share an id-lookalike coincidence is impossible
  // (real uuids), but conceptually they're different trees and deserve independent expand state.
  const [expandedDocsSpaceIds, setExpandedDocsSpaceIds] = useState<Set<string>>(new Set());
  const [expandedDocFolderIds, setExpandedDocFolderIds] = useState<Set<string>>(new Set());

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-x-0 top-0 z-30 md:hidden bg-neutral-950 flex flex-col"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/60 shrink-0">
            <span className="text-base font-semibold text-white">Spaces</span>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
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
        </motion.div>
      )}
    </AnimatePresence>
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
}: {
  space: HierarchySpace;
  folderId: string | null;
  depth: number;
  expandedFolderIds: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onSelectList: (listId: string) => void;
  onSelectDoc: (docId: string) => void;
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

  if (childFolders.length === 0 && leaves.length === 0) {
    return <p className="text-[11px] text-neutral-600 italic px-2 py-1.5" style={{ paddingLeft: 12 + depth * 20 }}>Empty</p>;
  }

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
    </>
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

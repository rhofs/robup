'use client';

import { useMemo } from 'react';
import { ChevronRight, Folder as FolderIconLucide, FileText, Trash2 } from 'lucide-react';
import { HierarchySpace, HierarchyDocFolder, TaskDoc } from '../store/useTaskStore';
import { getChildDocFolders, getSpaceDocsIn, getUnfiledBoardDocs } from '../lib/docFolderTree';

// Docs tab's folder-browse grid — mirrors SpaceHome.tsx's card-grid pattern, but controlled from
// the store's activeDocFolderId (not local component state) so browsing round-trips through the
// back/forward URL sync the same way Space/List nav does.
type DocsBrowserProps = {
  space: HierarchySpace;
  folderId: string | null;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenDoc: (docId: string) => void;
  onDeleteFolderRequest: (folder: HierarchyDocFolder) => void;
  onDeleteDocRequest: (doc: TaskDoc) => void;
};

export default function DocsBrowser({ space, folderId, onNavigateFolder, onOpenDoc, onDeleteFolderRequest, onDeleteDocRequest }: DocsBrowserProps) {
  const breadcrumb = useMemo(() => {
    const trail: { id: string | null; name: string }[] = [{ id: null, name: space.name }];
    let cursor = folderId;
    const chain: { id: string; name: string }[] = [];
    while (cursor) {
      const folder = space.docFolders.find((f) => f.id === cursor);
      if (!folder) break;
      chain.unshift({ id: folder.id, name: folder.name });
      cursor = folder.parentId;
    }
    return [...trail, ...chain];
  }, [space, folderId]);

  const childFolders = getChildDocFolders(space, folderId);
  const childDocs = getSpaceDocsIn(space, folderId);
  // Docs created from inside this Space's Task-Folder tree instead of this one — they have no
  // matching folder location here, so per explicit direction they're flattened at this tab's own
  // root level rather than mixed into a specific folder. folderId === null check (not just relying
  // on getUnfiledBoardDocs's own scope) is what keeps them from also appearing while browsing into
  // a DocFolder, where they'd have no real "this is where it lives" meaning.
  const unfiledBoardDocs = folderId === null ? getUnfiledBoardDocs(space) : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-[11px] text-neutral-500">
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            <button
              onClick={() => onNavigateFolder(crumb.id)}
              className={`cursor-pointer hover:text-neutral-300 ${i === breadcrumb.length - 1 ? 'text-neutral-300 font-medium' : ''}`}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {childFolders.length === 0 && childDocs.length === 0 && unfiledBoardDocs.length === 0 ? (
        <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
          Nothing in here yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {childFolders.map((folder) => {
            const subFolderCount = getChildDocFolders(space, folder.id).length;
            const subDocCount = getSpaceDocsIn(space, folder.id).length;
            return (
              <div
                key={folder.id}
                onClick={() => onNavigateFolder(folder.id)}
                className="group text-left p-3 rounded bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer relative"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <FolderIconLucide className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs text-neutral-200 font-medium truncate">{folder.name}</span>
                </div>
                <div className="text-[10px] text-neutral-500 font-mono">
                  {subFolderCount > 0 ? `${subFolderCount} folders, ` : ''}
                  {subDocCount} docs
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolderRequest(folder);
                  }}
                  title="Delete"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {childDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onOpenDoc(doc.id)}
              className="group text-left p-3 rounded bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer relative"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs text-neutral-200 font-medium truncate">{doc.title || 'Untitled'}</span>
              </div>
              <div className="text-[10px] text-neutral-500 truncate">{doc.content ? doc.content.slice(0, 60) : 'Empty document'}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDocRequest(doc);
                }}
                title="Delete"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {unfiledBoardDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onOpenDoc(doc.id)}
              title="Lives inside a Task folder in this Space — organize it from there, not here"
              className="group text-left p-3 rounded bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer relative"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs text-neutral-200 font-medium truncate">{doc.title || 'Untitled'}</span>
                <span className="text-[9px] text-neutral-500 border border-neutral-700 rounded px-1 shrink-0">From Spaces</span>
              </div>
              <div className="text-[10px] text-neutral-500 truncate">{doc.content ? doc.content.slice(0, 60) : 'Empty document'}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDocRequest(doc);
                }}
                title="Delete"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import { HierarchySpace, TaskDoc } from '../store/useTaskStore';
import { getAllWorkspaceDocs } from '../lib/docFolderTree';

// Docs tab content — a flat, workspace-wide list of every Doc across every Space, not a per-Space
// folder browse. Used to require picking a Space first (this component took a single `space` prop
// and rendered its DocFolder tree, mirroring SpaceHome.tsx's card-grid); per direct feedback
// ("every single space has its own docs folder... I want that removed... the docs tab should list
// all docs in the workspace"), a Doc still genuinely belongs to whichever Space it's filed under —
// that association is untouched — this just aggregates across all of them instead of requiring one
// to be picked first. See lib/docFolderTree.ts's getAllWorkspaceDocs for the actual flattening
// logic (same "loop every space's spaceDocs" shape CommandPalette.tsx's own doc search already
// used). Folder-tree navigation is gone entirely from this view — with everything flattened, a
// folder hierarchy has nothing left to organize; finding a specific doc is now what the (now
// docs-scoped, see CommandPalette.tsx's scopeKind) top search bar is for.
type DocsBrowserProps = {
  spaces: HierarchySpace[];
  onOpenDoc: (spaceId: string, folderId: string | null, docId: string) => void;
  onDeleteDocRequest: (doc: TaskDoc) => void;
};

export default function DocsBrowser({ spaces, onOpenDoc, onDeleteDocRequest }: DocsBrowserProps) {
  const entries = useMemo(() => getAllWorkspaceDocs(spaces), [spaces]);

  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        No docs in this workspace yet. Create one from inside a Space to see it here.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {entries.map(({ doc, space }) => (
        <div
          key={doc.id}
          onClick={() => onOpenDoc(space.id, doc.folderId, doc.id)}
          className="group text-left p-3 rounded bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer relative"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs text-neutral-200 font-medium truncate">{doc.title || 'Untitled'}</span>
          </div>
          <div className="text-[10px] text-neutral-500 truncate mb-1">{doc.content ? doc.content.slice(0, 60) : 'Empty document'}</div>
          <span className="text-[9px] text-neutral-500 border border-neutral-700 rounded px-1 shrink-0">{space.name}</span>
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
  );
}

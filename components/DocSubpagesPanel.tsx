'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Plus } from 'lucide-react';
import { useTaskStore, type AppUser, type HierarchySpace, type TaskDoc } from '../store/useTaskStore';
import { getChildDocs } from '../lib/docFolderTree';
import { activeGlowStyle } from '../lib/activeGlowStyle';

// A dedicated column between the main app sidebar and the open Doc's own content — not stacked
// above the document (that was the first cut; moved here per explicit user feedback). Shows the
// FULL page tree of the "book" this doc belongs to (rooted at its top-most ancestor), not just
// the open doc's own direct children — so the whole family of pages ("Main 1" > "Sub 1"/"Sub 2",
// "Main 2", ...) stays visible and navigable no matter which page is currently open, matching the
// ClickUp reference screenshots. Only rendered by the caller once the book actually has ≥1 page —
// an empty lone doc shows an "Add page" button in the doc header instead (see app/page.tsx).
type DocSubpagesPanelProps = {
  space: HierarchySpace;
  rootDoc: TaskDoc;
  activeDocId: string;
  members: AppUser[];
  onOpenDoc: (docId: string) => void;
  onAddPage: (parentId: string) => void;
  onDocContextMenu: (e: React.MouseEvent, doc: TaskDoc) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
};

export default function DocSubpagesPanel({
  space,
  rootDoc,
  activeDocId,
  members,
  onOpenDoc,
  onAddPage,
  onDocContextMenu,
  renameDocId,
  onRenameDocHandled,
}: DocSubpagesPanelProps) {
  const membersById = new Map(members.map((m) => [m.id, m]));

  return (
    <aside className="w-56 bg-neutral-900/60 border-r border-neutral-800/80 shrink-0 overflow-y-auto select-none">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500 truncate" title={rootDoc.title}>
          {rootDoc.title || 'Untitled'}
        </div>
        <button
          onClick={() => onAddPage(activeDocId)}
          title="Add page"
          className="shrink-0 text-neutral-500 hover:text-blue-400 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-2 pb-2 space-y-0.5">
        <PageRow
          space={space}
          doc={rootDoc}
          depth={0}
          activeDocId={activeDocId}
          membersById={membersById}
          onOpenDoc={onOpenDoc}
          onContextMenu={onDocContextMenu}
          renameDocId={renameDocId}
          onRenameDocHandled={onRenameDocHandled}
        />
      </div>
    </aside>
  );
}

function PageRow({
  space,
  doc,
  depth,
  activeDocId,
  membersById,
  onOpenDoc,
  onContextMenu,
  renameDocId,
  onRenameDocHandled,
}: {
  space: HierarchySpace;
  doc: TaskDoc;
  depth: number;
  activeDocId: string;
  membersById: Map<string, AppUser>;
  onOpenDoc: (docId: string) => void;
  onContextMenu: (e: React.MouseEvent, doc: TaskDoc) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
}) {
  const { updateSpaceDoc } = useTaskStore();
  const children = getChildDocs(space, doc.id);
  const containsActive = (d: TaskDoc): boolean =>
    d.id === activeDocId || getChildDocs(space, d.id).some(containsActive);
  const [expanded, setExpanded] = useState(() => children.some(containsActive));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.title);

  useEffect(() => {
    if (renameDocId === doc.id) {
      setDraft(doc.title);
      setEditing(true);
      onRenameDocHandled();
    }
  }, [renameDocId, doc.id, doc.title, onRenameDocHandled]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== doc.title) updateSpaceDoc(doc.id, doc.spaceId!, { title: trimmed });
    else setDraft(doc.title);
  };

  const isActive = doc.id === activeDocId;
  const owner = doc.ownerId ? membersById.get(doc.ownerId) : undefined;

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(doc.title);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ marginLeft: 6 + depth * 14 }}
        className="block bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
      />
    );
  }

  return (
    <div>
      <div
        onClick={() => onOpenDoc(doc.id)}
        onContextMenu={(e) => onContextMenu(e, doc)}
        className={`group w-full flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-pointer transition ${
          isActive ? 'bg-neutral-800 font-medium' : 'text-neutral-300 hover:text-neutral-200 hover:bg-neutral-800/40'
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="shrink-0 text-neutral-500 hover:text-neutral-300 cursor-pointer"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FileText className="w-3 h-3 shrink-0" style={{ color: doc.color || undefined }} />
        <span className="truncate flex-1" style={isActive ? activeGlowStyle(doc.color) : { color: doc.color || undefined }}>
          {doc.title || 'Untitled'}
        </span>
        {owner && (
          <span
            title={owner.name}
            className="w-4 h-4 rounded-full border border-neutral-900 text-[8px] font-bold flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: owner.color }}
          >
            {owner.initials}
          </span>
        )}
      </div>
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <PageRow
              key={child.id}
              space={space}
              doc={child}
              depth={depth + 1}
              activeDocId={activeDocId}
              membersById={membersById}
              onOpenDoc={onOpenDoc}
              onContextMenu={onContextMenu}
              renameDocId={renameDocId}
              onRenameDocHandled={onRenameDocHandled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

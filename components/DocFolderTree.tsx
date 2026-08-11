'use client';

import { useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Folder as FolderIconLucide, FolderOpen, FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { useTaskStore, HierarchySpace, HierarchyDocFolder, TaskDoc } from '../store/useTaskStore';
import { getChildDocFolders, getSpaceDocsIn, getChildDocs } from '../lib/docFolderTree';

// Sidebar tree for the standalone Docs tab — visually mirrors FolderTree.tsx (indentation,
// chevrons, icon language, drag-and-drop) — delete still goes through a confirm dialog in
// page.tsx, same as every other delete in this app, rather than an inline context menu.
type DocFolderTreeProps = {
  space: HierarchySpace;
  activeDocFolderId: string | null;
  activeStandaloneDocId: string | null;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenDoc: (docId: string) => void;
  onDeleteFolderRequest: (folder: HierarchyDocFolder) => void;
  onDeleteDocRequest: (doc: TaskDoc) => void;
  onDocContextMenu: (e: React.MouseEvent, doc: TaskDoc) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
};

export default function DocFolderTree(props: DocFolderTreeProps) {
  return <DocFolderLevel {...props} parentId={null} depth={0} />;
}

function DocFolderLevel(props: DocFolderTreeProps & { parentId: string | null; depth: number }) {
  const { space, parentId, depth } = props;
  const { createDocFolder, createSpaceDoc } = useTaskStore();
  const [addMode, setAddMode] = useState<'folder' | 'doc' | null>(null);
  const [draft, setDraft] = useState('');

  const folders = getChildDocFolders(space, parentId);
  const docs = getSpaceDocsIn(space, parentId);

  const commitAdd = async () => {
    const trimmed = draft.trim();
    if (trimmed) {
      if (addMode === 'folder') createDocFolder(space.id, trimmed, parentId);
      else if (addMode === 'doc') {
        const doc = await createSpaceDoc(space.id, parentId, { title: trimmed });
        if (doc) props.onOpenDoc(doc.id);
      }
    }
    setDraft('');
    setAddMode(null);
  };

  return (
    <div className={depth === 0 ? 'space-y-0.5' : 'ml-4 pl-2 border-l border-neutral-800 space-y-0.5'}>
      {folders.map((folder) => (
        <DocFolderRow key={folder.id} {...props} folder={folder} />
      ))}

      {docs.map((doc) => (
        <DocRow
          key={doc.id}
          space={space}
          doc={doc}
          activeStandaloneDocId={props.activeStandaloneDocId}
          onOpen={() => props.onOpenDoc(doc.id)}
          onDeleteRequest={() => props.onDeleteDocRequest(doc)}
          onOpenDoc={props.onOpenDoc}
          onDeleteDocRequest={props.onDeleteDocRequest}
          onContextMenu={props.onDocContextMenu}
          renameDocId={props.renameDocId}
          onRenameDocHandled={props.onRenameDocHandled}
        />
      ))}

      {addMode ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft('');
              setAddMode(null);
            }
          }}
          placeholder={addMode === 'doc' ? 'Document title...' : 'Folder name...'}
          className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
        />
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setDraft('');
              setAddMode('doc');
            }}
            className="flex-1 text-left px-2 py-1 rounded text-[11px] text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/30 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> New doc
          </button>
          <button
            onClick={() => {
              setDraft('');
              setAddMode('folder');
            }}
            title="New folder"
            className="px-1.5 py-1 rounded text-[11px] text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/30 cursor-pointer"
          >
            <FolderIconLucide className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function DocFolderRow(props: DocFolderTreeProps & { folder: HierarchyDocFolder; parentId: string | null; depth: number }) {
  const { folder, space, onDeleteFolderRequest, onNavigateFolder, activeDocFolderId } = props;
  const { updateDocFolder } = useTaskStore();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) updateDocFolder(space.id, folder.id, { name: trimmed });
    else setDraft(folder.name);
  };

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
            setDraft(folder.name);
            setEditing(false);
          }
        }}
        className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none mb-0.5"
      />
    );
  }

  const isActive = activeDocFolderId === folder.id;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `docfolder-drag:${folder.id}` });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `docfolder-drop:${folder.id}` });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div className="space-y-0.5">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => {
          // Always navigate, and always end up expanded — the chevron button (below, with its
          // own stopPropagation) is the only thing that actually toggles collapse. Coupling
          // navigate with a *toggle* here meant clicking an already-expanded folder to browse
          // into it would also collapse it, hiding its own "+ New doc" row out from under a
          // click that was about to use it.
          setExpanded(true);
          onNavigateFolder(folder.id);
        }}
        className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
          isActive ? 'bg-neutral-800 text-blue-400 font-medium' : 'text-neutral-300 hover:text-neutral-200 hover:bg-neutral-800/30'
        } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="shrink-0 text-neutral-500 hover:text-neutral-300 cursor-pointer"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {expanded ? <FolderOpen className="w-3 h-3 shrink-0" /> : <FolderIconLucide className="w-3 h-3 shrink-0" />}
          <span className="truncate">{folder.name}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(folder.name);
              setEditing(true);
            }}
            title="Rename"
            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 cursor-pointer"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolderRequest(folder);
            }}
            title="Delete"
            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </span>
      </div>
      {expanded && <DocFolderLevel {...props} parentId={folder.id} depth={props.depth + 1} />}
    </div>
  );
}

function DocRow({
  space,
  doc,
  activeStandaloneDocId,
  onOpen,
  onDeleteRequest,
  onOpenDoc,
  onDeleteDocRequest,
  onContextMenu,
  renameDocId,
  onRenameDocHandled,
}: {
  space: HierarchySpace;
  doc: TaskDoc;
  activeStandaloneDocId: string | null;
  onOpen: () => void;
  onDeleteRequest: () => void;
  onOpenDoc: (docId: string) => void;
  onDeleteDocRequest: (doc: TaskDoc) => void;
  onContextMenu: (e: React.MouseEvent, doc: TaskDoc) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
}) {
  const { updateSpaceDoc } = useTaskStore();
  const isActive = activeStandaloneDocId === doc.id;
  const children = getChildDocs(space, doc.id);
  // Expanded by default whenever a descendant is the currently-open doc, so navigating deep-links
  // straight into a subpage without the sidebar looking like it's missing the trail to get there.
  const [expanded, setExpanded] = useState(() => children.some((c) => c.id === activeStandaloneDocId));
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

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `spacedoc-drag:${doc.id}` });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `spacedoc:${doc.id}` });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

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
        className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
      />
    );
  }

  return (
    <div className="space-y-0.5">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={onOpen}
        onContextMenu={(e) => onContextMenu(e, doc)}
        className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
          isActive ? 'bg-neutral-800 text-blue-400 font-medium' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
        } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
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
          <span className="truncate">{doc.title || 'Untitled'}</span>
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest();
          }}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer shrink-0"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
      {expanded && children.length > 0 && (
        <div className="ml-4 pl-2 border-l border-neutral-800 space-y-0.5">
          {children.map((child) => (
            <DocRow
              key={child.id}
              space={space}
              doc={child}
              activeStandaloneDocId={activeStandaloneDocId}
              onOpen={() => onOpenDoc(child.id)}
              onDeleteRequest={() => onDeleteDocRequest(child)}
              onOpenDoc={onOpenDoc}
              onDeleteDocRequest={onDeleteDocRequest}
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

'use client';

import { useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIconLucide,
  FolderOpen,
  List as ListIcon,
  Plus,
  Pencil,
  Trash2,
  Check,
  Star,
  Rocket,
  Briefcase,
  Bookmark,
  Flag,
  Layers,
  Target,
  Heart,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useTaskStore, HierarchySpace, HierarchyFolder, HierarchyList, Task } from '../store/useTaskStore';
import { getChildFolders, getListsIn, collectListIdsUnder } from '../lib/folderTree';

const COLLAPSED_FOLDERS_STORAGE_KEY = 'robup.collapsedFolders';

// Folders default to expanded, so we only need to persist the collapsed ones (usually the
// minority). Read/write the whole set on each toggle — toggles are one-at-a-time user clicks,
// never concurrent, so a read-modify-write round trip per click is safe.
function readCollapsedFolders(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function setFolderCollapsed(folderId: string, collapsed: boolean) {
  try {
    const next = readCollapsedFolders();
    if (collapsed) next.add(folderId);
    else next.delete(folderId);
    localStorage.setItem(COLLAPSED_FOLDERS_STORAGE_KEY, JSON.stringify([...next]));
  } catch {}
}

export const FOLDER_ICON_CHOICES = ['star', 'rocket', 'briefcase', 'bookmark', 'flag', 'layers', 'target', 'heart', 'trophy'];

export const FOLDER_ICON_MAP: Record<string, LucideIcon> = {
  star: Star,
  rocket: Rocket,
  briefcase: Briefcase,
  bookmark: Bookmark,
  flag: Flag,
  layers: Layers,
  target: Target,
  heart: Heart,
  trophy: Trophy,
};

type FolderTreeProps = {
  space: HierarchySpace;
  tasks: Task[];
  activeView: 'board' | 'calendar' | 'docs' | 'office' | 'mytasks' | 'mypersonal' | 'profile';
  activeListIds: Set<string>;
  calendarVisibleListIds: Set<string>;
  onNavigateList: (e: React.MouseEvent, listId: string) => void;
  toggleCalendarList: (listId: string) => void;
  toggleCalendarFolder: (folderId: string) => void;
  onDeleteFolderRequest: (folder: HierarchyFolder) => void;
  onFolderContextMenu: (e: React.MouseEvent, folder: HierarchyFolder) => void;
  renameFolderId: string | null;
  onRenameFolderHandled: () => void;
  onListContextMenu: (e: React.MouseEvent, list: HierarchyList) => void;
  onDeleteListRequest: (list: HierarchyList) => void;
  renameListId: string | null;
  onRenameListHandled: () => void;
};

export default function FolderTree(props: FolderTreeProps) {
  return <FolderLevel {...props} parentId={null} depth={0} />;
}

function FolderLevel(props: FolderTreeProps & { parentId: string | null; depth: number }) {
  const { space, tasks, activeView, activeListIds, calendarVisibleListIds, onNavigateList, toggleCalendarList, parentId, depth } = props;
  const { createList, createFolder, renameList } = useTaskStore();
  const [addMode, setAddMode] = useState<'list' | 'folder' | null>(null);
  const [draft, setDraft] = useState('');

  const folders = getChildFolders(space, parentId);
  const lists = getListsIn(space, parentId);

  const commitAdd = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      if (addMode === 'list') createList(space.id, trimmed, parentId);
      else if (addMode === 'folder') createFolder(space.id, trimmed, parentId);
    }
    setDraft('');
    setAddMode(null);
  };

  return (
    // Bumped from ml-4 pl-2 — the previous per-level step was too subtle to read as "nested"
    // at a glance, especially two-plus levels deep. This is a flat increment that compounds
    // through natural DOM nesting (each recursive level adds another one on top), not a
    // depth-multiplied value — List rows inherit it automatically since they render in this
    // same wrapper.
    <div className={depth === 0 ? 'space-y-0.5' : 'ml-6 pl-3 border-l border-neutral-800 space-y-0.5'}>
      {folders.map((folder) => (
        <FolderRow key={folder.id} {...props} folder={folder} />
      ))}

      {lists.map((list) => {
        const isActive = activeView === 'board' && activeListIds.has(list.id);
        const count = tasks.filter((t) => t.listId === list.id && t.parentId === null && !t.archived).length;
        return (
          <ListRow
            key={list.id}
            list={list}
            isActive={isActive}
            count={count}
            filterMode={activeView === 'calendar'}
            checked={calendarVisibleListIds.has(list.id)}
            onNavigate={(e) => onNavigateList(e, list.id)}
            onToggle={() => toggleCalendarList(list.id)}
            onRename={(name) => renameList(space.id, list.id, name)}
            onContextMenu={(e) => props.onListContextMenu(e, list)}
            onDeleteRequest={() => props.onDeleteListRequest(list)}
            renameListId={props.renameListId}
            onRenameListHandled={props.onRenameListHandled}
          />
        );
      })}

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
          placeholder={addMode === 'list' ? 'List name...' : 'Folder name...'}
          className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
        />
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setDraft('');
              setAddMode('list');
            }}
            className="flex-1 text-left px-2 py-1 rounded text-[11px] text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/30 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> New list
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

function FolderRow(props: FolderTreeProps & { folder: HierarchyFolder; parentId: string | null; depth: number }) {
  const {
    space,
    tasks,
    activeView,
    calendarVisibleListIds,
    toggleCalendarFolder,
    onDeleteFolderRequest,
    onFolderContextMenu,
    renameFolderId,
    onRenameFolderHandled,
    folder,
  } = props;
  const { renameFolder } = useTaskStore();
  const [expanded, setExpandedState] = useState(() => !readCollapsedFolders().has(folder.id));
  const setExpanded = (next: boolean | ((v: boolean) => boolean)) => {
    setExpandedState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      setFolderCollapsed(folder.id, !value);
      return value;
    });
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  // Triggered by the "Rename" item in the folder's right-click context menu (page.tsx),
  // which lives outside this row and has no direct handle on its local `editing` state.
  useEffect(() => {
    if (renameFolderId === folder.id) {
      setDraft(folder.name);
      setEditing(true);
      onRenameFolderHandled();
    }
  }, [renameFolderId, folder.id, folder.name, onRenameFolderHandled]);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `folder-drag:${folder.id}` });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `folder-drop:${folder.id}` });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const listIdsUnder = collectListIdsUnder(space, folder.id);
  const allChecked = listIdsUnder.length > 0 && listIdsUnder.every((id) => calendarVisibleListIds.has(id));
  const someChecked = listIdsUnder.some((id) => calendarVisibleListIds.has(id));
  const folderTaskCount = tasks.filter((t) => t.parentId === null && !t.archived && listIdsUnder.includes(t.listId)).length;

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) renameFolder(space.id, folder.id, trimmed);
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

  return (
    <div className="space-y-0.5">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => (activeView === 'calendar' ? toggleCalendarFolder(folder.id) : setExpanded((v) => !v))}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFolderContextMenu(e, folder);
        }}
        className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
          activeView === 'calendar' && allChecked ? 'text-blue-400' : 'text-neutral-300 hover:text-neutral-200 hover:bg-neutral-800/30'
        } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
          {activeView === 'calendar' && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleCalendarFolder(folder.id);
              }}
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                allChecked
                  ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'
                  : someChecked
                  ? 'bg-blue-500/10 border-blue-500/40'
                  : 'border-neutral-600'
              }`}
            >
              {allChecked && <Check className="w-2.5 h-2.5" />}
            </span>
          )}
          {/* No permanently-visible chevron — the folder's own icon shows by default and morphs
              into a chevron (matching current expand state) on hover, reusing the same
              group/group-hover:opacity idiom already used for this row's Rename/Delete buttons
              below, rather than new JS-driven hover state. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            title={expanded ? 'Collapse' : 'Expand'}
            className="shrink-0 cursor-pointer flex items-center justify-center p-1.5 -m-1.5"
          >
            <span className="relative w-3 h-3 flex items-center justify-center">
              {(() => {
                const CustomIcon = folder.icon ? FOLDER_ICON_MAP[folder.icon] : null;
                const Icon = CustomIcon || (expanded ? FolderOpen : FolderIconLucide);
                return (
                  <Icon
                    className="absolute inset-0 w-3 h-3 opacity-100 group-hover:opacity-0 transition"
                    style={{ color: folder.color || undefined }}
                  />
                );
              })()}
              {expanded ? (
                <ChevronDown className="absolute inset-0 w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
              ) : (
                <ChevronRight className="absolute inset-0 w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
              )}
            </span>
          </button>
          <span className="truncate">{folder.name}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {activeView === 'board' && <span className="text-[10px] text-neutral-500 font-mono">{folderTaskCount}</span>}
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
      {expanded && <FolderLevel {...props} parentId={folder.id} depth={props.depth + 1} />}
    </div>
  );
}

function ListRow({
  list,
  isActive,
  count,
  onNavigate,
  onRename,
  filterMode = false,
  checked = false,
  onToggle,
  onContextMenu,
  onDeleteRequest,
  renameListId,
  onRenameListHandled,
}: {
  list: HierarchyList;
  isActive: boolean;
  count: number;
  onNavigate: (e: React.MouseEvent) => void;
  onRename: (name: string) => void;
  filterMode?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDeleteRequest: () => void;
  renameListId: string | null;
  onRenameListHandled: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);

  // Triggered by the "Rename" item in the list's right-click context menu (page.tsx), same
  // pattern as FolderRow's equivalent effect below.
  useEffect(() => {
    if (renameListId === list.id) {
      setDraft(list.name);
      setEditing(true);
      onRenameListHandled();
    }
  }, [renameListId, list.id, list.name, onRenameListHandled]);

  // The `list:${id}` droppable below is reused for two different purposes depending on what's
  // being dragged (task vs. a sibling List/Folder) — page.tsx's onDragEnd already branches on
  // the dragged id's prefix first, so it can tell them apart without a second droppable here.
  // A second `useDroppable` on this exact same rect would tie with this one in collision
  // detection (identical center point), making the winner effectively random.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `list-drag:${list.id}` });
  const { setNodeRef: setTaskDropRef, isOver } = useDroppable({ id: `list:${list.id}` });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setTaskDropRef(node);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== list.name) onRename(trimmed);
    else setDraft(list.name);
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
            setDraft(list.name);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={filterMode ? onToggle : onNavigate}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
        isActive
          ? 'bg-neutral-800 text-blue-400 font-medium'
          : filterMode && checked
          ? 'text-blue-400'
          : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
      } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="truncate flex items-center gap-1.5 min-w-0">
        {filterMode && (
          <span
            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
              checked ? 'bg-blue-500/20 border-blue-500/60 text-blue-400' : 'border-neutral-600'
            }`}
          >
            {checked && <Check className="w-2.5 h-2.5" />}
          </span>
        )}
        {(() => {
          const CustomIcon = list.icon ? FOLDER_ICON_MAP[list.icon] : null;
          const Icon = CustomIcon || ListIcon;
          return <Icon className="w-3 h-3 shrink-0" style={{ color: list.color || undefined }} />;
        })()}
        <span className="truncate">{list.name}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {!filterMode && <span className="text-[9px] text-neutral-500 font-mono">{count}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDraft(list.name);
            setEditing(true);
          }}
          title="Rename"
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 cursor-pointer"
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
        {!filterMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest();
            }}
            title="Delete"
            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
    </div>
  );
}

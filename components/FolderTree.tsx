'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { useTaskStore, HierarchySpace, HierarchyFolder, HierarchyList, Task } from '../store/useTaskStore';
import { getChildFolders, getListsIn, collectListIdsUnder } from '../lib/folderTree';

type FolderTreeProps = {
  space: HierarchySpace;
  tasks: Task[];
  activeView: 'board' | 'calendar';
  activeListId: string | null;
  calendarVisibleListIds: Set<string>;
  onNavigateList: (listId: string) => void;
  toggleCalendarList: (listId: string) => void;
  toggleCalendarFolder: (folderId: string) => void;
  onDeleteFolderRequest: (folder: HierarchyFolder) => void;
};

export default function FolderTree(props: FolderTreeProps) {
  return <FolderLevel {...props} parentId={null} depth={0} />;
}

function FolderLevel(props: FolderTreeProps & { parentId: string | null; depth: number }) {
  const { space, tasks, activeView, activeListId, calendarVisibleListIds, onNavigateList, toggleCalendarList, parentId, depth } = props;
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
    <div className={depth === 0 ? 'space-y-0.5' : 'ml-4 pl-2 border-l border-slate-800 space-y-0.5'}>
      {folders.map((folder) => (
        <FolderRow key={folder.id} {...props} folder={folder} />
      ))}

      {lists.map((list) => {
        const isActive = activeView === 'board' && activeListId === list.id;
        const count = tasks.filter((t) => t.listId === list.id && t.parentId === null && !t.archived).length;
        return (
          <ListRow
            key={list.id}
            list={list}
            isActive={isActive}
            count={count}
            filterMode={activeView === 'calendar'}
            checked={calendarVisibleListIds.has(list.id)}
            onNavigate={() => onNavigateList(list.id)}
            onToggle={() => toggleCalendarList(list.id)}
            onRename={(name) => renameList(space.id, list.id, name)}
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
          className="w-full bg-slate-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
        />
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setDraft('');
              setAddMode('list');
            }}
            className="flex-1 text-left px-2 py-1 rounded text-[11px] text-slate-500 hover:text-blue-400 hover:bg-slate-800/30 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> New list
          </button>
          <button
            onClick={() => {
              setDraft('');
              setAddMode('folder');
            }}
            title="New folder"
            className="px-1.5 py-1 rounded text-[11px] text-slate-500 hover:text-blue-400 hover:bg-slate-800/30 cursor-pointer"
          >
            <FolderIconLucide className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function FolderRow(props: FolderTreeProps & { folder: HierarchyFolder; parentId: string | null; depth: number }) {
  const { space, tasks, activeView, calendarVisibleListIds, toggleCalendarFolder, onDeleteFolderRequest, folder } = props;
  const { renameFolder } = useTaskStore();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

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
        className="w-full bg-slate-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none mb-0.5"
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
        className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
          activeView === 'calendar' && allChecked ? 'text-blue-400' : 'text-slate-300 hover:text-slate-200 hover:bg-slate-800/30'
        } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="shrink-0 text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {activeView === 'calendar' && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleCalendarFolder(folder.id);
              }}
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                allChecked ? 'bg-blue-500 border-blue-500 text-white' : someChecked ? 'bg-blue-500/30 border-blue-500' : 'border-slate-600'
              }`}
            >
              {allChecked && <Check className="w-2.5 h-2.5" />}
            </span>
          )}
          {expanded ? <FolderOpen className="w-3 h-3 shrink-0" /> : <FolderIconLucide className="w-3 h-3 shrink-0" />}
          <span className="truncate">{folder.name}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {activeView === 'board' && <span className="text-[10px] text-slate-500 font-mono">{folderTaskCount}</span>}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(folder.name);
              setEditing(true);
            }}
            title="Rename"
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 cursor-pointer"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolderRequest(folder);
            }}
            title="Delete"
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 cursor-pointer"
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
}: {
  list: HierarchyList;
  isActive: boolean;
  count: number;
  onNavigate: () => void;
  onRename: (name: string) => void;
  filterMode?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);

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
        className="w-full bg-slate-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={filterMode ? onToggle : onNavigate}
      className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
        isActive
          ? 'bg-slate-800 text-blue-400 font-medium'
          : filterMode && checked
          ? 'text-blue-400'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
      } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="truncate flex items-center gap-1.5 min-w-0">
        {filterMode && (
          <span
            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
              checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-600'
            }`}
          >
            {checked && <Check className="w-2.5 h-2.5" />}
          </span>
        )}
        <ListIcon className="w-3 h-3 shrink-0" />
        <span className="truncate">{list.name}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {!filterMode && <span className="text-[9px] text-slate-500 font-mono">{count}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDraft(list.name);
            setEditing(true);
          }}
          title="Rename"
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 cursor-pointer"
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
      </span>
    </div>
  );
}

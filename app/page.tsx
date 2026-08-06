'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Globe,
  List as ListIcon,
  Folder as FolderIconLucide,
  Calendar as CalendarIcon,
  Users,
  UserCircle,
  Zap,
  Archive,
  Plus,
  Pencil,
  Trash2,
  FolderInput,
  X,
  Maximize2,
  Undo2,
  CheckCircle2,
  EyeOff,
  Palette,
  RefreshCw,
  FileText,
  Check,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  GripVertical,
  CornerDownRight,
  CornerUpLeft,
  ListPlus,
  ListMinus,
  Link2,
  Building2,
  Search,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { useTaskStore, HierarchySpace, HierarchyFolder, HierarchyList, HierarchyDocFolder, HierarchyRoom, StatusDef, CustomFieldDef, Task, TaskDoc } from '../store/useTaskStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useSessionStore } from '../store/useSessionStore';
import { collectListIdsUnder, isDescendantOf, getOrderedListIds } from '../lib/folderTree';
import { isDescendantOfDocFolder } from '../lib/docFolderTree';
import { buildNavQueryString, dateKey, parseNavUrl } from '../lib/navUrl';
import DatePickerPopover from '../components/DatePickerPopover';
import ConfirmDialog from '../components/ConfirmDialog';
import FloatingPopover from '../components/FloatingPopover';
import TaskRow, { ColumnDef } from '../components/TaskRow';
import FolderTree, { FOLDER_ICON_CHOICES, FOLDER_ICON_MAP } from '../components/FolderTree';
import CalendarView from '../components/calendar/CalendarView';
import CreateTaskModal from '../components/CreateTaskModal';
import SpaceHome from '../components/SpaceHome';
import DocFolderTree from '../components/DocFolderTree';
import DocsBrowser from '../components/DocsBrowser';
import OfficePage from '../components/OfficePage';
import CommandPalette from '../components/CommandPalette';
import MentionText from '../components/MentionText';
import MentionTextarea from '../components/MentionTextarea';
import type { MentionKind } from '../lib/mentions';

function DocTab({
  doc,
  isActive,
  onSelect,
  onDelete,
  onUnlink,
}: {
  doc: TaskDoc;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUnlink?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: doc.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // A doc with a spaceId is also a standalone Docs-tab doc — it has somewhere else to keep
  // living, so it gets a separate "detach without destroying" affordance next to Delete.
  const canUnlink = doc.spaceId !== null && onUnlink;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group/doc shrink-0">
      <button
        onClick={onSelect}
        className={`text-[11px] px-2.5 py-1 rounded cursor-pointer transition ${
          isActive ? 'bg-neutral-800 text-blue-400' : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
        }`}
      >
        {doc.title || 'Untitled'}
      </button>
      {canUnlink && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnlink();
          }}
          title="Unlink from this task (keeps the doc in the Docs tab)"
          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-neutral-800 text-neutral-400 hover:text-blue-400 flex items-center justify-center opacity-0 group-hover/doc:opacity-100 cursor-pointer"
        >
          <Unlink className="w-2 h-2" />
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-neutral-800 text-neutral-400 hover:text-red-400 text-[8px] flex items-center justify-center opacity-0 group-hover/doc:opacity-100 cursor-pointer"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

function SortableColumnHeader({
  col,
  onToggleSort,
  sortIcon,
  onContextMenuOpen,
  onResize,
  onResetWidth,
}: {
  col: ColumnDef;
  onToggleSort: () => void;
  sortIcon: React.ReactNode;
  onContextMenuOpen?: (e: React.MouseEvent) => void;
  onResize: (deltaPx: number) => void;
  onResetWidth: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenuOpen?.(e);
      }}
      className="relative text-center flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing select-none"
      title="Drag to reorder, right-click for more options"
    >
      <button onClick={onToggleSort} className="hover:text-neutral-300 cursor-pointer flex items-center gap-1">
        {col.label} {sortIcon}
      </button>
      <ColumnResizeHandle onResize={onResize} onReset={onResetWidth} />
    </div>
  );
}

function ColumnResizeHandle({ onResize, onReset }: { onResize: (deltaPx: number) => void; onReset: () => void }) {
  const [resizing, setResizing] = useState(false);

  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setResizing(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!resizing) return;
        e.stopPropagation();
        onResize(e.movementX);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        setResizing(false);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      title="Drag to resize, double-click to reset"
      className={`absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize z-10 ${resizing ? 'bg-blue-500/60' : 'hover:bg-blue-500/40'}`}
    />
  );
}

function SortableStatusRow({
  status,
  colorChoices,
  onChangeName,
  onChangeColor,
  onDelete,
}: {
  status: StatusDef;
  colorChoices: string[];
  onChangeName: (name: string) => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(status.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-center gap-2">
        <span {...attributes} {...listeners} className="text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="w-4 h-4 rounded-full shrink-0 cursor-pointer ring-1 ring-neutral-700"
          style={{ backgroundColor: status.color }}
        />
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft.trim() && nameDraft !== status.name) onChangeName(nameDraft.trim());
            else setNameDraft(status.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="flex-1 min-w-0 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500"
        />
        <button onClick={onDelete} className="text-neutral-500 hover:text-red-400 text-xs cursor-pointer shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {paletteOpen && (
        <div className="flex gap-1 pl-6">
          {colorChoices.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChangeColor(c);
                setPaletteOpen(false);
              }}
              className={`w-4 h-4 rounded-full cursor-pointer ${status.color === c ? 'ring-2 ring-white' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DroppableSidebarItem({
  id,
  dragId,
  children,
}: {
  id: string;
  dragId: string;
  children: (isOver: boolean, dragHandleProps: { attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({ id: dragId });
  const setNodeRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };
  return (
    <div ref={setNodeRef} style={isDragging ? { opacity: 0.4 } : undefined}>
      {children(isOver, { attributes, listeners, isDragging })}
    </div>
  );
}

function SortableFieldOption({
  option,
  colorChoices,
  onChangeLabel,
  onChangeColor,
  onDelete,
}: {
  option: { id: string; label: string; color: string };
  colorChoices: string[];
  onChangeLabel: (label: string) => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-center gap-2">
        <span {...attributes} {...listeners} className="text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="w-5 h-5 rounded-full shrink-0 cursor-pointer ring-1 ring-neutral-700"
          style={{ backgroundColor: option.color }}
        />
        <input
          value={option.label}
          onChange={(e) => onChangeLabel(e.target.value)}
          className="flex-1 min-w-0 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
        />
        <button onClick={onDelete} className="text-neutral-500 hover:text-red-400 text-xs cursor-pointer shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {paletteOpen && (
        <div className="flex gap-1 pl-6">
          {colorChoices.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChangeColor(c);
                setPaletteOpen(false);
              }}
              className={`w-4 h-4 rounded-full cursor-pointer ${option.color === c ? 'ring-2 ring-white' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Muted/pastel variants of the base Tailwind accent hues — same hues, lower saturation
// and slightly lifted lightness so status pills, calendar bars, and sidebar color dots
// read as soft accents instead of solid neon fills.
export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'default-todo', name: 'To Do', color: '#c89642', order: 0 },
  { id: 'default-progress', name: 'In Progress', color: '#618cd1', order: 1 },
  { id: 'default-review', name: 'Review', color: '#9a61d1', order: 2 },
  { id: 'default-done', name: 'Done', color: '#349f7c', order: 3 },
];

const FIELD_COLOR_CHOICES = ['#c89642', '#618cd1', '#9a61d1', '#349f7c', '#cd6565', '#31a0b3', '#cb6798', '#8d97a5'];

// Icon per activity-log kind (Comment.activityKind) — same neutral Lucide icon language as the
// rest of the app instead of emoji. Entries logged before this existed have `activityKind: null`
// and fall back to the plain dot marker in the render below.
const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  created: Plus,
  title: Pencil,
  status: RefreshCw,
  archived: CheckCircle2,
  unarchived: Undo2,
  becameSubtask: CornerDownRight,
  leftSubtask: CornerUpLeft,
  movedList: FolderInput,
  assigned: UserCircle,
  unassigned: UserCircle,
  subtaskAdded: ListPlus,
  subtaskRemoved: ListMinus,
  docCreated: FileText,
  docDeleted: Trash2,
  docEdited: Pencil,
};

const listPathLabel = (space: HierarchySpace, listId: string): string => {
  const list = space.lists.find((l) => l.id === listId);
  if (!list) return '';
  const parts: string[] = [list.name];
  let folderId = list.folderId;
  while (folderId) {
    const folder = space.folders.find((f) => f.id === folderId);
    if (!folder) break;
    parts.unshift(folder.name);
    folderId = folder.parentId;
  }
  return parts.join(' / ');
};

const initialsFromName = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = { name: 280 };
const NAME_WIDTH_RANGE = { min: 140, max: 640 };
const COLUMN_WIDTH_RANGE = { min: 70, max: 300 };
const COLUMN_WIDTHS_STORAGE_KEY = 'robup.columnWidths';
const ACTIVITY_PANEL_STORAGE_KEY = 'robup.showActivityPanel';

const timeAgo = (dateStr: string | Date) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export default function Home() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}

function PageContent() {
  const {
    tasks,
    workspaces,
    users,
    comments,
    docs,
    activeSpaceId,
    activeListIds,
    isLoading,
    showArchived,
    activeView,
    setActiveView,
    calendarGranularity,
    calendarFocusDate,
    setCalendarGranularity,
    setCalendarFocusDate,
    activeDocFolderId,
    activeStandaloneDocId,
    setDocsNavigation,
    activeOfficeUserId,
    setActiveOfficeUserId,
    fetchInitialData,
    setNavigation,
    setShowArchived,
    optimisticMoveTask,
    optimisticCreateTask,
    optimisticDeleteTask,
    optimisticArchiveTask,
    optimisticSetAssignees,
    optimisticSetDates,
    optimisticSetList,
    optimisticSetParent,
    optimisticSetTitle,
    createStatus,
    updateStatus,
    deleteStatus,
    createCustomField,
    updateCustomField,
    deleteCustomField,
    addUser,
    updateUser,
    deleteUser,
    createRoom,
    updateRoom,
    deleteRoom,
    assignUserToRoom,
    updateWorkspaceMessage,
    updateSpace,
    reorderSpace,
    createSpace,
    deleteSpace,
    moveList,
    reorderList,
    updateList,
    deleteList,
    moveFolder,
    updateFolder,
    deleteFolder,
    updateDocFolder,
    moveDocFolder,
    deleteDocFolder,
    createSpaceDoc,
    updateSpaceDoc,
    moveSpaceDoc,
    reorderSpaceDoc,
    deleteSpaceDoc,
    setDocTaskLink,
    fetchComments,
    addComment,
    logActivity,
    fetchDocs,
    createDoc,
    updateDoc,
    deleteDoc,
    reorderDocs,
  } = useTaskStore();

  const { currentUserId, setCurrentUserId } = useSessionStore();

  const [sortBy, setSortBy] = useState<'dueDate' | 'startDate' | 'name' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [activeAdd, setActiveAdd] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [modalTaskStack, setModalTaskStack] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'assignee', 'startDate', 'dueDate']);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const [showActivityPanel, setShowActivityPanel] = useState(true);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDefaultDate, setCreateTaskDefaultDate] = useState<string | null>(null);

  const [calendarVisibleListIds, setCalendarVisibleListIds] = useState<Set<string>>(new Set());
  const calendarFilterInitRef = useRef(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDef['type']>('text');

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState(FIELD_COLOR_CHOICES[0]);

  // Status/assignee popovers in the modal (TaskRow has its own local versions)
  const [modalStatusOpen, setModalStatusOpen] = useState(false);
  const [modalAssigneeOpen, setModalAssigneeOpen] = useState(false);

  const [teamOpen, setTeamOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserColor, setNewUserColor] = useState(FIELD_COLOR_CHOICES[1]);

  const [newCommentBody, setNewCommentBody] = useState('');
  const [commentAsUserId, setCommentAsUserId] = useState(currentUserId ?? '');

  const [taskMenu, setTaskMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [spaceMenu, setSpaceMenu] = useState<{ x: number; y: number; space: HierarchySpace } | null>(null);
  const [spaceEditTarget, setSpaceEditTarget] = useState<HierarchySpace | null>(null);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceColor, setEditSpaceColor] = useState(FIELD_COLOR_CHOICES[0]);
  const [spaceToDelete, setSpaceToDelete] = useState<HierarchySpace | null>(null);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceDraft, setNewSpaceDraft] = useState('');

  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: HierarchyFolder } | null>(null);
  const [folderEditTarget, setFolderEditTarget] = useState<HierarchyFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState<string | null>(null);
  const [editFolderIcon, setEditFolderIcon] = useState<string | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);

  const [listMenu, setListMenu] = useState<{ x: number; y: number; list: HierarchyList; spaceId: string } | null>(null);
  const [listEditTarget, setListEditTarget] = useState<{ list: HierarchyList; spaceId: string } | null>(null);
  const [editListName, setEditListName] = useState('');
  const [editListColor, setEditListColor] = useState<string | null>(null);
  const [editListIcon, setEditListIcon] = useState<string | null>(null);
  const [renameListId, setRenameListId] = useState<string | null>(null);
  const [listToDelete, setListToDelete] = useState<{ list: HierarchyList; spaceId: string } | null>(null);

  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number; col: ColumnDef } | null>(null);
  const [taskListPicker, setTaskListPicker] = useState<{ x: number; y: number; taskId: string; options: { id: string; label: string }[] } | null>(null);
  const [fieldEditTarget, setFieldEditTarget] = useState<CustomFieldDef | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<{ id: string; name: string } | null>(null);
  const [statusToDelete, setStatusToDelete] = useState<{ id: string; name: string } | null>(null);
  const [fieldNameDraft, setFieldNameDraft] = useState('');
  const [fieldOptionsDraft, setFieldOptionsDraft] = useState<{ id: string; label: string; color: string }[]>([]);

  useEffect(() => {
    if (fieldEditTarget) {
      setFieldNameDraft(fieldEditTarget.name);
      setFieldOptionsDraft(
        fieldEditTarget.options.map((o) => ({ id: o.id || crypto.randomUUID(), label: o.label, color: o.color }))
      );
    }
  }, [fieldEditTarget]);

  const fieldOptionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleFieldOptionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFieldOptionsDraft((opts) => {
      const oldIndex = opts.findIndex((o) => o.id === active.id);
      const newIndex = opts.findIndex((o) => o.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return opts;
      return arrayMove(opts, oldIndex, newIndex);
    });
  };

  const addFieldOption = () => {
    setFieldOptionsDraft((opts) => [
      ...opts,
      { id: crypto.randomUUID(), label: `Option ${opts.length + 1}`, color: FIELD_COLOR_CHOICES[opts.length % FIELD_COLOR_CHOICES.length] },
    ]);
  };

  const handleSaveField = () => {
    if (!fieldEditTarget || !currentSpace) return;
    updateCustomField(currentSpace.id, fieldEditTarget.id, {
      name: fieldNameDraft.trim() || fieldEditTarget.name,
      options: fieldEditTarget.type === 'dropdown' ? fieldOptionsDraft : undefined,
    });
    setFieldEditTarget(null);
  };

  const statusSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleStatusDragEnd = (event: DragEndEvent) => {
    if (!currentSpace) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = statuses.map((s) => s.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    useHistoryStore.getState().transaction('Reorder statuses', () => {
      arrayMove(statuses, oldIndex, newIndex).forEach((s, index) => {
        if (s.order !== index) updateStatus(currentSpace.id, s.id, { order: index });
      });
    });
  };

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  // Docs (sub-tab in the modal)
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docDraft, setDocDraft] = useState('');
  const [docSaveStatus, setDocSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Notion-style view/edit toggle — mentions render as clickable chips in view mode, raw
  // @[Label](kind:id) text while actually editing (a <textarea> can't show inline chips).
  const [docEditorEditing, setDocEditorEditing] = useState(false);
  const docTextareaRef = useRef<HTMLTextAreaElement>(null);
  const docSaveTimer = useRef<any>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; title: string } | null>(null);
  const [linkDocOpen, setLinkDocOpen] = useState(false);
  // Captured on focus, compared on blur — logs one "document edited" activity entry per edit
  // session (not per autosave tick) for whichever field(s) actually changed during that session.
  const docEditBaselineRef = useRef<{ docId: string; title: string; content: string } | null>(null);

  // Docs tab's full-page editor — same autosave shape as the task-modal one above, minus the
  // activity-baseline tracking (standalone docs have no task Activity & Comments feed to log into).
  const [spaceDocDraft, setSpaceDocDraft] = useState('');
  const [spaceDocSaveStatus, setSpaceDocSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [spaceDocEditorEditing, setSpaceDocEditorEditing] = useState(false);
  const spaceDocTextareaRef = useRef<HTMLTextAreaElement>(null);
  const spaceDocSaveTimer = useRef<any>(null);
  const [docFolderToDelete, setDocFolderToDelete] = useState<HierarchyDocFolder | null>(null);
  const [spaceDocToDelete, setSpaceDocToDelete] = useState<TaskDoc | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<HierarchyRoom | null>(null);

  const [editingModalTitle, setEditingModalTitle] = useState(false);
  const [modalTitleDraft, setModalTitleDraft] = useState('');
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // ---- Browser back/forward: nav state <-> URL query string ----
  // Two effects, each a no-op when the URL and the app's nav state already agree — that mutual
  // "already equal" check (rather than a manual reentrancy flag like isRestoringSnapshot) is what
  // stops these two effects from fighting each other over a URL the other one just set.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Guards effect 1 from pushing any URL before effect 2 has had a chance to read a possibly
  // deep-linked one — otherwise the app's own default state would stomp it before it's ever seen.
  const hasHydratedFromUrlRef = useRef(false);
  const urlModalStackKey = modalTaskStack.join(',');
  const urlListIdsKey = [...activeListIds].sort().join(',');
  const urlFocusDateKey = dateKey(calendarFocusDate);
  const urlDocFolderIdKey = activeDocFolderId ?? '';
  const urlDocIdKey = activeStandaloneDocId ?? '';
  const urlOfficeUserIdKey = activeOfficeUserId ?? '';

  // Effect 1: nav state -> URL. Always pushes (never replaces) once hydrated — every one of these
  // changes is a real, distinct navigation the user just made (click a Space, open a task, drill a
  // day), so it deserves its own back-button step. (An earlier version special-cased the very
  // first push after hydration as a `replace`, meant only to silently normalize a stale/partial
  // incoming URL — but since this effect only runs when something actually changes, that "first
  // push" was, in practice, almost always the user's first real click, which then silently
  // replaced the page's own history entry instead of adding a new one. Removed.)
  useEffect(() => {
    if (!hasHydratedFromUrlRef.current) return;
    const qs = buildNavQueryString({
      view: activeView,
      spaceId: activeSpaceId,
      listIds: [...activeListIds],
      modalStack: modalTaskStack,
      granularity: calendarGranularity,
      focusDate: calendarFocusDate,
      docFolderId: activeDocFolderId,
      docId: activeStandaloneDocId,
      officeUserId: activeOfficeUserId,
    });
    if (qs === searchParams.toString()) return;
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    activeSpaceId,
    urlListIdsKey,
    urlModalStackKey,
    calendarGranularity,
    urlFocusDateKey,
    urlDocFolderIdKey,
    urlDocIdKey,
    urlOfficeUserIdKey,
  ]);

  // Effect 2: URL -> nav state. Runs once real data has loaded (so a deep-linked Space/List/task
  // can be validated) and again on every back/forward navigation. Content-compares before calling
  // any setter so it never fights effect 1 above.
  useEffect(() => {
    if (workspaces.length === 0) return;
    const parsed = parseNavUrl(searchParams);

    if (parsed.view !== activeView) setActiveView(parsed.view);

    // A bare URL (no `space=`) means two different things depending on when we see it: on the very
    // first hydration pass it means "no opinion" and leaves whatever fetchInitialData's own
    // auto-select-first-space default already put in place. On every later pass — a real
    // back/forward navigation landing on a URL from before the user ever picked a Space — it must
    // actually resolve to 'everything', or backing past that first click would silently do nothing
    // (the "no opinion" reading would just leave the current Space selected).
    const explicitSpaceId = parsed.spaceId ?? (hasHydratedFromUrlRef.current ? 'everything' : null);
    let docsSpace: HierarchySpace | undefined;
    if (explicitSpaceId !== null) {
      const allSpaces = workspaces.flatMap((w) => w.spaces);
      const spaceExists = explicitSpaceId === 'everything' || allSpaces.some((s) => s.id === explicitSpaceId);
      const resolvedSpaceId = spaceExists ? explicitSpaceId : 'everything';
      const space = allSpaces.find((s) => s.id === resolvedSpaceId);
      docsSpace = space;
      const validListIds = (parsed.listIds ?? []).filter((id) => space?.lists.some((l) => l.id === id));
      if (resolvedSpaceId !== activeSpaceId || validListIds.sort().join(',') !== urlListIdsKey) {
        setNavigation(resolvedSpaceId, validListIds);
      }
    }

    const validDocFolderId =
      parsed.docFolderId && docsSpace?.docFolders.some((f) => f.id === parsed.docFolderId) ? parsed.docFolderId : null;
    const validDocId = parsed.docId && docsSpace?.spaceDocs.some((d) => d.id === parsed.docId) ? parsed.docId : null;
    if (validDocFolderId !== activeDocFolderId || validDocId !== activeStandaloneDocId) {
      setDocsNavigation(validDocFolderId, validDocId);
    }

    const validModalStack = parsed.modalStack.filter((id) => tasks.some((t) => t.id === id));
    if (validModalStack.join(',') !== urlModalStackKey) setModalTaskStack(validModalStack);

    if (parsed.granularity !== calendarGranularity) setCalendarGranularity(parsed.granularity);
    if (dateKey(parsed.focusDate) !== urlFocusDateKey) setCalendarFocusDate(parsed.focusDate);

    const validOfficeUserId = parsed.officeUserId && users.some((u) => u.id === parsed.officeUserId) ? parsed.officeUserId : null;
    if (validOfficeUserId !== activeOfficeUserId) setActiveOfficeUserId(validOfficeUserId);

    hasHydratedFromUrlRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, workspaces.length]);

  // Restore persisted UI layout prefs once on mount (localStorage isn't available during SSR)
  useEffect(() => {
    try {
      const storedWidths = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (storedWidths) setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(storedWidths) });
      const storedPanel = localStorage.getItem(ACTIVITY_PANEL_STORAGE_KEY);
      if (storedPanel !== null) setShowActivityPanel(storedPanel === 'true');
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem(ACTIVITY_PANEL_STORAGE_KEY, String(showActivityPanel));
  }, [showActivityPanel]);

  // Calendar filter defaults to "everything visible"; newly created lists join the visible set too.
  useEffect(() => {
    const allListIds = workspaces.flatMap((w) => w.spaces.flatMap((s) => s.lists.map((l) => l.id)));
    if (allListIds.length === 0) return;
    if (!calendarFilterInitRef.current) {
      setCalendarVisibleListIds(new Set(allListIds));
      calendarFilterInitRef.current = true;
      return;
    }
    setCalendarVisibleListIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of allListIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [workspaces]);

  const activeModalTaskId = modalTaskStack.length > 0 ? modalTaskStack[modalTaskStack.length - 1] : null;
  useEffect(() => {
    if (activeModalTaskId) {
      fetchComments(activeModalTaskId);
      fetchDocs(activeModalTaskId);
      setActiveDocId(null);
      setDocDraft('');
      setEditingModalTitle(false);
    }
  }, [activeModalTaskId, fetchComments, fetchDocs]);

  // Track subtasks added while a task is already open (vs. ones already there when it was opened),
  // so only genuinely new rows play their entrance animation — opening a task shouldn't "pop in" its existing subtasks.
  const [justAddedSubtaskIds, setJustAddedSubtaskIds] = useState<Set<string>>(new Set());
  const prevSubtaskStateRef = useRef<{ parentId: string | null; ids: Set<string> }>({ parentId: null, ids: new Set() });
  useEffect(() => {
    const currentIds = new Set(tasks.filter((t) => t.parentId === activeModalTaskId).map((t) => t._localId || t.id));
    const prev = prevSubtaskStateRef.current;
    if (prev.parentId === activeModalTaskId) {
      const added = [...currentIds].filter((id) => !prev.ids.has(id));
      if (added.length > 0) {
        setJustAddedSubtaskIds(new Set(added));
        prevSubtaskStateRef.current = { parentId: activeModalTaskId, ids: currentIds };
        const timer = setTimeout(() => setJustAddedSubtaskIds(new Set()), 500);
        return () => clearTimeout(timer);
      }
    }
    prevSubtaskStateRef.current = { parentId: activeModalTaskId, ids: currentIds };
  }, [tasks, activeModalTaskId]);

  // When docs for the active task load, auto-select the first document
  const activeTaskDocs = activeModalTaskId ? docs[activeModalTaskId] || [] : [];
  useEffect(() => {
    if (!activeDocId && activeTaskDocs.length > 0) {
      setActiveDocId(activeTaskDocs[0].id);
      setDocDraft(activeTaskDocs[0].content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskDocs.length, activeModalTaskId]);

  const closeAllMenus = () => {
    setColumnMenuOpen(false);
    setStatusMenuOpen(false);
    setTaskMenu(null);
    setSpaceMenu(null);
    setFolderMenu(null);
    setBulkMoveOpen(false);
  };

  const currentSpace = useMemo(() => {
    if (activeSpaceId === 'everything') return null;
    for (const ws of workspaces) {
      const found = ws.spaces.find((s) => s.id === activeSpaceId);
      if (found) return found;
    }
    return null;
  }, [workspaces, activeSpaceId]);

  const showingSpaceHome = activeView === 'board' && !!currentSpace && activeListIds.size === 0;

  const statuses: StatusDef[] = currentSpace?.statuses?.length ? currentSpace.statuses : DEFAULT_STATUSES;
  const customFields: CustomFieldDef[] = currentSpace?.customFields || [];

  const availableColumns: ColumnDef[] = useMemo(
    () => [
      { key: 'status', label: 'Status', kind: 'status' },
      { key: 'assignee', label: 'Assignee', kind: 'assignee' },
      { key: 'startDate', label: 'Start date', kind: 'startDate' },
      { key: 'dueDate', label: 'Due date', kind: 'dueDate' },
      ...customFields.map((f) => ({ key: f.id, label: f.name, kind: 'custom' as const, field: f })),
    ],
    [customFields]
  );

  const activeColumns = visibleColumns
    .map((key) => availableColumns.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c);

  const resizeColumn = (key: string, deltaPx: number) => {
    setColumnWidths((widths) => {
      const isName = key === 'name';
      const { min, max } = isName ? NAME_WIDTH_RANGE : COLUMN_WIDTH_RANGE;
      const current = widths[key] ?? (isName ? DEFAULT_COLUMN_WIDTHS.name : 110);
      const next = Math.min(max, Math.max(min, current + deltaPx));
      if (next === current) return widths;
      return { ...widths, [key]: next };
    });
  };

  const resetColumnWidth = (key: string) => {
    setColumnWidths((widths) => {
      const next = { ...widths };
      if (key === 'name') next.name = DEFAULT_COLUMN_WIDTHS.name;
      else delete next[key];
      return next;
    });
  };

  const rowGridTemplate = `20px 28px ${columnWidths.name ?? DEFAULT_COLUMN_WIDTHS.name}px ${activeColumns
    .map((c) => `${columnWidths[c.key] ?? 110}px`)
    .join(' ')} 32px`;

  const tableMinWidth =
    20 +
    28 +
    (columnWidths.name ?? DEFAULT_COLUMN_WIDTHS.name) +
    activeColumns.reduce((sum, c) => sum + (columnWidths[c.key] ?? 110), 0) +
    32;

  const statusColor = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  const filteredTasks = useMemo(() => {
    let result = tasks.filter((task) => {
      if (modalTaskStack.length > 0) return false;
      if (task.parentId !== null) return false;
      if (!!task.archived !== showArchived) return false;

      if (activeSpaceId === 'everything') return true;
      if (activeListIds.size > 0) return activeListIds.has(task.listId);
      return false; // Space selected but no List active → SpaceHome renders instead, no flat table
    });

    if (sortBy !== 'none') {
      result.sort((a: any, b: any) => {
        const key = sortBy === 'dueDate' ? 'dueDate' : sortBy === 'startDate' ? 'startDate' : 'title';
        let valA = a[key];
        let valB = b[key];
        if (!valA) return 1;
        if (!valB) return -1;
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [tasks, activeSpaceId, activeListIds, modalTaskStack, sortBy, sortOrder, showArchived]);

  // Calendar has its own independent multi-select filter (which Spaces/Lists are visible),
  // separate from the Tasks tab's single-selection navigation.
  const calendarFilteredTasks = useMemo(
    () =>
      tasks.filter(
        (task) => task.parentId === null && !!task.archived === showArchived && calendarVisibleListIds.has(task.listId)
      ),
    [tasks, calendarVisibleListIds, showArchived]
  );

  const toggleCalendarList = (listId: string) => {
    setCalendarVisibleListIds((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  };

  const toggleCalendarSpace = (space: HierarchySpace) => {
    const ids = collectListIdsUnder(space, null);
    const allOn = ids.length > 0 && ids.every((id) => calendarVisibleListIds.has(id));
    setCalendarVisibleListIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleCalendarFolder = (space: HierarchySpace, folderId: string) => {
    const ids = collectListIdsUnder(space, folderId);
    const allOn = ids.length > 0 && ids.every((id) => calendarVisibleListIds.has(id));
    setCalendarVisibleListIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleSort = (field: 'dueDate' | 'startDate' | 'name') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: 'dueDate' | 'startDate' | 'name' }) =>
    sortBy === field ? (
      <span className="text-blue-400 inline-flex">{sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
    ) : null;

  const toggleColumn = (key: string) => {
    setVisibleColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));
  };

  const reorderColumn = (fromKey: string, toKey: string) => {
    setVisibleColumns((cols) => {
      const from = cols.indexOf(fromKey);
      const to = cols.indexOf(toKey);
      if (from === -1 || to === -1 || from === to) return cols;
      const next = [...cols];
      next.splice(from, 1);
      next.splice(to, 0, fromKey);
      return next;
    });
  };

  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderColumn(active.id as string, over.id as string);
  };

  const handleAddField = () => {
    if (!newFieldName.trim() || !currentSpace) return;
    createCustomField(
      currentSpace.id,
      newFieldName,
      newFieldType,
      newFieldType === 'dropdown' ? [{ label: 'Option 1', color: FIELD_COLOR_CHOICES[0] }] : []
    );
    setNewFieldName('');
    setNewFieldOpen(false);
  };

  const handleDeleteField = (fieldId: string, fieldName: string) => {
    setFieldToDelete({ id: fieldId, name: fieldName });
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim() || !currentSpace) return;
    createStatus(currentSpace.id, newStatusName, newStatusColor);
    setNewStatusName('');
    setStatusMenuOpen(false);
  };

  const handleAddUser = () => {
    if (!newUserName.trim()) return;
    addUser(newUserName.trim(), initialsFromName(newUserName), newUserColor);
    setNewUserName('');
  };

  const handleQuickAdd = () => {
    if (!newTaskTitle.trim()) return;
    let targetListId: string | null = [...activeListIds][0] ?? null;
    let targetSpaceId = activeSpaceId === 'everything' ? '' : activeSpaceId;

    if (!targetListId && currentSpace && currentSpace.lists.length > 0) {
      targetListId = currentSpace.lists[0].id;
    } else if (!targetListId && workspaces[0]?.spaces[0]?.lists[0]) {
      targetListId = workspaces[0].spaces[0].lists[0].id;
      targetSpaceId = workspaces[0].spaces[0].id;
    }

    if (targetListId) {
      setSortBy('none');
      optimisticCreateTask(newTaskTitle, targetListId, targetSpaceId, null);
      setNewTaskTitle('');
    } else {
      alert('Select a list in the sidebar first.');
    }
  };

  // Multi-select for Lists in the Tasks-tab sidebar — plain click selects just one; Ctrl/Cmd
  // toggles a List in/out of the current selection; Shift selects the contiguous range between
  // the last click ("anchor") and this one, in the same depth-first order the tree renders in
  // (see getOrderedListIds). Scoped to one Space at a time — clicking into a different Space
  // always starts a fresh single-selection there, since a merged view can only sensibly show one
  // Space's Statuses/CustomFields/columns at once.
  const multiSelectAnchorRef = useRef<{ spaceId: string; listId: string } | null>(null);
  const handleListClick = (e: React.MouseEvent, space: HierarchySpace, listId: string) => {
    const sameSpace = activeSpaceId === space.id;
    if (e.shiftKey && sameSpace && multiSelectAnchorRef.current?.spaceId === space.id) {
      const order = getOrderedListIds(space);
      const anchorIdx = order.indexOf(multiSelectAnchorRef.current.listId);
      const targetIdx = order.indexOf(listId);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        setNavigation(space.id, order.slice(start, end + 1));
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && sameSpace) {
      const next = new Set(activeListIds);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      setNavigation(space.id, [...next]);
      multiSelectAnchorRef.current = { spaceId: space.id, listId };
      return;
    }
    setNavigation(space.id, [listId]);
    multiSelectAnchorRef.current = { spaceId: space.id, listId };
  };

  const handleAddSubtask = (parent: any) => {
    if (!newSubtaskTitle.trim()) return;
    optimisticCreateTask(newSubtaskTitle, parent.listId, activeSpaceId, parent.id);
    setNewSubtaskTitle('');
  };

  const toggleAssignee = (task: Task, userId: string) => {
    const current = task.assignees.map((a) => a.id);
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    optimisticSetAssignees(task.id, next);
  };

  const handleArchiveClick = (task: Task) => {
    optimisticArchiveTask(task.id, !task.archived);
  };

  const handleDeleteTask = (task: Task) => {
    if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
      optimisticDeleteTask(task.id);
    }
    setTaskMenu(null);
  };

  const openTaskMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    setTaskMenu({ x: e.clientX, y: e.clientY, task });
  };

  const openSpaceMenu = (e: React.MouseEvent, space: HierarchySpace) => {
    e.preventDefault();
    e.stopPropagation();
    setSpaceMenu({ x: e.clientX, y: e.clientY, space });
  };

  const startEditSpace = (space: HierarchySpace) => {
    setSpaceEditTarget(space);
    setEditSpaceName(space.name);
    setEditSpaceColor(space.color);
    setSpaceMenu(null);
  };

  const saveSpaceEdit = () => {
    if (!spaceEditTarget) return;
    updateSpace(spaceEditTarget.id, { name: editSpaceName.trim() || spaceEditTarget.name, color: editSpaceColor });
    setSpaceEditTarget(null);
  };

  const commitNewSpace = () => {
    const trimmed = newSpaceDraft.trim();
    if (trimmed && workspaces[0]) createSpace(workspaces[0].id, trimmed);
    setNewSpaceDraft('');
    setCreatingSpace(false);
  };

  const openFolderMenu = (e: React.MouseEvent, folder: HierarchyFolder) => {
    setFolderMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const openListMenu = (e: React.MouseEvent, list: HierarchyList, spaceId: string) => {
    setListMenu({ x: e.clientX, y: e.clientY, list, spaceId });
  };

  const startEditFolder = (folder: HierarchyFolder) => {
    setFolderEditTarget(folder);
    setEditFolderName(folder.name);
    setEditFolderColor(folder.color);
    setEditFolderIcon(folder.icon);
    setFolderMenu(null);
  };

  const saveFolderEdit = () => {
    if (!folderEditTarget) return;
    updateFolder(folderEditTarget.spaceId, folderEditTarget.id, {
      name: editFolderName.trim() || folderEditTarget.name,
      color: editFolderColor,
      icon: editFolderIcon,
    });
    setFolderEditTarget(null);
  };

  const startEditList = (list: HierarchyList, spaceId: string) => {
    setListEditTarget({ list, spaceId });
    setEditListName(list.name);
    setEditListColor(list.color);
    setEditListIcon(list.icon);
    setListMenu(null);
  };

  const saveListEdit = () => {
    if (!listEditTarget) return;
    updateList(listEditTarget.spaceId, listEditTarget.list.id, {
      name: editListName.trim() || listEditTarget.list.name,
      color: editListColor,
      icon: editListIcon,
    });
    setListEditTarget(null);
  };

  // ---- Bulk-valg ----
  const toggleSelect = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkArchive = (archived: boolean) => {
    useHistoryStore.getState().transaction(archived ? 'Archive tasks' : 'Unarchive tasks', () => {
      selectedIds.forEach((id) => optimisticArchiveTask(id, archived));
    });
    clearSelection();
  };
  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.size} tasks? This cannot be undone.`)) return;
    useHistoryStore.getState().transaction('Delete tasks', async () => {
      await Promise.all(Array.from(selectedIds).map((id) => optimisticDeleteTask(id)));
    });
    clearSelection();
  };
  const bulkMoveToList = (listId: string) => {
    useHistoryStore.getState().transaction('Move tasks', () => {
      selectedIds.forEach((id) => optimisticSetList(id, listId));
    });
    clearSelection();
    setBulkMoveOpen(false);
  };

  // ---- Drag & drop for tasks (row → another row / list / space) ----
  const taskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const [activeDragEntity, setActiveDragEntity] = useState<{ kind: 'folder' | 'list' | 'space' | 'person' | 'docfolder' | 'spacedoc'; name: string; color?: string | null; initials?: string } | null>(
    null
  );
  const [spaceDropIndicator, setSpaceDropIndicator] = useState<{ targetId: string; position: 'above' | 'below' } | null>(null);
  const spaceOverRef = useRef<
    { mode: 'header'; targetId: string; top: number; height: number } | { mode: 'nested'; targetId: string } | null
  >(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  // The token lives only on the /api/users/[id] response (never the team-wide GET /api/users
  // list — it's a bearer secret for that person's .ics feed), so it's fetched fresh on click
  // rather than cached in the `users` list.
  const handleCopyCalendarLink = async () => {
    if (!currentUserId) return;
    const res = await fetch(`/api/users/${currentUserId}`);
    if (!res.ok) {
      showToast('Could not load your calendar link.');
      return;
    }
    const me = await res.json();
    const url = `${window.location.origin}/api/calendar/${me.calendarToken}`;
    await navigator.clipboard.writeText(url);
    showToast('Calendar feed link copied — paste it into Google/Apple/Outlook calendar as a subscription.');
  };

  // Global Ctrl+Z / Ctrl+Shift+Z undo/redo. Skipped while focus is inside an editable element so
  // the browser's own native text-undo keeps working there instead of being hijacked — same
  // `keydown` + cleanup shape as FloatingPopover.tsx's Escape handler, the only other global
  // keyboard listener in this app.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      const isEditable = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (isEditable) return;
      e.preventDefault();
      if (e.shiftKey) {
        useHistoryStore.getState().redo().then((label) => label && showToast(`Redid: ${label}`));
      } else {
        useHistoryStore.getState().undo().then((label) => label && showToast(`Undid: ${label}`));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Global Ctrl+K / Cmd+K command palette. Deliberately no "skip while focus is editable" guard
  // (unlike the undo/redo listener above) — a command palette needs to open from anywhere,
  // including mid-typing in another field, same as Linear/Notion/Slack's Cmd+K.
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setCommandPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Re-numbers one sibling group's `order` field after a drag-to-reorder, same pattern as
  // `handleStatusDragEnd` below: move the dragged item to the target's index via `arrayMove`,
  // then persist any index that actually changed.
  const reorderFolderSiblings = (space: HierarchySpace, draggedId: string, targetId: string) => {
    const dragged = space.folders.find((f) => f.id === draggedId);
    if (!dragged) return;
    const siblings = space.folders.filter((f) => f.parentId === dragged.parentId).sort((a, b) => a.order - b.order);
    const oldIndex = siblings.findIndex((f) => f.id === draggedId);
    const newIndex = siblings.findIndex((f) => f.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;
    useHistoryStore.getState().transaction('Reorder folders', () => {
      arrayMove(siblings, oldIndex, newIndex).forEach((f, index) => {
        if (f.order !== index) updateFolder(space.id, f.id, { order: index });
      });
    });
  };

  const reorderListSiblings = (space: HierarchySpace, draggedId: string, targetId: string) => {
    const dragged = space.lists.find((l) => l.id === draggedId);
    if (!dragged) return;
    const siblings = space.lists.filter((l) => l.folderId === dragged.folderId).sort((a, b) => a.order - b.order);
    const oldIndex = siblings.findIndex((l) => l.id === draggedId);
    const newIndex = siblings.findIndex((l) => l.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;
    useHistoryStore.getState().transaction('Reorder lists', () => {
      arrayMove(siblings, oldIndex, newIndex).forEach((l, index) => {
        if (l.order !== index) reorderList(space.id, l.id, index);
      });
    });
  };

  // Same shape as reorderFolderSiblings/reorderListSiblings, for the Docs tab's DocFolder/Doc tree.
  const reorderDocFolderSiblings = (space: HierarchySpace, draggedId: string, targetId: string) => {
    const dragged = space.docFolders.find((f) => f.id === draggedId);
    if (!dragged) return;
    const siblings = space.docFolders.filter((f) => f.parentId === dragged.parentId).sort((a, b) => a.order - b.order);
    const oldIndex = siblings.findIndex((f) => f.id === draggedId);
    const newIndex = siblings.findIndex((f) => f.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;
    useHistoryStore.getState().transaction('Reorder doc folders', () => {
      arrayMove(siblings, oldIndex, newIndex).forEach((f, index) => {
        if (f.order !== index) updateDocFolder(space.id, f.id, { order: index });
      });
    });
  };

  const reorderSpaceDocSiblings = (space: HierarchySpace, draggedId: string, targetId: string) => {
    const dragged = space.spaceDocs.find((d) => d.id === draggedId);
    if (!dragged) return;
    const siblings = space.spaceDocs.filter((d) => d.folderId === dragged.folderId).sort((a, b) => a.order - b.order);
    const oldIndex = siblings.findIndex((d) => d.id === draggedId);
    const newIndex = siblings.findIndex((d) => d.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;
    useHistoryStore.getState().transaction('Reorder documents', () => {
      arrayMove(siblings, oldIndex, newIndex).forEach((d, index) => {
        if (d.order !== index) reorderSpaceDoc(space.id, d.id, index);
      });
    });
  };

  // Spaces are always top-level (no nesting, no cross-Space case) — plain flat reorder among
  // every Space in the workspace. Takes an explicit above/below position (rather than relying on
  // arrayMove's implicit "lands at the target's index" behavior) so it always matches whatever the
  // drop indicator last showed, regardless of which direction the drag came from — see
  // handleTaskDragOver's "nested" case, where hovering deep in a tall Space's own Folder/List tree
  // always means "below this Space" even if the drag happened to approach from below it.
  const reorderSpaceRelativeTo = (draggedId: string, targetId: string, position: 'above' | 'below') => {
    const allSpaces = workspaces.flatMap((w) => w.spaces).sort((a, b) => a.order - b.order);
    const dragged = allSpaces.find((s) => s.id === draggedId);
    const withoutDragged = allSpaces.filter((s) => s.id !== draggedId);
    const targetIndex = withoutDragged.findIndex((s) => s.id === targetId);
    if (!dragged || targetIndex === -1) return;
    const insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
    const next = [...withoutDragged.slice(0, insertAt), dragged, ...withoutDragged.slice(insertAt)];
    useHistoryStore.getState().transaction('Reorder spaces', () => {
      next.forEach((s, index) => {
        if (s.order !== index) reorderSpace(s.id, index);
      });
    });
  };

  const handleTaskDragStart = (event: DragStartEvent) => {
    const draggedId = event.active.id as string;

    if (draggedId.startsWith('space-drag:')) {
      const spaceId = draggedId.slice('space-drag:'.length);
      const space = workspaces.flatMap((w) => w.spaces).find((s) => s.id === spaceId);
      if (space) setActiveDragEntity({ kind: 'space', name: space.name, color: space.color });
      return;
    }

    if (draggedId.startsWith('folder-drag:') || draggedId.startsWith('list-drag:')) {
      const isFolder = draggedId.startsWith('folder-drag:');
      const treeId = isFolder ? draggedId.slice('folder-drag:'.length) : draggedId.slice('list-drag:'.length);
      const allSpaces = workspaces.flatMap((w) => w.spaces);
      if (isFolder) {
        const folder = allSpaces.flatMap((s) => s.folders).find((f) => f.id === treeId);
        if (folder) setActiveDragEntity({ kind: 'folder', name: folder.name, color: folder.color });
      } else {
        const list = allSpaces.flatMap((s) => s.lists).find((l) => l.id === treeId);
        if (list) setActiveDragEntity({ kind: 'list', name: list.name });
      }
      return;
    }

    if (draggedId.startsWith('person-drag:')) {
      const userId = draggedId.slice('person-drag:'.length);
      const person = users.find((u) => u.id === userId);
      if (person) setActiveDragEntity({ kind: 'person', name: person.name, color: person.color, initials: person.initials });
      return;
    }

    if (draggedId.startsWith('docfolder-drag:') || draggedId.startsWith('spacedoc-drag:')) {
      const isDocFolder = draggedId.startsWith('docfolder-drag:');
      const treeId = isDocFolder ? draggedId.slice('docfolder-drag:'.length) : draggedId.slice('spacedoc-drag:'.length);
      const allSpaces = workspaces.flatMap((w) => w.spaces);
      if (isDocFolder) {
        const folder = allSpaces.flatMap((s) => s.docFolders).find((f) => f.id === treeId);
        if (folder) setActiveDragEntity({ kind: 'docfolder', name: folder.name, color: folder.color });
      } else {
        const doc = allSpaces.flatMap((s) => s.spaceDocs).find((d) => d.id === treeId);
        if (doc) setActiveDragEntity({ kind: 'spacedoc', name: doc.title || 'Untitled' });
      }
      return;
    }

    const task = tasks.find((t) => t.id === draggedId) || null;
    setActiveDragTask(task);
  };

  // Live "where will this land" feedback for Space reordering — the actual reorder-on-drop
  // (`reorderSpaceRelativeTo`) always matches whatever this last showed. Tracks WHICH row is
  // currently the closest drop target (dnd-kit only re-fires `onDragOver` when that target
  // changes, not on every pointer move, so the exact pointer position at that moment isn't
  // reliable — see the `pointermove` listener below for the actual above/below computation).
  //
  // A Space's own droppable (`space:${id}`) only covers its header row — a Space with an
  // expanded Folder/List tree underneath is visually "tall", but everywhere below the header is
  // covered by ITS OWN folders'/lists' droppables instead. So dragging a Space down past a tall
  // one spends most of the drag hovering `folder-drop:`/`list:` ids, not `space:` — treat any of
  // those as "still hovering this Space's block" (look up which Space the folder/list belongs
  // to), and since you only ever get there by dragging into/through the space's own content
  // (never by hovering its header), always resolve that as "below" this Space, with the
  // indicator landing after its last Folder/List — never "above", which would visually land
  // in the middle of its own tree instead of between two Spaces.
  const handleTaskDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!active || !over) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      return;
    }
    const draggedId = active.id as string;
    const overId = over.id as string;
    if (!draggedId.startsWith('space-drag:')) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      return;
    }
    const spaceId = draggedId.slice('space-drag:'.length);

    if (overId.startsWith('space:')) {
      const targetId = overId.slice('space:'.length);
      if (targetId === spaceId || !over.rect) {
        spaceOverRef.current = null;
        setSpaceDropIndicator(null);
        return;
      }
      spaceOverRef.current = { mode: 'header', targetId, top: over.rect.top, height: over.rect.height };
      return;
    }

    let nestedTargetId: string | null = null;
    const allSpaces = workspaces.flatMap((w) => w.spaces);
    if (overId.startsWith('folder-drop:')) {
      const folderId = overId.slice('folder-drop:'.length);
      nestedTargetId = allSpaces.find((s) => s.folders.some((f) => f.id === folderId))?.id ?? null;
    } else if (overId.startsWith('list:')) {
      const listId = overId.slice('list:'.length);
      nestedTargetId = allSpaces.find((s) => s.lists.some((l) => l.id === listId))?.id ?? null;
    }
    if (!nestedTargetId || nestedTargetId === spaceId) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      return;
    }
    spaceOverRef.current = { mode: 'nested', targetId: nestedTargetId };
  };

  // Continuous pointer tracking while a Space is being dragged — `onDragOver` alone only tells us
  // *which* row is closest, not where within it, so the above/below split is recomputed on every
  // real pointermove against whatever `handleTaskDragOver` last recorded.
  useEffect(() => {
    if (activeDragEntity?.kind !== 'space') return;
    const onPointerMove = (e: PointerEvent) => {
      const over = spaceOverRef.current;
      if (!over) {
        setSpaceDropIndicator(null);
        return;
      }
      if (over.mode === 'nested') {
        setSpaceDropIndicator({ targetId: over.targetId, position: 'below' });
        return;
      }
      const overCenterY = over.top + over.height / 2;
      setSpaceDropIndicator({ targetId: over.targetId, position: e.clientY < overCenterY ? 'above' : 'below' });
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [activeDragEntity?.kind]);

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const droppedSpaceIndicator = spaceDropIndicator;
    setActiveDragTask(null);
    setActiveDragEntity(null);
    setSpaceDropIndicator(null);
    spaceOverRef.current = null;
    const { active, over } = event;
    if (!over) return;
    const draggedId = active.id as string;
    const overId = over.id as string;

    if (draggedId.startsWith('space-drag:')) {
      const spaceId = draggedId.slice('space-drag:'.length);
      // Drop exactly where the indicator last showed (handleTaskDragOver), rather than
      // re-deriving from `over` here — `over` alone can't tell "above" from "below", and for the
      // nested case (dragged past a tall Space's own Folder/List tree) can't tell which Space's
      // block it even belongs to without the same lookup handleTaskDragOver already did.
      if (droppedSpaceIndicator && droppedSpaceIndicator.targetId !== spaceId) {
        reorderSpaceRelativeTo(spaceId, droppedSpaceIndicator.targetId, droppedSpaceIndicator.position);
      }
      return;
    }

    if (draggedId.startsWith('person-drag:')) {
      const userId = draggedId.slice('person-drag:'.length);
      if (overId.startsWith('room-drop:')) {
        const target = overId.slice('room-drop:'.length);
        assignUserToRoom(userId, target === 'unassigned' ? null : target);
      }
      return;
    }

    // Sidebar tree reparenting (List/Folder dragged onto a Folder or a Space header) is a
    // completely different kind of drag from moving a task — dispatch on the id prefix.
    // (Both share this one DndContext: dnd-kit resolves useDraggable/useDroppable by nearest
    // ancestor DndContext, so a second nested context here would silently steal the existing
    // `list:`/`space:` task-drop targets instead of coexisting with them.)
    if (draggedId.startsWith('list-drag:') || draggedId.startsWith('folder-drag:')) {
      const isFolder = draggedId.startsWith('folder-drag:');
      const treeId = isFolder ? draggedId.slice('folder-drag:'.length) : draggedId.slice('list-drag:'.length);
      const allSpaces = workspaces.flatMap((w) => w.spaces);
      const space = allSpaces.find((s) => (isFolder ? s.folders.some((f) => f.id === treeId) : s.lists.some((l) => l.id === treeId)));
      if (!space) return;

      if (overId.startsWith('folder-drop:')) {
        const targetFolderId = overId.slice('folder-drop:'.length);
        // The target folder can live in a *different* Space than the one being dragged from —
        // search all Spaces, not just the source one, otherwise cross-Space moves silently do
        // nothing (this used to only ever look inside `space`, the source).
        const targetSpace = allSpaces.find((s) => s.folders.some((f) => f.id === targetFolderId));
        if (!targetSpace) return;
        if (isFolder) {
          if (targetSpace.id === space.id && (targetFolderId === treeId || isDescendantOf(space, targetFolderId, treeId))) return;
          const dragged = space.folders.find((f) => f.id === treeId);
          const target = targetSpace.folders.find((f) => f.id === targetFolderId);
          // Dropping a folder onto one that's ALREADY its sibling (same Space, same parent)
          // reorders it to that position instead of nesting it — nesting only kicks in when
          // dropped onto a folder somewhere else in the tree, which is the far more common
          // gesture there. A different Space can never be "already a sibling".
          if (dragged && target && targetSpace.id === space.id && dragged.parentId === target.parentId) {
            reorderFolderSiblings(space, treeId, targetFolderId);
          } else {
            moveFolder(space.id, treeId, targetFolderId, targetSpace.id);
          }
        } else {
          moveList(space.id, treeId, targetFolderId, targetSpace.id);
        }
      } else if (overId.startsWith('list:') && !isFolder) {
        // Lists can't "contain" anything, so a List dragged onto another List's `list:` target
        // (already registered for task-drops) has no competing meaning the way folder-onto-
        // folder does — for a list-drag specifically, it always means reorder. Scoped to same-
        // Space siblings only; moving a list to sit at a precise position in a *different*
        // Space's list is a rarer case left to the Space-header drop below (append, not exact
        // position) rather than adding cross-Space position math here.
        const targetListId = overId.slice('list:'.length);
        if (targetListId !== treeId && space.lists.some((l) => l.id === targetListId)) {
          reorderListSiblings(space, treeId, targetListId);
        }
      } else if (overId.startsWith('space:')) {
        const targetSpaceId = overId.slice('space:'.length);
        const targetSpace = allSpaces.find((s) => s.id === targetSpaceId);
        if (!targetSpace) return;
        if (isFolder) moveFolder(space.id, treeId, null, targetSpace.id);
        else moveList(space.id, treeId, null, targetSpace.id);
      }
      return;
    }

    // Docs tab's DocFolder/Doc tree reparenting — structurally identical to the List/Folder
    // branch above, with its own distinct id prefixes (docfolder-drag:/docfolder-drop:/spacedoc:)
    // so the two trees' ids never collide, even though they never render at the same time.
    if (draggedId.startsWith('spacedoc-drag:') || draggedId.startsWith('docfolder-drag:')) {
      const isDocFolder = draggedId.startsWith('docfolder-drag:');
      const treeId = isDocFolder ? draggedId.slice('docfolder-drag:'.length) : draggedId.slice('spacedoc-drag:'.length);
      const allSpaces = workspaces.flatMap((w) => w.spaces);
      const space = allSpaces.find((s) => (isDocFolder ? s.docFolders.some((f) => f.id === treeId) : s.spaceDocs.some((d) => d.id === treeId)));
      if (!space) return;

      if (overId.startsWith('docfolder-drop:')) {
        const targetFolderId = overId.slice('docfolder-drop:'.length);
        const targetSpace = allSpaces.find((s) => s.docFolders.some((f) => f.id === targetFolderId));
        if (!targetSpace) return;
        if (isDocFolder) {
          if (targetSpace.id === space.id && (targetFolderId === treeId || isDescendantOfDocFolder(space, targetFolderId, treeId))) return;
          const dragged = space.docFolders.find((f) => f.id === treeId);
          const target = targetSpace.docFolders.find((f) => f.id === targetFolderId);
          if (dragged && target && targetSpace.id === space.id && dragged.parentId === target.parentId) {
            reorderDocFolderSiblings(space, treeId, targetFolderId);
          } else {
            moveDocFolder(space.id, treeId, targetFolderId, targetSpace.id);
          }
        } else {
          moveSpaceDoc(space.id, treeId, targetFolderId, targetSpace.id);
        }
      } else if (overId.startsWith('spacedoc:') && !isDocFolder) {
        const targetDocId = overId.slice('spacedoc:'.length);
        if (targetDocId !== treeId && space.spaceDocs.some((d) => d.id === targetDocId)) {
          reorderSpaceDocSiblings(space, treeId, targetDocId);
        }
      } else if (overId.startsWith('space:')) {
        const targetSpaceId = overId.slice('space:'.length);
        const targetSpace = allSpaces.find((s) => s.id === targetSpaceId);
        if (!targetSpace) return;
        if (isDocFolder) moveDocFolder(space.id, treeId, null, targetSpace.id);
        else moveSpaceDoc(space.id, treeId, null, targetSpace.id);
      }
      return;
    }

    if (overId.startsWith('task:')) {
      const targetId = overId.slice('task:'.length);
      if (targetId !== draggedId) optimisticSetParent(draggedId, targetId);
    } else if (overId.startsWith('list:')) {
      optimisticSetList(draggedId, overId.slice('list:'.length));
    } else if (overId.startsWith('folder-drop:') || overId.startsWith('space:')) {
      // Dropping a task onto a Folder/Space (rather than a specific List) has no single obvious
      // destination when there's more than one List recursively inside — rather than silently
      // guessing "whichever one happened to come first," offer a small picker (labeled with each
      // List's folder path) so the drop actually lands where the user meant. If there's exactly
      // one List, skip the picker and just use it — no need to ask when there's no real choice.
      const isFolder = overId.startsWith('folder-drop:');
      const targetId = isFolder ? overId.slice('folder-drop:'.length) : overId.slice('space:'.length);
      const space = isFolder
        ? workspaces.flatMap((w) => w.spaces).find((s) => s.folders.some((f) => f.id === targetId))
        : workspaces.flatMap((w) => w.spaces).find((s) => s.id === targetId);
      const targetName = isFolder
        ? workspaces.flatMap((w) => w.spaces).flatMap((s) => s.folders).find((f) => f.id === targetId)?.name
        : space?.name;
      const listIds = space ? collectListIdsUnder(space, isFolder ? targetId : null) : [];
      if (listIds.length === 0) {
        showToast(`"${targetName ?? (isFolder ? 'This folder' : 'This space')}" has no list yet — add one before moving tasks in here.`);
      } else if (listIds.length === 1) {
        optimisticSetList(draggedId, listIds[0]);
      } else if (space) {
        const rect = active.rect.current.translated;
        setTaskListPicker({
          x: rect ? rect.left : 200,
          y: rect ? rect.top : 200,
          taskId: draggedId,
          options: listIds.map((id) => ({ id, label: listPathLabel(space, id) })),
        });
      }
    }
  };

  const [folderToDelete, setFolderToDelete] = useState<HierarchyFolder | null>(null);

  // Jumping from a clicked @-mention chip — mirrors CommandPalette's activate() exactly (same
  // setter calls, same order for the 'doc' case) so a mention lands wherever the search palette
  // would've taken you for the same entity.
  const jumpToMention = (kind: MentionKind, id: string) => {
    if (kind === 'task') {
      setModalTaskStack([id]);
    } else if (kind === 'doc') {
      const doc = workspaces.flatMap((w) => w.spaces).flatMap((s) => s.spaceDocs).find((d) => d.id === id);
      const space = workspaces.flatMap((w) => w.spaces).find((s) => s.spaceDocs.some((d) => d.id === id));
      if (!doc || !space) return;
      setActiveView('docs');
      setNavigation(space.id, []);
      setDocsNavigation(doc.folderId, id);
    } else if (kind === 'user') {
      setActiveView('office');
      setActiveOfficeUserId(id);
    }
  };

  // ---- Docs (autosave) ----
  // A freshly-opened existing doc defaults to view mode (chips render); a brand-new empty one
  // opens straight into edit mode so there's no empty, unclickable box between creating it and
  // actually typing into it.
  useEffect(() => {
    if (!activeDocId) return;
    const doc = activeTaskDocs.find((d) => d.id === activeDocId);
    setDocEditorEditing(!doc || doc.content === '');
  }, [activeDocId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entering edit mode (click on the view-mode chips, or the effect above for a new doc) focuses
  // the textarea with the cursor at the end — precise click-to-caret mapping isn't worth building.
  useEffect(() => {
    if (docEditorEditing && docTextareaRef.current) {
      const el = docTextareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [docEditorEditing]);

  const handleDocDraftChange = (value: string) => {
    setDocDraft(value);
    if (!activeDocId || !activeModalTaskId) return;
    setDocSaveStatus('saving');
    if (docSaveTimer.current) clearTimeout(docSaveTimer.current);
    docSaveTimer.current = setTimeout(() => {
      updateDoc(activeDocId, activeModalTaskId, { content: value });
      setDocSaveStatus('saved');
    }, 600);
  };

  const captureDocEditBaseline = () => {
    const doc = activeTaskDocs.find((d) => d.id === activeDocId);
    if (doc) docEditBaselineRef.current = { docId: doc.id, title: doc.title, content: doc.content };
  };

  // Fires at most once per edit session (bounded by focus→blur), for whichever of title/content
  // actually changed — not on every autosave tick, which would flood the activity feed with one
  // entry per debounce firing during a single continuous edit.
  const commitDocEditActivity = () => {
    useHistoryStore.getState().endCoalesce();
    const baseline = docEditBaselineRef.current;
    const doc = activeTaskDocs.find((d) => d.id === activeDocId);
    if (!baseline || !doc || baseline.docId !== doc.id || !activeModalTaskId) return;
    if (doc.title !== baseline.title) {
      logActivity(activeModalTaskId, `Dokument omdøpt til «${doc.title}»`, 'docEdited');
    } else if (docDraft !== baseline.content) {
      logActivity(activeModalTaskId, `Dokument redigert: «${doc.title}»`, 'docEdited');
    }
    docEditBaselineRef.current = { docId: doc.id, title: doc.title, content: docDraft };
  };

  const handleNewDoc = async () => {
    if (!activeModalTaskId) return;
    const doc = await createDoc(activeModalTaskId);
    if (doc) {
      setActiveDocId(doc.id);
      setDocDraft(doc.content);
    }
  };

  const docSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDocDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeModalTaskId) return;
    const ids = activeTaskDocs.map((d) => d.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderDocs(activeModalTaskId, arrayMove(ids, oldIndex, newIndex));
  };

  // ---- Docs tab: full-page editor (autosave), same debounce shape as the task-modal one above ----
  const activeStandaloneDoc = currentSpace?.spaceDocs.find((d) => d.id === activeStandaloneDocId) ?? null;

  useEffect(() => {
    if (activeStandaloneDoc) {
      setSpaceDocDraft(activeStandaloneDoc.content);
      setSpaceDocEditorEditing(activeStandaloneDoc.content === '');
    }
  }, [activeStandaloneDocId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (spaceDocEditorEditing && spaceDocTextareaRef.current) {
      const el = spaceDocTextareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [spaceDocEditorEditing]);

  const handleSpaceDocDraftChange = (value: string) => {
    setSpaceDocDraft(value);
    if (!activeStandaloneDocId || !currentSpace) return;
    setSpaceDocSaveStatus('saving');
    if (spaceDocSaveTimer.current) clearTimeout(spaceDocSaveTimer.current);
    spaceDocSaveTimer.current = setTimeout(() => {
      updateSpaceDoc(activeStandaloneDocId, currentSpace.id, { content: value });
      setSpaceDocSaveStatus('saved');
    }, 600);
  };

  const handleNewSpaceDoc = async () => {
    if (!currentSpace) return;
    const doc = await createSpaceDoc(currentSpace.id, activeDocFolderId, {});
    if (doc) {
      setDocsNavigation(activeDocFolderId, doc.id);
      setSpaceDocDraft(doc.content);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-blue-400 font-mono text-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading RobUp...</span>
        </div>
      </div>
    );
  }

  const activeModalTask = activeModalTaskId ? tasks.find((t) => t.id === activeModalTaskId) ?? null : null;
  const currentSubtasks = activeModalTask ? tasks.filter((t) => t.parentId === activeModalTask.id) : [];
  const activeComments = activeModalTask ? comments[activeModalTask.id] || [] : [];
  const allListsFlat = workspaces.flatMap((ws) => ws.spaces.flatMap((s) => s.lists.map((l) => ({ ...l, spaceName: s.name }))));

  // The task's own Space (via its List) — scopes the "Link existing doc" picker to standalone
  // docs from the same Space, rather than an overwhelming cross-Space list.
  const activeModalTaskSpace = activeModalTask
    ? workspaces.flatMap((w) => w.spaces).find((s) => s.lists.some((l) => l.id === activeModalTask.listId))
    : null;
  const linkableSpaceDocs = activeModalTaskSpace ? activeModalTaskSpace.spaceDocs.filter((d) => d.taskId === null) : [];

  // Stable serialization of the selected List set — order-independent so toggling the same
  // Lists in a different click order doesn't spuriously read as "different navigation."
  const activeListIdsKey = [...activeListIds].sort().join(',');

  // Only changes on actual navigation (space/list/archive/modal open) — used as the
  // AnimatePresence key so rows don't play a false disintegrate/slide-in animation
  // when we're just switching which list of tasks is shown.
  const taskListNavKey = `${activeSpaceId}|${activeListIdsKey}|${showArchived}|${modalTaskStack.length > 0}`;

  // Scopes TaskRow's shared layoutId to the current Space/List — Framer Motion matches
  // layoutId globally, so without this a task visible in two different nav contexts
  // (e.g. "Everything" and its own List) would FLIP-animate between their screen
  // positions when switching views instead of just snapping. Same task id, same nav
  // context (e.g. clicking a row open) still shares an id, so the row-into-modal
  // expand animation is unaffected.
  const navScope = `${activeSpaceId}|${activeListIdsKey}`;

  // Which scope the currently-open task modal's layoutId should match: the main list's
  // navScope if opened from there, or the parent task's subtask-table scope if opened
  // by drilling into a subtask (so the "row grows into modal" animation still connects
  // to whichever row was actually clicked).
  const modalLayoutScope =
    modalTaskStack.length > 1 ? `subtasks-${modalTaskStack[modalTaskStack.length - 2]}` : navScope;

  return (
    <DndContext sensors={taskSensors} collisionDetection={closestCenter} onDragStart={handleTaskDragStart} onDragOver={handleTaskDragOver} onDragEnd={handleTaskDragEnd}>
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden select-none">
      {/* ================= ICON RAIL ================= */}
      <nav className="w-14 bg-neutral-950 border-r border-neutral-800/80 flex flex-col items-center py-4 gap-2 shrink-0 select-none">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20 mb-3">
          R
        </div>
        <button
          onClick={() => setActiveView('board')}
          title="Tasks"
          className={`w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
            activeView === 'board' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200'
          }`}
        >
          <ListIcon className="w-4 h-4" />
          <span className="text-[8px] font-medium leading-none">Tasks</span>
        </button>
        <button
          onClick={() => setActiveView('calendar')}
          title="Planner"
          className={`w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
            activeView === 'calendar' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span className="text-[8px] font-medium leading-none">Planner</span>
        </button>
        <button
          onClick={() => setActiveView('docs')}
          title="Docs"
          className={`w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
            activeView === 'docs' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[8px] font-medium leading-none">Docs</span>
        </button>
        <button
          onClick={() => {
            // Always resets to the team grid, even if Office was already the active tab — same
            // "click the rail icon to go home" expectation as clicking a nav icon in most apps,
            // not just a tab switch. Without this, clicking Office while already viewing a
            // person's page did nothing (setActiveView('office') is a no-op when already there).
            setActiveView('office');
            setActiveOfficeUserId(null);
          }}
          title="Office"
          className={`w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
            activeView === 'office' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span className="text-[8px] font-medium leading-none">Office</span>
        </button>
      </nav>

      {/* ================= LEFT MENU (SIDEBAR) ================= */}
      <aside className="w-64 bg-neutral-900/90 border-r border-neutral-800/80 flex flex-col justify-between shrink-0 select-none">
        <div>
          <div className="px-4 py-4 border-b border-neutral-800/80">
            <h1 className="font-bold tracking-tight text-white leading-tight text-sm">
              {workspaces[0]?.name || 'RobUp Workspace'}
            </h1>
            <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Zero-Cloud SQLite
            </p>
          </div>

          <div className="px-3 pt-3">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full flex items-center gap-2 bg-neutral-950/60 rounded border border-neutral-800/80 px-3 py-1.5 text-[11px] text-neutral-500 hover:border-neutral-700 hover:text-neutral-300 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Search...</span>
              <span className="text-[9px] font-mono text-neutral-600">Ctrl+K</span>
            </button>
          </div>

          <div className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-140px)]">
            {activeView === 'board' && (
            <button
              onClick={() => {
                setModalTaskStack([]);
                setNavigation('everything', []);
              }}
              className={`w-full text-left px-3 py-2 rounded text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                activeSpaceId === 'everything' && modalTaskStack.length === 0
                  ? 'bg-neutral-800 text-blue-400'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> Everything
              </span>
              <span className="text-[10px] bg-neutral-950/60 px-2 py-0.5 rounded font-mono text-neutral-400">
                {tasks.filter((t) => t.parentId === null && !t.archived).length}
              </span>
            </button>
            )}

            {activeView === 'office' ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-2">Team</p>
                {users.map((u) => {
                  const count = tasks.filter((t) => !t.archived && t.assignees.some((a) => a.id === u.id)).length;
                  const isActive = activeOfficeUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => setActiveOfficeUserId(u.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-neutral-800 text-blue-400 font-semibold' : 'text-neutral-300 hover:bg-neutral-800/40'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: u.color }}
                        >
                          {u.initials}
                        </span>
                        <span className="truncate">{u.name}</span>
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono shrink-0">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  {activeView === 'calendar' ? 'Filter Spaces & Lists' : 'Spaces & Lists'}
                </p>
                {activeView === 'calendar' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setCalendarVisibleListIds(
                          new Set(workspaces.flatMap((w) => w.spaces.flatMap((s) => s.lists.map((l) => l.id))))
                        )
                      }
                      className="text-[9px] text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setCalendarVisibleListIds(new Set())}
                      className="text-[9px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                    >
                      None
                    </button>
                  </div>
                )}
                {activeView === 'board' && !creatingSpace && (
                  <button
                    onClick={() => setCreatingSpace(true)}
                    title="New space"
                    className="text-neutral-500 hover:text-blue-400 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {creatingSpace && (
                <input
                  autoFocus
                  value={newSpaceDraft}
                  onChange={(e) => setNewSpaceDraft(e.target.value)}
                  onBlur={commitNewSpace}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      setNewSpaceDraft('');
                      setCreatingSpace(false);
                    }
                  }}
                  placeholder="Space name..."
                  className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                />
              )}
              {[...(workspaces[0]?.spaces ?? [])].sort((a, b) => a.order - b.order).map((space: HierarchySpace) => {
                const isSpaceActive = activeView === 'board' && activeSpaceId === space.id && activeListIds.size === 0 && modalTaskStack.length === 0;
                const spaceListIds = collectListIdsUnder(space, null);
                const spaceTasksCount = tasks.filter(
                  (t) => t.parentId === null && !t.archived && spaceListIds.includes(t.listId)
                ).length;
                const spaceAllChecked = spaceListIds.length > 0 && spaceListIds.every((id) => calendarVisibleListIds.has(id));
                const spaceSomeChecked = spaceListIds.some((id) => calendarVisibleListIds.has(id));

                return (
                  <div key={space.id} className="space-y-1">
                    {spaceDropIndicator?.targetId === space.id && spaceDropIndicator.position === 'above' && (
                      <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
                    )}
                    <DroppableSidebarItem id={`space:${space.id}`} dragId={`space-drag:${space.id}`}>
                      {(isOver, drag) => (
                        <button
                          {...drag.attributes}
                          {...drag.listeners}
                          onClick={() => {
                            if (activeView === 'calendar') {
                              toggleCalendarSpace(space);
                            } else if (activeView === 'docs') {
                              setNavigation(space.id, []);
                              setDocsNavigation(null, null);
                            } else {
                              setModalTaskStack([]);
                              setNavigation(space.id, []);
                            }
                          }}
                          onContextMenu={(e) => openSpaceMenu(e, space)}
                          className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition flex items-center justify-between cursor-pointer group ${
                            isSpaceActive
                              ? 'bg-neutral-800 text-blue-400 font-semibold border-l-2 border-blue-500'
                              : activeView === 'calendar' && spaceAllChecked
                              ? 'text-blue-400'
                              : 'text-neutral-300 hover:bg-neutral-800/40'
                          } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''}`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            {activeView === 'calendar' && (
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                  spaceAllChecked
                                    ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'
                                    : spaceSomeChecked
                                    ? 'bg-blue-500/10 border-blue-500/40'
                                    : 'border-neutral-600'
                                }`}
                              >
                                {spaceAllChecked && <Check className="w-2.5 h-2.5" />}
                              </span>
                            )}
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: space.color || '#6366f1' }}></span>
                            <span className="truncate">{space.name}</span>
                          </span>
                          {activeView === 'board' && <span className="text-[10px] text-neutral-500 font-mono">{spaceTasksCount}</span>}
                        </button>
                      )}
                    </DroppableSidebarItem>

                    {activeView === 'docs' ? (
                      <DocFolderTree
                        space={space}
                        activeDocFolderId={activeSpaceId === space.id ? activeDocFolderId : null}
                        activeStandaloneDocId={activeSpaceId === space.id ? activeStandaloneDocId : null}
                        onNavigateFolder={(folderId) => {
                          setNavigation(space.id, []);
                          setDocsNavigation(folderId, null);
                        }}
                        onOpenDoc={(docId) => {
                          setNavigation(space.id, []);
                          setDocsNavigation(activeDocFolderId, docId);
                        }}
                        onDeleteFolderRequest={setDocFolderToDelete}
                        onDeleteDocRequest={setSpaceDocToDelete}
                      />
                    ) : (
                      <FolderTree
                        space={space}
                        tasks={tasks}
                        activeView={activeView}
                        activeListIds={activeListIds}
                        calendarVisibleListIds={calendarVisibleListIds}
                        onNavigateList={(e, listId) => {
                          setModalTaskStack([]);
                          handleListClick(e, space, listId);
                        }}
                        toggleCalendarList={toggleCalendarList}
                        toggleCalendarFolder={(folderId) => toggleCalendarFolder(space, folderId)}
                        onDeleteFolderRequest={setFolderToDelete}
                        onFolderContextMenu={openFolderMenu}
                        renameFolderId={renameFolderId}
                        onRenameFolderHandled={() => setRenameFolderId(null)}
                        onListContextMenu={(e, list) => openListMenu(e, list, space.id)}
                        onDeleteListRequest={(list) => setListToDelete({ list, spaceId: space.id })}
                        renameListId={renameListId}
                        onRenameListHandled={() => setRenameListId(null)}
                      />
                    )}
                    {spaceDropIndicator?.targetId === space.id && spaceDropIndicator.position === 'below' && (
                      <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>

        <div className="p-3 m-3 space-y-2">
          <div
            className="w-full flex items-center gap-2 bg-neutral-950/60 rounded border border-neutral-800/80 px-3 py-2 text-[11px] text-neutral-300"
            title="Who you're acting as — attributed on activity you generate (task creation, edits, etc). Stand-in for real login/sessions, coming later."
          >
            {(() => {
              const me = users.find((u) => u.id === currentUserId);
              return me ? (
                <span
                  className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: me.color }}
                >
                  {me.initials}
                </span>
              ) : (
                <UserCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              );
            })()}
            <select
              value={currentUserId ?? ''}
              onChange={(e) => setCurrentUserId(e.target.value || null)}
              className="flex-1 bg-transparent text-[11px] text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="">You are: (none)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  You are: {u.name}
                </option>
              ))}
            </select>
            {currentUserId && (
              <button
                onClick={handleCopyCalendarLink}
                title="Copy your personal .ics calendar feed link"
                className="shrink-0 p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setTeamOpen(true)}
            className="w-full flex items-center justify-between bg-neutral-950/60 rounded border border-neutral-800/80 px-3 py-2 text-[11px] text-neutral-300 hover:border-neutral-700 cursor-pointer"
          >
            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Team</span>
            <span className="text-neutral-500 font-mono">{users.length}</span>
          </button>
          <div className="bg-neutral-950/60 rounded border border-neutral-800/80 px-3 py-2 text-[11px] text-neutral-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> RobUp</span>
            <span className="text-emerald-400 font-mono">Flat List</span>
          </div>
        </div>
      </aside>

      {/* ================= MAIN AREA ================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 relative">
        <header className="border-b border-neutral-800/80 bg-neutral-900/40 shrink-0">
          <div className="h-11 px-6 flex items-center justify-between border-b border-neutral-800/40">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-neutral-500">Workspace</span>
              <span className="text-neutral-600">/</span>
              {activeView === 'office' ? (
                <>
                  <button
                    onClick={() => setActiveOfficeUserId(null)}
                    className={`flex items-center gap-1.5 cursor-pointer ${
                      activeOfficeUserId ? 'text-neutral-500 hover:text-neutral-300' : 'text-blue-400 font-semibold'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" /> Office
                  </button>
                  {activeOfficeUserId && (
                    <>
                      <span className="text-neutral-600">/</span>
                      <span className="text-neutral-300 font-semibold">{users.find((u) => u.id === activeOfficeUserId)?.name}</span>
                    </>
                  )}
                </>
              ) : (
                <span className={`flex items-center gap-1.5 ${activeSpaceId === 'everything' ? 'text-blue-400 font-semibold' : 'text-neutral-300'}`}>
                  {activeSpaceId === 'everything' ? (
                    <>
                      <Globe className="w-3.5 h-3.5" /> Everything
                    </>
                  ) : (
                    currentSpace?.name
                  )}
                </span>
              )}
              {activeView === 'board' && activeListIds.size > 0 && (
                <>
                  <span className="text-neutral-600">/</span>
                  <span className="text-white font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
                    {activeListIds.size === 1
                      ? currentSpace?.lists.find((l) => l.id === [...activeListIds][0])?.name
                      : `${activeListIds.size} lists`}
                  </span>
                </>
              )}
            </div>

            {activeView === 'board' && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`text-[11px] px-2.5 py-1 rounded border cursor-pointer transition flex items-center gap-1.5 ${
                  showArchived
                    ? 'bg-neutral-800 text-blue-400 border-neutral-700'
                    : 'text-neutral-400 border-neutral-800 hover:bg-neutral-800/60'
                }`}
              >
                <Archive className="w-3.5 h-3.5" /> {showArchived ? 'Viewing archive' : 'Archive'}
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6" onClick={closeAllMenus}>
          <div className="max-w-6xl mx-auto space-y-2">
            {activeView === 'board' && !showingSpaceHome && (
            <div className="flex items-center justify-between">
              <div className="text-neutral-500 font-mono text-[10px]">{filteredTasks.length} tasks</div>
              <div className="flex items-center gap-1.5">
                {activeView === 'board' && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!currentSpace) return;
                      setColumnMenuOpen(!columnMenuOpen);
                      setStatusMenuOpen(false);
                    }}
                    disabled={!currentSpace}
                    title={!currentSpace ? 'Select a specific Space to customize columns' : ''}
                    className={`text-[11px] rounded px-2.5 py-1 flex items-center gap-1 border ${
                      currentSpace
                        ? 'text-neutral-300 bg-neutral-900 border-neutral-800 hover:border-neutral-700 cursor-pointer'
                        : 'text-neutral-600 bg-neutral-900/50 border-neutral-800/50 cursor-not-allowed'
                    }`}
                  >
                    <Plus className="w-3 h-3" /> Column
                  </button>
                  {columnMenuOpen && currentSpace && (
                    <div onClick={(e) => e.stopPropagation()} className="absolute z-20 top-9 right-0 w-60 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-2 space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500 px-2 pb-1">Built-in (can be hidden, not deleted)</div>
                      {availableColumns.filter((c) => c.kind !== 'custom').map((col) => (
                        <label key={col.key} className="flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer">
                          <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                          {col.label}
                        </label>
                      ))}
                      {availableColumns.some((c) => c.kind === 'custom') && (
                        <div className="flex items-center gap-2 text-[10px] text-neutral-500 px-2 pt-2 pb-1 border-t border-neutral-800">Custom fields</div>
                      )}
                      {availableColumns.filter((c) => c.kind === 'custom').map((col) => (
                        <div key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800/60">
                          <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer flex-1">
                            <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                            {col.label}
                          </label>
                          <button onClick={() => col.field && setFieldEditTarget(col.field)} className="text-neutral-500 hover:text-blue-400 text-[10px] cursor-pointer">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteField(col.key, col.label)} className="text-neutral-500 hover:text-red-400 text-[10px] cursor-pointer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="border-t border-neutral-800 pt-2 mt-1">
                        {!newFieldOpen ? (
                          <button onClick={() => setNewFieldOpen(true)} className="w-full text-left text-[11px] text-blue-400 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer">
                            + New field
                          </button>
                        ) : (
                          <div className="space-y-1.5 px-1">
                            <input
                              autoFocus
                              value={newFieldName}
                              onChange={(e) => setNewFieldName(e.target.value)}
                              placeholder="Field name (e.g. Budget)"
                              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                            />
                            <select
                              value={newFieldType}
                              onChange={(e) => setNewFieldType(e.target.value as any)}
                              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-300"
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                              <option value="dropdown">Dropdown</option>
                            </select>
                            <div className="flex gap-1.5">
                              <button onClick={handleAddField} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] py-1 rounded cursor-pointer">
                                Create field
                              </button>
                              <button onClick={() => setNewFieldOpen(false)} className="text-[11px] text-neutral-400 px-2 cursor-pointer">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}

              </div>
            </div>
            )}

            {activeView === 'office' ? (
              <OfficePage
                users={users}
                activeUserId={activeOfficeUserId}
                workspaces={workspaces}
                tasks={tasks}
                statuses={statuses}
                onSelectUser={setActiveOfficeUserId}
                onOpenTask={(id) => setModalTaskStack([id])}
                onUpdatePhone={(userId, phone) => updateUser(userId, { phone })}
                onUpdateUserField={(userId, field, value) => updateUser(userId, { [field]: value })}
                onDeleteRoomRequest={setRoomToDelete}
              />
            ) : activeView === 'docs' ? (
              !currentSpace ? (
                <div className="text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
                  Pick a Space in the sidebar to browse its Docs.
                </div>
              ) : activeStandaloneDoc ? (
                <div className="max-w-3xl mx-auto space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setDocsNavigation(activeDocFolderId, null)}
                      className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                    >
                      &larr; Back to {currentSpace.name}
                    </button>
                    {spaceDocSaveStatus !== 'idle' && (
                      <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                        {spaceDocSaveStatus === 'saving' ? 'Saving...' : (<><Check className="w-3 h-3" /> Saved</>)}
                      </span>
                    )}
                  </div>
                  <div className="bg-neutral-900/60 border border-neutral-800/80 rounded p-6 space-y-3">
                    <input
                      value={activeStandaloneDoc.title}
                      onChange={(e) => updateSpaceDoc(activeStandaloneDoc.id, currentSpace.id, { title: e.target.value })}
                      className="w-full bg-transparent text-lg font-semibold text-white focus:outline-none"
                      placeholder="Document title"
                    />
                    {spaceDocEditorEditing ? (
                      <MentionTextarea
                        ref={spaceDocTextareaRef}
                        value={spaceDocDraft}
                        onChange={(e) => handleSpaceDocDraftChange(e.target.value)}
                        onBlur={() => setSpaceDocEditorEditing(false)}
                        rows={24}
                        placeholder="Write anything — saved automatically as you type..."
                        className="w-full bg-transparent text-sm text-neutral-300 focus:outline-none resize-y leading-relaxed"
                      />
                    ) : (
                      <div onClick={() => setSpaceDocEditorEditing(true)} className="min-h-[24em] cursor-text">
                        {spaceDocDraft ? (
                          <MentionText
                            text={spaceDocDraft}
                            onJump={jumpToMention}
                            className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed"
                          />
                        ) : (
                          <p className="text-sm text-neutral-600 italic leading-relaxed">
                            Write anything — saved automatically as you type...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-end mb-2">
                    <button
                      onClick={handleNewSpaceDoc}
                      className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded font-medium cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> New doc
                    </button>
                  </div>
                  <DocsBrowser
                    space={currentSpace}
                    folderId={activeDocFolderId}
                    onNavigateFolder={(folderId) => setDocsNavigation(folderId, null)}
                    onOpenDoc={(docId) => setDocsNavigation(activeDocFolderId, docId)}
                    onDeleteFolderRequest={setDocFolderToDelete}
                    onDeleteDocRequest={setSpaceDocToDelete}
                  />
                </>
              )
            ) : activeView === 'calendar' ? (
              <div className="h-[75vh]">
                <CalendarView
                  tasks={calendarFilteredTasks}
                  statuses={statuses}
                  onOpenTask={(id) => setModalTaskStack([id])}
                  onRequestCreateTask={(date) => {
                    setCreateTaskDefaultDate(date.toISOString());
                    setCreateTaskOpen(true);
                  }}
                />
              </div>
            ) : showingSpaceHome ? (
              <SpaceHome
                space={currentSpace!}
                tasks={tasks}
                onNavigateList={(listId) => setNavigation(currentSpace!.id, [listId])}
              />
            ) : (
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded overflow-x-auto shadow-sm">
              <div style={{ minWidth: tableMinWidth }}>
              <div
                className="grid items-center px-4 py-2.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-800 bg-neutral-950/40"
                style={{ gridTemplateColumns: rowGridTemplate }}
              >
                <div></div>
                <div></div>
                <div className="relative flex items-center pr-2">
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-neutral-300 cursor-pointer text-left">
                    Name <SortIcon field="name" />
                  </button>
                  <ColumnResizeHandle onResize={(d) => resizeColumn('name', d)} onReset={() => resetColumnWidth('name')} />
                </div>
                <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                  <SortableContext items={activeColumns.map((c) => c.key)} strategy={horizontalListSortingStrategy}>
                    {activeColumns.map((col) => (
                      <SortableColumnHeader
                        key={col.key}
                        col={col}
                        onToggleSort={() => (col.kind === 'startDate' || col.kind === 'dueDate' ? toggleSort(col.kind) : undefined)}
                        sortIcon={col.kind === 'startDate' || col.kind === 'dueDate' ? <SortIcon field={col.kind} /> : null}
                        onContextMenuOpen={(e) => setColumnMenu({ x: e.clientX, y: e.clientY, col })}
                        onResize={(d) => resizeColumn(col.key, d)}
                        onResetWidth={() => resetColumnWidth(col.key)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <div className="text-right">Action</div>
              </div>

              <div className="divide-y divide-neutral-800/50">
                <AnimatePresence mode="popLayout" initial={false} key={taskListNavKey}>
                  {filteredTasks.map((task) => (
                    <TaskRow
                      key={task._localId || task.id}
                      task={task}
                      navScope={navScope}
                      onOpen={() => setModalTaskStack([task.id])}
                      columns={activeColumns}
                      gridTemplate={rowGridTemplate}
                      statuses={statuses}
                      selectable
                      isSelected={selectedIds.has(task.id)}
                      onToggleSelect={() => toggleSelect(task.id)}
                      onContextMenu={openTaskMenu}
                      autoFocusRename={renamingTaskId === task.id}
                      onRenameHandled={() => setRenamingTaskId(null)}
                    />
                  ))}
                </AnimatePresence>

                {activeAdd ? (
                  <div className="p-2.5 bg-neutral-950/40 flex gap-2 items-center">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Type a title and press Enter..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAdd();
                        if (e.key === 'Escape') setActiveAdd(false);
                      }}
                      className="flex-1 bg-neutral-900 border border-blue-500/80 rounded px-3 py-1 text-xs text-white focus:outline-none"
                    />
                    <button onClick={handleQuickAdd} className="bg-blue-600 text-white text-xs px-3 py-1 rounded font-medium cursor-pointer">
                      Add
                    </button>
                    <button onClick={() => setActiveAdd(false)} className="text-neutral-400 text-xs px-2 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : (
                  !showArchived && (
                    <button
                      onClick={() => setActiveAdd(true)}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800/40 hover:text-blue-400 transition flex items-center gap-2 cursor-pointer"
                    >
                      <span className="font-bold text-blue-400">+</span> Add Task
                    </button>
                  )
                )}
              </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </main>

      {/* ================= BULK ACTION BAR ================= */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -tranneutral-x-1/2 z-40 bg-neutral-900 border border-neutral-700 rounded shadow-2xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-neutral-300 font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-neutral-700"></div>
          <button onClick={() => bulkArchive(true)} className="text-xs text-neutral-300 hover:text-white px-2 py-1 rounded hover:bg-neutral-800 cursor-pointer flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBulkMoveOpen(!bulkMoveOpen);
              }}
              className="text-xs text-neutral-300 hover:text-white px-2 py-1 rounded hover:bg-neutral-800 cursor-pointer flex items-center gap-1.5"
            >
              <FolderInput className="w-3.5 h-3.5" /> Move to...
            </button>
            {bulkMoveOpen && (
              <div onClick={(e) => e.stopPropagation()} className="absolute z-20 bottom-9 left-1/2 -tranneutral-x-1/2 w-56 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5 max-h-56 overflow-y-auto">
                {allListsFlat.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => bulkMoveToList(l.id)}
                    className="w-full text-left text-[11px] text-neutral-300 px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer"
                  >
                    <span className="text-neutral-500">{l.spaceName} /</span> {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={bulkDelete} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <div className="w-px h-5 bg-neutral-700"></div>
          <button onClick={clearSelection} className="text-xs text-neutral-500 hover:text-neutral-300 px-2 py-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================= CONTEXT MENU: TASK ================= */}
      {taskMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setTaskMenu(null)} onContextMenu={(e) => { e.preventDefault(); setTaskMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1" style={{ top: taskMenu.y, left: taskMenu.x }}>
            <button
              onClick={() => {
                setModalTaskStack([taskMenu.task.id]);
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Open
            </button>
            <button
              onClick={() => {
                setRenamingTaskId(taskMenu.task.id);
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                handleArchiveClick(taskMenu.task);
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              {taskMenu.task.archived ? (
                <>
                  <Undo2 className="w-3.5 h-3.5" /> Restore from archive
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark as done
                </>
              )}
            </button>
            <div className="border-t border-neutral-800 my-1"></div>
            <button onClick={() => handleDeleteTask(taskMenu.task)} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 cursor-pointer flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>
      )}

      {/* ================= CONTEXT MENU: SPACE ================= */}
      {spaceMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setSpaceMenu(null)} onContextMenu={(e) => { e.preventDefault(); setSpaceMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1" style={{ top: spaceMenu.y, left: spaceMenu.x }}>
            <button onClick={() => startEditSpace(spaceMenu.space)} className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2">
              <Pencil className="w-3.5 h-3.5" /> Edit appearance
            </button>
            <button
              onClick={() => {
                setSpaceToDelete(spaceMenu.space);
                setSpaceMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete space
            </button>
          </div>
        </>
      )}

      {/* ================= CONTEXT MENU: FOLDER ================= */}
      {folderMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setFolderMenu(null)} onContextMenu={(e) => { e.preventDefault(); setFolderMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1" style={{ top: folderMenu.y, left: folderMenu.x }}>
            <button onClick={() => startEditFolder(folderMenu.folder)} className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2">
              <Pencil className="w-3.5 h-3.5" /> Edit appearance
            </button>
            <button
              onClick={() => {
                setRenameFolderId(folderMenu.folder.id);
                setFolderMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                setFolderToDelete(folderMenu.folder);
                setFolderMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>
      )}

      {/* ================= CONTEXT MENU: LIST ================= */}
      {listMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setListMenu(null)} onContextMenu={(e) => { e.preventDefault(); setListMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1" style={{ top: listMenu.y, left: listMenu.x }}>
            <button
              onClick={() => startEditList(listMenu.list, listMenu.spaceId)}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit appearance
            </button>
            <button
              onClick={() => {
                setRenameListId(listMenu.list.id);
                setListMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                setListToDelete({ list: listMenu.list, spaceId: listMenu.spaceId });
                setListMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete list
            </button>
          </div>
        </>
      )}

      {/* ================= CONTEXT MENU: COLUMN ================= */}
      {columnMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setColumnMenu(null)} onContextMenu={(e) => { e.preventDefault(); setColumnMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1" style={{ top: columnMenu.y, left: columnMenu.x }}>
            <button
              onClick={() => {
                toggleColumn(columnMenu.col.key);
                setColumnMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <EyeOff className="w-3.5 h-3.5" /> Hide column
            </button>
            {columnMenu.col.kind === 'status' && (
              <button
                onClick={() => {
                  setStatusMenuOpen(true);
                  setColumnMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
              >
                <Palette className="w-3.5 h-3.5" /> Manage statuses
              </button>
            )}
            {columnMenu.col.kind === 'custom' && columnMenu.col.field && (
              <>
                <button
                  onClick={() => {
                    setFieldEditTarget(columnMenu.col.field!);
                    setColumnMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit field
                </button>
                <div className="border-t border-neutral-800 my-1"></div>
                <button
                  onClick={() => {
                    handleDeleteField(columnMenu.col.key, columnMenu.col.label);
                    setColumnMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 cursor-pointer flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete field
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ================= PICKER: TASK DROPPED ONTO FOLDER/SPACE WITH MULTIPLE LISTS ================= */}
      {taskListPicker && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setTaskListPicker(null)} onContextMenu={(e) => { e.preventDefault(); setTaskListPicker(null); }} />
          <div
            className="fixed z-[61] w-56 max-h-72 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1"
            style={{ top: taskListPicker.y, left: taskListPicker.x }}
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-500">Move to which list?</div>
            {taskListPicker.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  optimisticSetList(taskListPicker.taskId, opt.id);
                  setTaskListPicker(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer truncate"
                title={opt.label}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ================= EDIT SPACE MODAL ================= */}
      {spaceEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setSpaceEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit Space</h3>
              <button onClick={() => setSpaceEditTarget(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Name (you can type emoji directly into the text)</label>
                <input
                  value={editSpaceName}
                  onChange={(e) => setEditSpaceName(e.target.value)}
                  placeholder="🚀 Product Dev"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Color</label>
                <div className="flex gap-1.5">
                  {FIELD_COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditSpaceColor(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer ${editSpaceColor === c ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: editSpaceColor }}></span>
                <span className="text-xs text-neutral-300">{editSpaceName || 'Preview'}</span>
              </div>
              <button onClick={saveSpaceEdit} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT FOLDER MODAL ================= */}
      {folderEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setFolderEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit Folder</h3>
              <button onClick={() => setFolderEditTarget(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Name</label>
                <input
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setEditFolderColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center ${
                      editFolderColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editFolderColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  {FIELD_COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditFolderColor(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer ${editFolderColor === c ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setEditFolderIcon(null)}
                    title="Default"
                    className={`w-7 h-7 rounded bg-neutral-950 border border-neutral-700 flex items-center justify-center cursor-pointer text-neutral-300 ${
                      editFolderIcon === null ? 'border-blue-500 text-blue-400' : ''
                    }`}
                  >
                    <FolderIconLucide className="w-3.5 h-3.5" />
                  </button>
                  {FOLDER_ICON_CHOICES.map((iconKey) => {
                    const Icon = FOLDER_ICON_MAP[iconKey];
                    return (
                      <button
                        key={iconKey}
                        onClick={() => setEditFolderIcon(iconKey)}
                        className={`w-7 h-7 rounded bg-neutral-950 border border-neutral-700 flex items-center justify-center cursor-pointer text-neutral-300 ${
                          editFolderIcon === iconKey ? 'border-blue-500 text-blue-400' : ''
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                {(() => {
                  const PreviewIcon = editFolderIcon ? FOLDER_ICON_MAP[editFolderIcon] : FolderIconLucide;
                  return <PreviewIcon className="w-3.5 h-3.5" style={{ color: editFolderColor || undefined }} />;
                })()}
                <span className="text-xs text-neutral-300">{editFolderName || 'Preview'}</span>
              </div>
              <button onClick={saveFolderEdit} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT LIST MODAL ================= */}
      {listEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setListEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit List</h3>
              <button onClick={() => setListEditTarget(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Name</label>
                <input
                  value={editListName}
                  onChange={(e) => setEditListName(e.target.value)}
                  placeholder="List name"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setEditListColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center ${
                      editListColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editListColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  {FIELD_COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditListColor(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer ${editListColor === c ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setEditListIcon(null)}
                    title="Default"
                    className={`w-7 h-7 rounded bg-neutral-950 border border-neutral-700 flex items-center justify-center cursor-pointer text-neutral-300 ${
                      editListIcon === null ? 'border-blue-500 text-blue-400' : ''
                    }`}
                  >
                    <ListIcon className="w-3.5 h-3.5" />
                  </button>
                  {FOLDER_ICON_CHOICES.map((iconKey) => {
                    const Icon = FOLDER_ICON_MAP[iconKey];
                    return (
                      <button
                        key={iconKey}
                        onClick={() => setEditListIcon(iconKey)}
                        className={`w-7 h-7 rounded bg-neutral-950 border border-neutral-700 flex items-center justify-center cursor-pointer text-neutral-300 ${
                          editListIcon === iconKey ? 'border-blue-500 text-blue-400' : ''
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                {(() => {
                  const PreviewIcon = editListIcon ? FOLDER_ICON_MAP[editListIcon] : ListIcon;
                  return <PreviewIcon className="w-3.5 h-3.5" style={{ color: editListColor || undefined }} />;
                })()}
                <span className="text-xs text-neutral-300">{editListName || 'Preview'}</span>
              </div>
              <button onClick={saveListEdit} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT FIELD MODAL ================= */}
      {fieldEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setFieldEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit field</h3>
              <button onClick={() => setFieldEditTarget(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Name</label>
                <input
                  value={fieldNameDraft}
                  onChange={(e) => setFieldNameDraft(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {fieldEditTarget.type === 'dropdown' && (
                <div>
                  <label className="text-[11px] text-neutral-400 mb-1 block">Options</label>
                  <DndContext sensors={fieldOptionSensors} collisionDetection={closestCenter} onDragEnd={handleFieldOptionDragEnd}>
                    <SortableContext items={fieldOptionsDraft.map((o) => o.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {fieldOptionsDraft.map((o) => (
                          <SortableFieldOption
                            key={o.id}
                            option={o}
                            colorChoices={FIELD_COLOR_CHOICES}
                            onChangeLabel={(label) =>
                              setFieldOptionsDraft((opts) => opts.map((x) => (x.id === o.id ? { ...x, label } : x)))
                            }
                            onChangeColor={(color) =>
                              setFieldOptionsDraft((opts) => opts.map((x) => (x.id === o.id ? { ...x, color } : x)))
                            }
                            onDelete={() => setFieldOptionsDraft((opts) => opts.filter((x) => x.id !== o.id))}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <button onClick={addFieldOption} className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer">
                    + New option
                  </button>
                </div>
              )}

              <button onClick={handleSaveField} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MANAGE STATUSES MODAL (opens via right-click on the Status column) ================= */}
      {statusMenuOpen && currentSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setStatusMenuOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Manage statuses</h3>
              <button onClick={() => setStatusMenuOpen(false)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {currentSpace.statuses.length > 0 ? (
                <DndContext sensors={statusSensors} collisionDetection={closestCenter} onDragEnd={handleStatusDragEnd}>
                  <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {statuses.map((s) => (
                        <SortableStatusRow
                          key={s.id}
                          status={s}
                          colorChoices={FIELD_COLOR_CHOICES}
                          onChangeName={(name) => updateStatus(currentSpace.id, s.id, { name })}
                          onChangeColor={(color) => updateStatus(currentSpace.id, s.id, { color })}
                          onDelete={() => setStatusToDelete({ id: s.id, name: s.name })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <>
                  {statuses.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                      {s.name}
                    </div>
                  ))}
                  <p className="text-[10px] text-neutral-500 px-2">Default statuses are shown until you create your own.</p>
                </>
              )}
              <div className="border-t border-neutral-800 pt-3 mt-1 space-y-1.5">
                <input
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="New status (e.g. Blocked)"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                  {FIELD_COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewStatusColor(c)}
                      className={`w-5 h-5 rounded-full cursor-pointer ${newStatusColor === c ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button onClick={handleAddStatus} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded cursor-pointer">
                  Create status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TASK / SUBTASK MODAL — less blur, feels more like a window on top ================= */}
      <AnimatePresence>
      {activeModalTask && (
        <motion.div
          key="task-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/55 backdrop-blur-[3px] p-6 md:p-10"
          onClick={() => setModalTaskStack([])}
        >
          <motion.div
            layoutId={`task-${modalLayoutScope}-${activeModalTask.id}`}
            onClick={(e) => e.stopPropagation()}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="w-full max-w-6xl h-[88vh] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden"
          >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, delay: 0.15 }}
            className="flex flex-col h-full"
          >
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40 shrink-0">
              <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono overflow-x-auto">
                <button onClick={() => setModalTaskStack([])} className="hover:text-blue-400 cursor-pointer shrink-0 inline-flex items-center gap-1.5">
                  {activeSpaceId === 'everything' ? (
                    <>
                      <Globe className="w-3 h-3" /> Everything
                    </>
                  ) : (
                    currentSpace?.name || 'Space'
                  )}
                </button>
                {modalTaskStack.map((id, idx) => {
                  const t = tasks.find((task) => task.id === id);
                  if (!t) return null;
                  return (
                    <span key={id} className="flex items-center gap-2 shrink-0">
                      <span>/</span>
                      <button
                        onClick={() => setModalTaskStack(modalTaskStack.slice(0, idx + 1))}
                        className={`cursor-pointer truncate max-w-[220px] ${
                          idx === modalTaskStack.length - 1 ? 'text-blue-400 font-bold' : 'hover:text-neutral-200'
                        }`}
                      >
                        {t.title}
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowActivityPanel((v) => !v)}
                  title={showActivityPanel ? 'Hide Activity & Comments' : 'Show Activity & Comments'}
                  className={`text-[11px] px-2.5 py-1 rounded border cursor-pointer transition flex items-center gap-1.5 ${
                    showActivityPanel
                      ? 'bg-neutral-800 text-blue-400 border-neutral-700'
                      : 'text-neutral-400 border-neutral-800 hover:bg-neutral-800/60'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setModalTaskStack([])}
                  className="w-8 h-8 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center font-bold text-sm cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
              <div className={`flex-1 min-w-0 overflow-y-auto p-8 space-y-6 ${showActivityPanel ? 'border-r border-neutral-800' : ''}`}>
                <div>
                  {editingModalTitle ? (
                    <input
                      autoFocus
                      value={modalTitleDraft}
                      onChange={(e) => setModalTitleDraft(e.target.value)}
                      onBlur={() => {
                        setEditingModalTitle(false);
                        const trimmed = modalTitleDraft.trim();
                        if (trimmed && trimmed !== activeModalTask.title) optimisticSetTitle(activeModalTask.id, trimmed);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingModalTitle(false);
                      }}
                      className="w-full text-2xl font-extrabold text-white tracking-tight bg-neutral-950/60 border border-blue-500 rounded px-2 py-1 focus:outline-none"
                    />
                  ) : (
                    <h2
                      className="text-2xl font-extrabold text-white tracking-tight cursor-text hover:opacity-90"
                      title="Click to rename"
                      onClick={() => {
                        setModalTitleDraft(activeModalTask.title);
                        setEditingModalTitle(true);
                      }}
                    >
                      {activeModalTask.title}
                    </h2>
                  )}
                  <p className="text-[11px] text-neutral-500 font-mono mt-1">ID: {activeModalTask.id}</p>
                </div>

                <div className="flex items-center gap-3 bg-neutral-950/40 p-3 rounded border border-neutral-800">
                  <span className="text-xs text-neutral-400 font-medium">Status:</span>
                  <FloatingPopover
                    open={modalStatusOpen}
                    onClose={() => setModalStatusOpen(false)}
                    panelClassName="w-40 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
                    anchor={
                      <button
                        onClick={() => setModalStatusOpen((o) => !o)}
                        className="text-xs font-semibold px-3 py-1 rounded border cursor-pointer inline-flex items-center gap-1.5"
                        style={{
                          color: statusColor(activeModalTask.status),
                          borderColor: statusColor(activeModalTask.status) + '55',
                          backgroundColor: statusColor(activeModalTask.status) + '20',
                        }}
                      >
                        {activeModalTask.status} <RefreshCw className="w-3 h-3" />
                      </button>
                    }
                  >
                    {statuses.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          optimisticMoveTask(activeModalTask.id, s.name);
                          setModalStatusOpen(false);
                        }}
                        className="w-full flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                        {s.name}
                      </button>
                    ))}
                  </FloatingPopover>
                </div>

                {/* Docs — multiple named documents with autosave */}
                <div className="space-y-2 pt-4 border-t border-neutral-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents</h3>
                    {docSaveStatus !== 'idle' && activeDocId && (
                      <span className="text-[10px] text-neutral-500 flex items-center gap-1">{docSaveStatus === 'saving' ? 'Saving...' : (<><Check className="w-3 h-3" /> Saved</>)}</span>
                    )}
                  </div>
                  <div className="bg-neutral-950/40 border border-neutral-800 rounded overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 overflow-x-auto">
                      <DndContext sensors={docSensors} collisionDetection={closestCenter} onDragEnd={handleDocDragEnd}>
                        <SortableContext items={activeTaskDocs.map((d) => d.id)} strategy={horizontalListSortingStrategy}>
                          {activeTaskDocs.map((d) => (
                            <DocTab
                              key={d.id}
                              doc={d}
                              isActive={activeDocId === d.id}
                              onSelect={() => {
                                setActiveDocId(d.id);
                                setDocDraft(d.content);
                                setDocSaveStatus('idle');
                              }}
                              onDelete={() => setDocToDelete({ id: d.id, title: d.title || 'Untitled' })}
                              onUnlink={
                                activeModalTaskId
                                  ? () => {
                                      setDocTaskLink(d.id, null);
                                      if (activeDocId === d.id) {
                                        setActiveDocId(null);
                                        setDocDraft('');
                                      }
                                    }
                                  : undefined
                              }
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      <button onClick={handleNewDoc} className="text-[11px] text-blue-400 px-2.5 py-1 rounded hover:bg-neutral-800/60 cursor-pointer shrink-0">
                        + New
                      </button>
                      {linkableSpaceDocs.length > 0 && (
                        <FloatingPopover
                          open={linkDocOpen}
                          onClose={() => setLinkDocOpen(false)}
                          panelClassName="w-52 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
                          anchor={
                            <button
                              onClick={() => setLinkDocOpen((o) => !o)}
                              className="text-[11px] text-neutral-400 hover:text-blue-400 px-2.5 py-1 rounded hover:bg-neutral-800/60 cursor-pointer shrink-0 flex items-center gap-1"
                            >
                              <Link2 className="w-3 h-3" /> Link existing
                            </button>
                          }
                        >
                          <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-3 py-1">From this Space's Docs</div>
                          {linkableSpaceDocs.map((d) => (
                            <button
                              key={d.id}
                              onClick={() => {
                                if (activeModalTaskId) setDocTaskLink(d.id, activeModalTaskId);
                                setLinkDocOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer truncate"
                            >
                              {d.title || 'Untitled'}
                            </button>
                          ))}
                        </FloatingPopover>
                      )}
                    </div>

                    {activeDocId ? (
                      <div className="p-3 space-y-2">
                        <input
                          value={activeTaskDocs.find((d) => d.id === activeDocId)?.title || ''}
                          onChange={(e) => activeModalTaskId && updateDoc(activeDocId, activeModalTaskId, { title: e.target.value })}
                          onFocus={captureDocEditBaseline}
                          onBlur={commitDocEditActivity}
                          className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none"
                          placeholder="Document title"
                        />
                        {docEditorEditing ? (
                          <MentionTextarea
                            ref={docTextareaRef}
                            value={docDraft}
                            onChange={(e) => handleDocDraftChange(e.target.value)}
                            onFocus={captureDocEditBaseline}
                            onBlur={() => {
                              commitDocEditActivity();
                              setDocEditorEditing(false);
                            }}
                            rows={8}
                            placeholder="Write notes, specs, anything — saved automatically as you type..."
                            className="w-full bg-transparent text-xs text-neutral-300 focus:outline-none resize-y leading-relaxed"
                          />
                        ) : (
                          <div onClick={() => setDocEditorEditing(true)} className="min-h-[8em] cursor-text">
                            {docDraft ? (
                              <MentionText
                                text={docDraft}
                                onJump={jumpToMention}
                                className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed"
                              />
                            ) : (
                              <p className="text-xs text-neutral-600 italic leading-relaxed">
                                Write notes, specs, anything — saved automatically as you type...
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-neutral-500 p-4">No documents yet — press "+ New" to add one.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-neutral-800">
                  <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    Subtasks ({currentSubtasks.length})
                  </h3>

                  <div className="bg-neutral-950/40 border border-neutral-800 rounded overflow-x-auto">
                    <div style={{ minWidth: currentSubtasks.length > 0 ? tableMinWidth : undefined }}>
                    {currentSubtasks.length > 0 && (
                      <div
                        className="grid items-center px-3 py-1.5 text-[9px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-800"
                        style={{ gridTemplateColumns: rowGridTemplate }}
                      >
                        <div></div>
                        <div></div>
                        <div className="relative pr-2">
                          Name
                          <ColumnResizeHandle onResize={(d) => resizeColumn('name', d)} onReset={() => resetColumnWidth('name')} />
                        </div>
                        {activeColumns.map((col) => (
                          <div key={col.key} className="relative text-center">
                            {col.label}
                            <ColumnResizeHandle onResize={(d) => resizeColumn(col.key, d)} onReset={() => resetColumnWidth(col.key)} />
                          </div>
                        ))}
                        <div></div>
                      </div>
                    )}
                    <div className="divide-y divide-neutral-800/50">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {currentSubtasks.map((sub) => (
                          <TaskRow
                            key={sub._localId || sub.id}
                            task={sub as Task}
                            navScope={`subtasks-${activeModalTask.id}`}
                            onOpen={() => setModalTaskStack([...modalTaskStack, sub.id])}
                            columns={activeColumns}
                            gridTemplate={rowGridTemplate}
                            statuses={statuses}
                            onContextMenu={openTaskMenu}
                            autoFocusRename={renamingTaskId === sub.id}
                            onRenameHandled={() => setRenamingTaskId(null)}
                            animateEntrance={justAddedSubtaskIds.has(sub._localId || sub.id)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                    </div>
                    <div className="p-2 flex gap-2 items-center bg-neutral-950/60">
                      <input
                        type="text"
                        placeholder="+ Add new subtask..."
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask(activeModalTask)}
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleAddSubtask(activeModalTask)}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-medium cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-950/40 p-4 rounded border border-neutral-800">
                    <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Timeframe</h4>
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-400 shrink-0">Start:</span>
                        <DatePickerPopover
                          value={activeModalTask.startDate}
                          onChange={(iso) =>
                            optimisticSetDates(
                              activeModalTask.id,
                              iso,
                              activeModalTask.dueDate ? new Date(activeModalTask.dueDate).toISOString() : null
                            )
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-400 shrink-0">Due:</span>
                        <DatePickerPopover
                          value={activeModalTask.dueDate}
                          onChange={(iso) =>
                            optimisticSetDates(
                              activeModalTask.id,
                              activeModalTask.startDate ? new Date(activeModalTask.startDate).toISOString() : null,
                              iso
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-neutral-950/40 p-4 rounded border border-neutral-800">
                    <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Assignees</h4>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeModalTask.assignees?.map((a: any) => (
                        <span key={a.id} className="text-[10px] px-2 py-1 rounded text-white font-semibold" style={{ backgroundColor: a.color }}>
                          {a.name}
                        </span>
                      ))}
                      <FloatingPopover
                        open={modalAssigneeOpen}
                        onClose={() => setModalAssigneeOpen(false)}
                        panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
                        anchor={
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalAssigneeOpen((o) => !o);
                            }}
                            title="Add assignee"
                            className="w-6 h-6 rounded-full border border-dashed border-neutral-600 text-neutral-500 hover:border-blue-400 hover:text-blue-400 text-xs flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        }
                      >
                        {users.map((u) => {
                          const checked = activeModalTask.assignees?.some((a: any) => a.id === u.id) ?? false;
                          return (
                            <button
                              key={u.id}
                              onClick={() => toggleAssignee(activeModalTask, u.id)}
                              className="w-full flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer"
                            >
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                  checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                                }`}
                              >
                                {checked && <Check className="w-2.5 h-2.5" />}
                              </span>
                              <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: u.color }}>
                                {u.initials}
                              </span>
                              {u.name}
                            </button>
                          );
                        })}
                        {users.length === 0 && <p className="text-[10px] text-neutral-500 px-2 py-1">No users yet.</p>}
                      </FloatingPopover>
                    </div>
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
              {showActivityPanel && (
              <motion.div
                key="activity-panel"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 420, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="shrink-0 overflow-hidden"
              >
              <div className="w-[420px] h-full flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-800 shrink-0">
                  <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Activity & Comments</h4>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {activeComments.length === 0 && <p className="text-[11px] text-neutral-500">No activity yet.</p>}
                  {activeComments.map((c) =>
                    c.type === 'activity' ? (
                      <div key={c.id} className="flex items-center gap-2 text-[11px] text-neutral-500 italic">
                        {(() => {
                          const Icon = c.activityKind ? ACTIVITY_ICONS[c.activityKind] : null;
                          return Icon ? (
                            <Icon className="w-3 h-3 shrink-0 text-neutral-500" />
                          ) : (
                            <span className="w-1 h-1 rounded-full bg-neutral-600 shrink-0"></span>
                          );
                        })()}
                        <span>{c.author ? <span className="font-semibold not-italic text-neutral-400">{c.author.name}: </span> : null}{c.body}</span>
                        <span className="text-neutral-600 ml-auto shrink-0">{timeAgo(c.createdAt)}</span>
                      </div>
                    ) : (
                      <div key={c.id} className="bg-neutral-950/60 border border-neutral-800 rounded p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {c.author ? (
                            <span
                              className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
                              style={{ backgroundColor: c.author.color }}
                            >
                              {c.author.initials}
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-neutral-700 text-[8px] font-bold flex items-center justify-center text-neutral-300">?</span>
                          )}
                          <span className="text-[11px] font-semibold text-neutral-200">{c.author?.name || 'Anonymous'}</span>
                          <span className="text-[10px] text-neutral-500 ml-auto">{timeAgo(c.createdAt)}</span>
                        </div>
                        <MentionText text={c.body} onJump={jumpToMention} className="text-xs text-neutral-300 whitespace-pre-wrap" />
                      </div>
                    )
                  )}
                </div>

                <div className="p-4 border-t border-neutral-800 space-y-2 shrink-0">
                  <select
                    value={commentAsUserId}
                    onChange={(e) => setCommentAsUserId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300 focus:outline-none"
                  >
                    <option value="">Comment as...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <MentionTextarea
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (newCommentBody.trim()) {
                          addComment(activeModalTask.id, newCommentBody.trim(), commentAsUserId || null);
                          setNewCommentBody('');
                        }
                      }
                    }}
                    placeholder="Write a comment... (Enter to send, Shift+Enter for new line, @ to mention)"
                    rows={2}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    onClick={() => {
                      if (!newCommentBody.trim()) return;
                      addComment(activeModalTask.id, newCommentBody.trim(), commentAsUserId || null);
                      setNewCommentBody('');
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer"
                  >
                    Send comment
                  </button>
                </div>
              </div>
              </motion.div>
              )}
              </AnimatePresence>
            </div>
          </motion.div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <CreateTaskModal
        open={createTaskOpen}
        workspaces={workspaces}
        defaultStartDate={createTaskDefaultDate}
        onClose={() => setCreateTaskOpen(false)}
        onCreate={({ title, spaceId, listId, startDate, dueDate }) => {
          optimisticCreateTask(title, listId, spaceId, null, startDate, dueDate);
          setCreateTaskOpen(false);
        }}
      />

      {/* ================= TEAM / USER ADMIN MODAL ================= */}
      {teamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setTeamOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5"><Users className="w-4 h-4" /> Team</h3>
              <button onClick={() => setTeamOpen(false)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
              {users.length === 0 && <p className="text-xs text-neutral-500">No users yet — add the first one below.</p>}
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: u.color }}>
                      {u.initials}
                    </span>
                    <span className="text-xs text-neutral-200 font-medium">{u.name}</span>
                  </div>
                  <button onClick={() => deleteUser(u.id)} className="text-neutral-500 hover:text-red-400 text-xs cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-neutral-800 space-y-2.5">
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                placeholder="Full name (e.g. Robin Hansen)"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {FIELD_COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewUserColor(c)}
                      className={`w-5 h-5 rounded-full cursor-pointer ${newUserColor === c ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                {newUserName.trim() && (
                  <span className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: newUserColor }}>
                    {initialsFromName(newUserName)}
                  </span>
                )}
              </div>
              <button onClick={handleAddUser} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
                + Add user
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!docToDelete}
        title="Delete document?"
        message={docToDelete ? `This permanently deletes "${docToDelete.title}".` : ''}
        onCancel={() => setDocToDelete(null)}
        onConfirm={() => {
          if (docToDelete && activeModalTaskId) {
            deleteDoc(docToDelete.id, activeModalTaskId);
            if (activeDocId === docToDelete.id) {
              setActiveDocId(null);
              setDocDraft('');
            }
          }
          setDocToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!fieldToDelete}
        title="Delete field?"
        message={fieldToDelete ? `This deletes the field "${fieldToDelete.name}". Values tasks already have set will remain unused.` : ''}
        onCancel={() => setFieldToDelete(null)}
        onConfirm={() => {
          if (fieldToDelete && currentSpace) {
            deleteCustomField(currentSpace.id, fieldToDelete.id);
            setVisibleColumns((cols) => cols.filter((c) => c !== fieldToDelete.id));
          }
          setFieldToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!statusToDelete}
        title="Delete status?"
        message={statusToDelete ? `This deletes the status "${statusToDelete.name}". Tasks using it keep the text but lose the color.` : ''}
        onCancel={() => setStatusToDelete(null)}
        onConfirm={() => {
          if (statusToDelete && currentSpace) {
            deleteStatus(currentSpace.id, statusToDelete.id);
          }
          setStatusToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!folderToDelete}
        title="Delete folder?"
        message={folderToDelete ? `This permanently deletes "${folderToDelete.name}" and every sub-folder, list, and task inside it.` : ''}
        onCancel={() => setFolderToDelete(null)}
        onConfirm={() => {
          if (folderToDelete) deleteFolder(folderToDelete.spaceId, folderToDelete.id);
          setFolderToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!spaceToDelete}
        title="Delete space?"
        message={spaceToDelete ? `This permanently deletes "${spaceToDelete.name}" and every folder, list, and task inside it.` : ''}
        onCancel={() => setSpaceToDelete(null)}
        onConfirm={() => {
          if (spaceToDelete) {
            deleteSpace(spaceToDelete.id);
            if (activeSpaceId === spaceToDelete.id) setNavigation('everything', []);
          }
          setSpaceToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!listToDelete}
        title="Delete list?"
        message={listToDelete ? `This permanently deletes "${listToDelete.list.name}" and every task inside it.` : ''}
        onCancel={() => setListToDelete(null)}
        onConfirm={() => {
          if (listToDelete) {
            deleteList(listToDelete.spaceId, listToDelete.list.id);
            if (activeListIds.has(listToDelete.list.id)) {
              setNavigation(
                listToDelete.spaceId,
                [...activeListIds].filter((id) => id !== listToDelete.list.id)
              );
            }
          }
          setListToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!docFolderToDelete}
        title="Delete doc folder?"
        message={docFolderToDelete ? `This permanently deletes "${docFolderToDelete.name}" and every sub-folder and document inside it.` : ''}
        onCancel={() => setDocFolderToDelete(null)}
        onConfirm={() => {
          if (docFolderToDelete) {
            deleteDocFolder(docFolderToDelete.spaceId, docFolderToDelete.id);
            if (activeDocFolderId === docFolderToDelete.id) setDocsNavigation(null, null);
          }
          setDocFolderToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!spaceDocToDelete}
        title="Delete document?"
        message={spaceDocToDelete ? `This permanently deletes "${spaceDocToDelete.title || 'Untitled'}".` : ''}
        onCancel={() => setSpaceDocToDelete(null)}
        onConfirm={() => {
          if (spaceDocToDelete && currentSpace) {
            deleteSpaceDoc(spaceDocToDelete.id, currentSpace.id);
            if (activeStandaloneDocId === spaceDocToDelete.id) setDocsNavigation(activeDocFolderId, null);
          }
          setSpaceDocToDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!roomToDelete}
        title="Delete room?"
        message={roomToDelete ? `This permanently deletes "${roomToDelete.name}". Members inside move back to Unassigned — they aren't deleted.` : ''}
        onCancel={() => setRoomToDelete(null)}
        onConfirm={() => {
          if (roomToDelete) deleteRoom(roomToDelete.id);
          setRoomToDelete(null);
        }}
      />

      <DragOverlay dropAnimation={null}>
        {activeDragTask && (
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-neutral-900 border border-blue-500 shadow-2xl text-xs text-neutral-200 max-w-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor(activeDragTask.status) }}></span>
            <span className="truncate font-medium">{activeDragTask.title}</span>
          </div>
        )}
        {activeDragEntity && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded bg-neutral-900 border shadow-2xl text-xs text-neutral-200 max-w-xs"
            style={{ borderColor: activeDragEntity.color || '#3b82f6' }}
          >
            {activeDragEntity.kind === 'folder' ? (
              <FolderIconLucide className="w-3.5 h-3.5 shrink-0" style={{ color: activeDragEntity.color || undefined }} />
            ) : activeDragEntity.kind === 'space' ? (
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeDragEntity.color || '#6366f1' }} />
            ) : activeDragEntity.kind === 'person' ? (
              <span
                className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: activeDragEntity.color || '#6366f1' }}
              >
                {activeDragEntity.initials}
              </span>
            ) : activeDragEntity.kind === 'docfolder' ? (
              <FolderIconLucide className="w-3.5 h-3.5 shrink-0" style={{ color: activeDragEntity.color || undefined }} />
            ) : activeDragEntity.kind === 'spacedoc' ? (
              <FileText className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ListIcon className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate font-medium">{activeDragEntity.name}</span>
          </div>
        )}
      </DragOverlay>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-neutral-900 border border-neutral-700 rounded shadow-2xl px-4 py-2.5 text-xs text-neutral-200 max-w-sm text-center"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenTask={(id) => setModalTaskStack([id])}
      />
    </div>
    </DndContext>
  );
}

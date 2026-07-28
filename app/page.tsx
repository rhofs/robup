'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Globe,
  List as ListIcon,
  Users,
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
} from 'lucide-react';
import { useTaskStore, HierarchySpace, StatusDef, CustomFieldDef, Task, TaskDoc } from '../store/useTaskStore';
import DatePickerPopover from '../components/DatePickerPopover';
import ConfirmDialog from '../components/ConfirmDialog';
import FloatingPopover from '../components/FloatingPopover';
import TaskRow, { ColumnDef } from '../components/TaskRow';

function DocTab({
  doc,
  isActive,
  onSelect,
  onDelete,
}: {
  doc: TaskDoc;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: doc.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group/doc shrink-0">
      <button
        onClick={onSelect}
        className={`text-[11px] px-2.5 py-1 rounded-md cursor-pointer transition ${
          isActive ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
        }`}
      >
        {doc.title || 'Untitled'}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 hover:text-red-400 text-[8px] flex items-center justify-center opacity-0 group-hover/doc:opacity-100 cursor-pointer"
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
}: {
  col: ColumnDef;
  onToggleSort: () => void;
  sortIcon: React.ReactNode;
  onContextMenuOpen?: (e: React.MouseEvent) => void;
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
      className="text-center flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing select-none"
      title="Drag to reorder, right-click for more options"
    >
      <button onClick={onToggleSort} className="hover:text-slate-300 cursor-pointer flex items-center gap-1">
        {col.label} {sortIcon}
      </button>
    </div>
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
        <span {...attributes} {...listeners} className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="w-4 h-4 rounded-full shrink-0 cursor-pointer ring-1 ring-slate-700"
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
          className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500"
        />
        <button onClick={onDelete} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer shrink-0">
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
  children,
}: {
  id: string;
  children: (isOver: boolean) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef}>{children(isOver)}</div>;
}

function SidebarListItem({
  list,
  isActive,
  count,
  onNavigate,
  onRename,
}: {
  list: { id: string; name: string };
  isActive: boolean;
  count: number;
  onNavigate: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);
  const { setNodeRef, isOver } = useDroppable({ id: `list:${list.id}` });

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
        className="w-full bg-slate-950 border border-indigo-500 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      onClick={onNavigate}
      className={`group w-full text-left px-2 py-1 rounded-md text-[11px] transition flex items-center justify-between cursor-pointer ${
        isActive ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
      } ${isOver ? 'ring-1 ring-inset ring-indigo-500 bg-indigo-600/10' : ''}`}
    >
      <span className="truncate flex items-center gap-1.5 min-w-0">
        <ListIcon className="w-3 h-3 shrink-0" />
        <span className="truncate">{list.name}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] text-slate-500 font-mono">{count}</span>
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
        <span {...attributes} {...listeners} className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="w-5 h-5 rounded-full shrink-0 cursor-pointer ring-1 ring-slate-700"
          style={{ backgroundColor: option.color }}
        />
        <input
          value={option.label}
          onChange={(e) => onChangeLabel(e.target.value)}
          className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <button onClick={onDelete} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer shrink-0">
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

const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'default-todo', name: 'To Do', color: '#f59e0b', order: 0 },
  { id: 'default-progress', name: 'In Progress', color: '#3b82f6', order: 1 },
  { id: 'default-review', name: 'Review', color: '#a855f7', order: 2 },
  { id: 'default-done', name: 'Done', color: '#10b981', order: 3 },
];

const FIELD_COLOR_CHOICES = ['#f59e0b', '#3b82f6', '#a855f7', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#94a3b8'];

const initialsFromName = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
  const {
    tasks,
    workspaces,
    users,
    comments,
    docs,
    activeSpaceId,
    activeListId,
    isLoading,
    showArchived,
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
    deleteUser,
    updateSpace,
    createList,
    renameList,
    fetchComments,
    addComment,
    fetchDocs,
    createDoc,
    updateDoc,
    deleteDoc,
    reorderDocs,
  } = useTaskStore();

  const [sortBy, setSortBy] = useState<'dueDate' | 'startDate' | 'name' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [activeAdd, setActiveAdd] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [modalTaskStack, setModalTaskStack] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'assignee', 'startDate', 'dueDate']);
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
  const [commentAsUserId, setCommentAsUserId] = useState('');

  const [taskMenu, setTaskMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [spaceMenu, setSpaceMenu] = useState<{ x: number; y: number; space: HierarchySpace } | null>(null);
  const [spaceEditTarget, setSpaceEditTarget] = useState<HierarchySpace | null>(null);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceColor, setEditSpaceColor] = useState(FIELD_COLOR_CHOICES[0]);

  const [newListSpaceId, setNewListSpaceId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');

  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number; col: ColumnDef } | null>(null);
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
    arrayMove(statuses, oldIndex, newIndex).forEach((s, index) => {
      if (s.order !== index) updateStatus(currentSpace.id, s.id, { order: index });
    });
  };

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  // Docs (sub-tab in the modal)
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docDraft, setDocDraft] = useState('');
  const [docSaveStatus, setDocSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const docSaveTimer = useRef<any>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; title: string } | null>(null);

  const [editingModalTitle, setEditingModalTitle] = useState(false);
  const [modalTitleDraft, setModalTitleDraft] = useState('');
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

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

  const statusColor = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  const filteredTasks = useMemo(() => {
    let result = tasks.filter((task) => {
      if (modalTaskStack.length > 0) return false;
      if (task.parentId !== null) return false;
      if (!!task.archived !== showArchived) return false;

      if (activeSpaceId === 'everything') return true;
      if (activeListId) return task.listId === activeListId;
      if (currentSpace) {
        const listIdsInSpace = currentSpace.lists.map((l) => l.id);
        return listIdsInSpace.includes(task.listId);
      }
      return true;
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
  }, [tasks, activeSpaceId, activeListId, currentSpace, modalTaskStack, sortBy, sortOrder, showArchived]);

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
      <span className="text-indigo-400 inline-flex">{sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
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
    let targetListId = activeListId;
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
    selectedIds.forEach((id) => optimisticArchiveTask(id, archived));
    clearSelection();
  };
  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.size} tasks? This cannot be undone.`)) return;
    selectedIds.forEach((id) => optimisticDeleteTask(id));
    clearSelection();
  };
  const bulkMoveToList = (listId: string) => {
    selectedIds.forEach((id) => optimisticSetList(id, listId));
    clearSelection();
    setBulkMoveOpen(false);
  };

  // ---- Drag & drop for tasks (row → another row / list / space) ----
  const taskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);

  const handleTaskDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id) || null;
    setActiveDragTask(task);
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith('task:')) {
      const targetId = overId.slice('task:'.length);
      if (targetId !== draggedId) optimisticSetParent(draggedId, targetId);
    } else if (overId.startsWith('list:')) {
      optimisticSetList(draggedId, overId.slice('list:'.length));
    } else if (overId.startsWith('space:')) {
      const spaceId = overId.slice('space:'.length);
      const space = workspaces.flatMap((w) => w.spaces).find((s) => s.id === spaceId);
      if (space?.lists[0]) optimisticSetList(draggedId, space.lists[0].id);
    }
  };

  // ---- Docs (autosave) ----
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

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-indigo-400 font-mono text-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading RobUp...</span>
        </div>
      </div>
    );
  }

  const activeModalTask = activeModalTaskId ? tasks.find((t) => t.id === activeModalTaskId) ?? null : null;
  const currentSubtasks = activeModalTask ? tasks.filter((t) => t.parentId === activeModalTask.id) : [];
  const activeComments = activeModalTask ? comments[activeModalTask.id] || [] : [];
  const allListsFlat = workspaces.flatMap((ws) => ws.spaces.flatMap((s) => s.lists.map((l) => ({ ...l, spaceName: s.name }))));

  // Only changes on actual navigation (space/list/archive/modal open) — used as the
  // AnimatePresence key so rows don't play a false disintegrate/slide-in animation
  // when we're just switching which list of tasks is shown.
  const taskListNavKey = `${activeSpaceId}|${activeListId}|${showArchived}|${modalTaskStack.length > 0}`;

  return (
    <DndContext sensors={taskSensors} collisionDetection={closestCenter} onDragStart={handleTaskDragStart} onDragEnd={handleTaskDragEnd}>
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* ================= LEFT MENU (SIDEBAR) ================= */}
      <aside className="w-64 bg-slate-900/90 border-r border-slate-800/80 flex flex-col justify-between shrink-0 select-none">
        <div>
          <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/80">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/20">
              R
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-white leading-tight text-sm">
                {workspaces[0]?.name || 'RobUp Workspace'}
              </h1>
              <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Zero-Cloud SQLite
              </p>
            </div>
          </div>

          <div className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-140px)]">
            <button
              onClick={() => {
                setModalTaskStack([]);
                setNavigation('everything', null);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                activeSpaceId === 'everything' && modalTaskStack.length === 0
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> Everything
              </span>
              <span className="text-[10px] bg-slate-950/60 px-2 py-0.5 rounded font-mono text-slate-400">
                {tasks.filter((t) => t.parentId === null && !t.archived).length}
              </span>
            </button>

            <div className="space-y-3">
              <p className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Spaces & Lists</p>
              {workspaces[0]?.spaces.map((space: HierarchySpace) => {
                const isSpaceActive = activeSpaceId === space.id && !activeListId && modalTaskStack.length === 0;
                const spaceTasksCount = tasks.filter(
                  (t) => t.parentId === null && !t.archived && space.lists.some((l) => l.id === t.listId)
                ).length;

                return (
                  <div key={space.id} className="space-y-1">
                    <DroppableSidebarItem id={`space:${space.id}`}>
                      {(isOver) => (
                        <button
                          onClick={() => {
                            setModalTaskStack([]);
                            setNavigation(space.id, null);
                          }}
                          onContextMenu={(e) => openSpaceMenu(e, space)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-between cursor-pointer group ${
                            isSpaceActive
                              ? 'bg-slate-800 text-white font-semibold border-l-2 border-indigo-500'
                              : 'text-slate-300 hover:bg-slate-800/40'
                          } ${isOver ? 'ring-1 ring-inset ring-indigo-500 bg-indigo-600/10' : ''}`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: space.color || '#6366f1' }}></span>
                            <span className="truncate">{space.name}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{spaceTasksCount}</span>
                        </button>
                      )}
                    </DroppableSidebarItem>

                    <div className="ml-4 pl-2 border-l border-slate-800 space-y-0.5">
                      {space.lists.map((list) => {
                        const isListActive = activeListId === list.id && modalTaskStack.length === 0;
                        const listTasksCount = tasks.filter((t) => t.listId === list.id && t.parentId === null && !t.archived).length;
                        return (
                          <SidebarListItem
                            key={list.id}
                            list={list}
                            isActive={isListActive}
                            count={listTasksCount}
                            onNavigate={() => {
                              setModalTaskStack([]);
                              setNavigation(space.id, list.id);
                            }}
                            onRename={(name) => renameList(space.id, list.id, name)}
                          />
                        );
                      })}
                      {newListSpaceId === space.id ? (
                        <input
                          autoFocus
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {
                            if (newListName.trim()) createList(space.id, newListName.trim());
                            setNewListName('');
                            setNewListSpaceId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') {
                              setNewListName('');
                              setNewListSpaceId(null);
                            }
                          }}
                          placeholder="List name..."
                          className="w-full bg-slate-950 border border-indigo-500 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setNewListSpaceId(space.id);
                            setNewListName('');
                          }}
                          className="w-full text-left px-2 py-1 rounded-md text-[11px] text-slate-500 hover:text-indigo-400 hover:bg-slate-800/30 cursor-pointer flex items-center gap-1.5"
                        >
                          <Plus className="w-3 h-3" /> New list
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-3 m-3 space-y-2">
          <button
            onClick={() => setTeamOpen(true)}
            className="w-full flex items-center justify-between bg-slate-950/60 rounded-xl border border-slate-800/80 px-3 py-2 text-[11px] text-slate-300 hover:border-slate-700 cursor-pointer"
          >
            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Team</span>
            <span className="text-slate-500 font-mono">{users.length}</span>
          </button>
          <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 px-3 py-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> RobUp</span>
            <span className="text-emerald-400 font-mono">Flat List</span>
          </div>
        </div>
      </aside>

      {/* ================= MAIN AREA ================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 relative">
        <header className="border-b border-slate-800/80 bg-slate-900/40 shrink-0">
          <div className="h-11 px-6 flex items-center justify-between border-b border-slate-800/40">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-500">Workspace</span>
              <span className="text-slate-600">/</span>
              <span className={`flex items-center gap-1.5 ${activeSpaceId === 'everything' ? 'text-indigo-400 font-semibold' : 'text-slate-300'}`}>
                {activeSpaceId === 'everything' ? (
                  <>
                    <Globe className="w-3.5 h-3.5" /> Everything
                  </>
                ) : (
                  currentSpace?.name
                )}
              </span>
              {activeListId && (
                <>
                  <span className="text-slate-600">/</span>
                  <span className="text-white font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    {currentSpace?.lists.find((l) => l.id === activeListId)?.name}
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`text-[11px] px-2.5 py-1 rounded-md border cursor-pointer transition flex items-center gap-1.5 ${
                showArchived
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'text-slate-400 border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              <Archive className="w-3.5 h-3.5" /> {showArchived ? 'Viewing archive' : 'Archive'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6" onClick={closeAllMenus}>
          <div className="max-w-6xl mx-auto space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-slate-500 font-mono text-[10px]">{filteredTasks.length} tasks</div>
              <div className="flex items-center gap-1.5">
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
                    className={`text-[11px] rounded-md px-2.5 py-1 flex items-center gap-1 border ${
                      currentSpace
                        ? 'text-slate-300 bg-slate-900 border-slate-800 hover:border-slate-700 cursor-pointer'
                        : 'text-slate-600 bg-slate-900/50 border-slate-800/50 cursor-not-allowed'
                    }`}
                  >
                    <Plus className="w-3 h-3" /> Column
                  </button>
                  {columnMenuOpen && currentSpace && (
                    <div onClick={(e) => e.stopPropagation()} className="absolute z-20 top-9 right-0 w-60 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-2 space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 px-2 pb-1">Built-in (can be hidden, not deleted)</div>
                      {availableColumns.filter((c) => c.kind !== 'custom').map((col) => (
                        <label key={col.key} className="flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer">
                          <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                          {col.label}
                        </label>
                      ))}
                      {availableColumns.some((c) => c.kind === 'custom') && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 px-2 pt-2 pb-1 border-t border-slate-800">Custom fields</div>
                      )}
                      {availableColumns.filter((c) => c.kind === 'custom').map((col) => (
                        <div key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/60">
                          <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer flex-1">
                            <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                            {col.label}
                          </label>
                          <button onClick={() => col.field && setFieldEditTarget(col.field)} className="text-slate-500 hover:text-indigo-400 text-[10px] cursor-pointer">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteField(col.key, col.label)} className="text-slate-500 hover:text-red-400 text-[10px] cursor-pointer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="border-t border-slate-800 pt-2 mt-1">
                        {!newFieldOpen ? (
                          <button onClick={() => setNewFieldOpen(true)} className="w-full text-left text-[11px] text-indigo-400 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer">
                            + New field
                          </button>
                        ) : (
                          <div className="space-y-1.5 px-1">
                            <input
                              autoFocus
                              value={newFieldName}
                              onChange={(e) => setNewFieldName(e.target.value)}
                              placeholder="Field name (e.g. Budget)"
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                            />
                            <select
                              value={newFieldType}
                              onChange={(e) => setNewFieldType(e.target.value as any)}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300"
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                              <option value="dropdown">Dropdown</option>
                            </select>
                            <div className="flex gap-1.5">
                              <button onClick={handleAddField} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] py-1 rounded cursor-pointer">
                                Create field
                              </button>
                              <button onClick={() => setNewFieldOpen(false)} className="text-[11px] text-slate-400 px-2 cursor-pointer">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
              <div
                className="grid items-center px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 bg-slate-950/40"
                style={{ gridTemplateColumns: `20px 28px 2fr ${activeColumns.map(() => '110px').join(' ')} 32px` }}
              >
                <div></div>
                <div></div>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-300 cursor-pointer text-left">
                  Name <SortIcon field="name" />
                </button>
                <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                  <SortableContext items={activeColumns.map((c) => c.key)} strategy={horizontalListSortingStrategy}>
                    {activeColumns.map((col) => (
                      <SortableColumnHeader
                        key={col.key}
                        col={col}
                        onToggleSort={() => (col.kind === 'startDate' || col.kind === 'dueDate' ? toggleSort(col.kind) : undefined)}
                        sortIcon={col.kind === 'startDate' || col.kind === 'dueDate' ? <SortIcon field={col.kind} /> : null}
                        onContextMenuOpen={(e) => setColumnMenu({ x: e.clientX, y: e.clientY, col })}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <div className="text-right">Action</div>
              </div>

              <div className="divide-y divide-slate-800/50">
                <AnimatePresence mode="popLayout" initial={false} key={taskListNavKey}>
                  {filteredTasks.map((task) => (
                    <TaskRow
                      key={task._localId || task.id}
                      task={task}
                      onOpen={() => setModalTaskStack([task.id])}
                      columns={activeColumns}
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
                  <div className="p-2.5 bg-slate-950/40 flex gap-2 items-center">
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
                      className="flex-1 bg-slate-900 border border-indigo-500/80 rounded px-3 py-1 text-xs text-white focus:outline-none"
                    />
                    <button onClick={handleQuickAdd} className="bg-indigo-600 text-white text-xs px-3 py-1 rounded font-medium cursor-pointer">
                      Add
                    </button>
                    <button onClick={() => setActiveAdd(false)} className="text-slate-400 text-xs px-2 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : (
                  !showArchived && (
                    <button
                      onClick={() => setActiveAdd(true)}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800/40 hover:text-indigo-400 transition flex items-center gap-2 cursor-pointer"
                    >
                      <span className="font-bold text-indigo-400">+</span> Add Task
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ================= BULK ACTION BAR ================= */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-slate-300 font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-slate-700"></div>
          <button onClick={() => bulkArchive(true)} className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 cursor-pointer flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBulkMoveOpen(!bulkMoveOpen);
              }}
              className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 cursor-pointer flex items-center gap-1.5"
            >
              <FolderInput className="w-3.5 h-3.5" /> Move to...
            </button>
            {bulkMoveOpen && (
              <div onClick={(e) => e.stopPropagation()} className="absolute z-20 bottom-9 left-1/2 -translate-x-1/2 w-56 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-1.5 max-h-56 overflow-y-auto">
                {allListsFlat.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => bulkMoveToList(l.id)}
                    className="w-full text-left text-[11px] text-slate-300 px-2 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer"
                  >
                    <span className="text-slate-500">{l.spaceName} /</span> {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={bulkDelete} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <div className="w-px h-5 bg-slate-700"></div>
          <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================= CONTEXT MENU: TASK ================= */}
      {taskMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setTaskMenu(null)} onContextMenu={(e) => { e.preventDefault(); setTaskMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1" style={{ top: taskMenu.y, left: taskMenu.x }}>
            <button
              onClick={() => {
                setModalTaskStack([taskMenu.task.id]);
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Open
            </button>
            <button
              onClick={() => {
                setRenamingTaskId(taskMenu.task.id);
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                handleArchiveClick(taskMenu.task);
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2"
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
            <div className="border-t border-slate-800 my-1"></div>
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
          <div className="fixed z-[61] w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1" style={{ top: spaceMenu.y, left: spaceMenu.x }}>
            <button onClick={() => startEditSpace(spaceMenu.space)} className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2">
              <Pencil className="w-3.5 h-3.5" /> Edit appearance
            </button>
          </div>
        </>
      )}

      {/* ================= CONTEXT MENU: COLUMN ================= */}
      {columnMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setColumnMenu(null)} onContextMenu={(e) => { e.preventDefault(); setColumnMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1" style={{ top: columnMenu.y, left: columnMenu.x }}>
            <button
              onClick={() => {
                toggleColumn(columnMenu.col.key);
                setColumnMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2"
            >
              <EyeOff className="w-3.5 h-3.5" /> Hide column
            </button>
            {columnMenu.col.kind === 'status' && (
              <button
                onClick={() => {
                  setStatusMenuOpen(true);
                  setColumnMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2"
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
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 cursor-pointer flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit field
                </button>
                <div className="border-t border-slate-800 my-1"></div>
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

      {/* ================= EDIT SPACE MODAL ================= */}
      {spaceEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs" onClick={() => setSpaceEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit Space</h3>
              <button onClick={() => setSpaceEditTarget(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Name (you can type emoji directly into the text)</label>
                <input
                  value={editSpaceName}
                  onChange={(e) => setEditSpaceName(e.target.value)}
                  placeholder="🚀 Product Dev"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Color</label>
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
              <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: editSpaceColor }}></span>
                <span className="text-xs text-slate-300">{editSpaceName || 'Preview'}</span>
              </div>
              <button onClick={saveSpaceEdit} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded-lg font-medium cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT FIELD MODAL ================= */}
      {fieldEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs" onClick={() => setFieldEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit field</h3>
              <button onClick={() => setFieldEditTarget(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Name</label>
                <input
                  value={fieldNameDraft}
                  onChange={(e) => setFieldNameDraft(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {fieldEditTarget.type === 'dropdown' && (
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Options</label>
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
                  <button onClick={addFieldOption} className="mt-2 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer">
                    + New option
                  </button>
                </div>
              )}

              <button onClick={handleSaveField} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded-lg font-medium cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MANAGE STATUSES MODAL (opens via right-click on the Status column) ================= */}
      {statusMenuOpen && currentSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs" onClick={() => setStatusMenuOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Manage statuses</h3>
              <button onClick={() => setStatusMenuOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
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
                    <div key={s.id} className="flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                      {s.name}
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-500 px-2">Default statuses are shown until you create your own.</p>
                </>
              )}
              <div className="border-t border-slate-800 pt-3 mt-1 space-y-1.5">
                <input
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="New status (e.g. Blocked)"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                <button onClick={handleAddStatus} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded cursor-pointer">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-[3px] p-6 md:p-10"
          onClick={() => setModalTaskStack([])}
        >
          <motion.div
            layoutId={`task-${activeModalTask.id}`}
            onClick={(e) => e.stopPropagation()}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="w-full max-w-6xl h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, delay: 0.15 }}
            className="flex flex-col h-full"
          >
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono overflow-x-auto">
                <button onClick={() => setModalTaskStack([])} className="hover:text-indigo-400 cursor-pointer shrink-0 inline-flex items-center gap-1.5">
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
                          idx === modalTaskStack.length - 1 ? 'text-indigo-400 font-bold' : 'hover:text-slate-200'
                        }`}
                      >
                        {t.title}
                      </button>
                    </span>
                  );
                })}
              </div>
              <button
                onClick={() => setModalTaskStack([])}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-sm cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-12">
              <div className="col-span-7 overflow-y-auto p-8 space-y-6 border-r border-slate-800">
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
                      className="w-full text-2xl font-extrabold text-white tracking-tight bg-slate-950/60 border border-indigo-500 rounded-lg px-2 py-1 focus:outline-none"
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
                  <p className="text-[11px] text-slate-500 font-mono mt-1">ID: {activeModalTask.id}</p>
                </div>

                <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium">Status:</span>
                  <FloatingPopover
                    open={modalStatusOpen}
                    onClose={() => setModalStatusOpen(false)}
                    panelClassName="w-40 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-1.5"
                    anchor={
                      <button
                        onClick={() => setModalStatusOpen((o) => !o)}
                        className="text-xs font-semibold px-3 py-1 rounded-full border cursor-pointer inline-flex items-center gap-1.5"
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
                        className="w-full flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                        {s.name}
                      </button>
                    ))}
                  </FloatingPopover>
                </div>

                {/* Docs — multiple named documents with autosave */}
                <div className="space-y-2 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents</h3>
                    {docSaveStatus !== 'idle' && activeDocId && (
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">{docSaveStatus === 'saving' ? 'Saving...' : (<><Check className="w-3 h-3" /> Saved</>)}</span>
                    )}
                  </div>
                  <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 overflow-x-auto">
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
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      <button onClick={handleNewDoc} className="text-[11px] text-indigo-400 px-2.5 py-1 rounded-md hover:bg-slate-800/60 cursor-pointer shrink-0">
                        + New
                      </button>
                    </div>

                    {activeDocId ? (
                      <div className="p-3 space-y-2">
                        <input
                          value={activeTaskDocs.find((d) => d.id === activeDocId)?.title || ''}
                          onChange={(e) => activeModalTaskId && updateDoc(activeDocId, activeModalTaskId, { title: e.target.value })}
                          className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none"
                          placeholder="Document title"
                        />
                        <textarea
                          value={docDraft}
                          onChange={(e) => handleDocDraftChange(e.target.value)}
                          rows={8}
                          placeholder="Write notes, specs, anything — saved automatically as you type..."
                          className="w-full bg-transparent text-xs text-slate-300 focus:outline-none resize-y leading-relaxed"
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 p-4">No documents yet — press "+ New" to add one.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Subtasks ({currentSubtasks.length})
                  </h3>

                  <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
                    {currentSubtasks.length > 0 && (
                      <div
                        className="grid items-center px-3 py-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800"
                        style={{ gridTemplateColumns: `20px 28px 2fr ${activeColumns.map(() => '110px').join(' ')} 32px` }}
                      >
                        <div></div>
                        <div></div>
                        <div>Name</div>
                        {activeColumns.map((col) => (
                          <div key={col.key} className="text-center">{col.label}</div>
                        ))}
                        <div></div>
                      </div>
                    )}
                    <div className="divide-y divide-slate-800/50">
                      <AnimatePresence mode="popLayout" initial={false} key={activeModalTaskId || 'none'}>
                        {currentSubtasks.map((sub) => (
                          <TaskRow
                            key={sub._localId || sub.id}
                            task={sub as Task}
                            onOpen={() => setModalTaskStack([...modalTaskStack, sub.id])}
                            columns={activeColumns}
                            statuses={statuses}
                            onContextMenu={openTaskMenu}
                            autoFocusRename={renamingTaskId === sub.id}
                            onRenameHandled={() => setRenamingTaskId(null)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                    <div className="p-2 flex gap-2 items-center bg-slate-950/60">
                      <input
                        type="text"
                        placeholder="+ Add new subtask..."
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask(activeModalTask)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => handleAddSubtask(activeModalTask)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Timeframe</h4>
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 shrink-0">Start:</span>
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
                        <span className="text-slate-400 shrink-0">Due:</span>
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

                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Assignees</h4>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeModalTask.assignees?.map((a: any) => (
                        <span key={a.id} className="text-[10px] px-2 py-1 rounded-full text-white font-semibold" style={{ backgroundColor: a.color }}>
                          {a.name}
                        </span>
                      ))}
                      <FloatingPopover
                        open={modalAssigneeOpen}
                        onClose={() => setModalAssigneeOpen(false)}
                        panelClassName="w-44 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-1.5"
                        anchor={
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalAssigneeOpen((o) => !o);
                            }}
                            title="Add assignee"
                            className="w-6 h-6 rounded-full border border-dashed border-slate-600 text-slate-500 hover:border-indigo-400 hover:text-indigo-400 text-xs flex items-center justify-center cursor-pointer"
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
                              className="w-full flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer"
                            >
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                  checked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600'
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
                        {users.length === 0 && <p className="text-[10px] text-slate-500 px-2 py-1">No users yet.</p>}
                      </FloatingPopover>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-5 flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 shrink-0">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Activity & Comments</h4>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {activeComments.length === 0 && <p className="text-[11px] text-slate-500">No activity yet.</p>}
                  {activeComments.map((c) =>
                    c.type === 'activity' ? (
                      <div key={c.id} className="flex items-center gap-2 text-[11px] text-slate-500 italic">
                        <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0"></span>
                        <span>{c.body}</span>
                        <span className="text-slate-600 ml-auto shrink-0">{timeAgo(c.createdAt)}</span>
                      </div>
                    ) : (
                      <div key={c.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {c.author ? (
                            <span
                              className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
                              style={{ backgroundColor: c.author.color }}
                            >
                              {c.author.initials}
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-slate-700 text-[8px] font-bold flex items-center justify-center text-slate-300">?</span>
                          )}
                          <span className="text-[11px] font-semibold text-slate-200">{c.author?.name || 'Anonymous'}</span>
                          <span className="text-[10px] text-slate-500 ml-auto">{timeAgo(c.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    )
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
                  <select
                    value={commentAsUserId}
                    onChange={(e) => setCommentAsUserId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                  >
                    <option value="">Comment as...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <textarea
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
                    placeholder="Write a comment... (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    onClick={() => {
                      if (!newCommentBody.trim()) return;
                      addComment(activeModalTask.id, newCommentBody.trim(), commentAsUserId || null);
                      setNewCommentBody('');
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded-lg font-medium cursor-pointer"
                  >
                    Send comment
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ================= TEAM / USER ADMIN MODAL ================= */}
      {teamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs" onClick={() => setTeamOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5"><Users className="w-4 h-4" /> Team</h3>
              <button onClick={() => setTeamOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
              {users.length === 0 && <p className="text-xs text-slate-500">No users yet — add the first one below.</p>}
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: u.color }}>
                      {u.initials}
                    </span>
                    <span className="text-xs text-slate-200 font-medium">{u.name}</span>
                  </div>
                  <button onClick={() => deleteUser(u.id)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-slate-800 space-y-2.5">
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                placeholder="Full name (e.g. Robin Hansen)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
              <button onClick={handleAddUser} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded-lg font-medium cursor-pointer">
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

      <DragOverlay dropAnimation={null}>
        {activeDragTask && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-indigo-500 shadow-2xl text-xs text-slate-200 max-w-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor(activeDragTask.status) }}></span>
            <span className="truncate font-medium">{activeDragTask.title}</span>
          </div>
        )}
      </DragOverlay>
    </div>
    </DndContext>
  );
}

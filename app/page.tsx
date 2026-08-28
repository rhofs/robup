'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
  UserCircle,
  LogOut,
  Archive,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  FolderInput,
  X,
  Maximize2,
  Undo2,
  CheckCircle2,
  Eye,
  EyeOff,
  Palette,
  RefreshCw,
  FileText,
  Check,
  MessageSquare,
  MessageCircle,
  ChevronUp,
  ChevronDown,
  Lock,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  CornerDownRight,
  CornerUpLeft,
  ListPlus,
  ListMinus,
  Link2,
  Building2,
  Search,
  Unlink,
  ListChecks,
  ClipboardCheck,
  Settings,
  Copy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTaskStore, HierarchySpace, HierarchyFolder, HierarchyList, HierarchyDocFolder, HierarchyRoom, HierarchyWorkspace, StatusDef, CustomFieldDef, Task, TaskDoc, AppUser } from '../store/useTaskStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useSessionStore } from '../store/useSessionStore';
import { useChatStore } from '../store/useChatStore';
import { usePresenceConnection } from '../lib/collab/usePresenceConnection';
import { SessionSync } from '../components/SessionSync';
import { signOut } from 'next-auth/react';
import { collectListIdsUnder, isDescendantOf, getOrderedListIds } from '../lib/folderTree';
import { isDescendantOfDocFolder } from '../lib/docFolderTree';
import { buildNavQueryString, dateKey, parseNavUrl } from '../lib/navUrl';
import DatePickerPopover from '../components/DatePickerPopover';
import { startDateColor, dueDateColor, DATE_BADGE_COLOR_HEX, startDateTooltip, dueDateTooltip } from '../lib/dateBadgeColor';
import ColorSwatchPicker from '../components/ColorSwatchPicker';
import ConfirmDialog from '../components/ConfirmDialog';
import FloatingPopover from '../components/FloatingPopover';
import { activeGlowStyle } from '../lib/activeGlowStyle';
import { copyToClipboard } from '../lib/copyToClipboard';
import DocExportMenu from '../components/collab/DocExportMenu';
import TaskRow, { ColumnDef } from '../components/TaskRow';
import FolderTree, { FOLDER_ICON_CHOICES, FOLDER_ICON_MAP } from '../components/FolderTree';
import CalendarView from '../components/calendar/CalendarView';
import QuickCreatePopover from '../components/calendar/QuickCreatePopover';
import EventDetailModal from '../components/calendar/EventDetailModal';
import SpaceHome from '../components/SpaceHome';
import DocFolderTree from '../components/DocFolderTree';
import DocsBrowser from '../components/DocsBrowser';
import DocSubpagesPanel from '../components/DocSubpagesPanel';
import { getChildDocs } from '../lib/docFolderTree';
import OfficePage from '../components/OfficePage';
import ManageableAvatar from '../components/ManageableAvatar';
import ChatPanel from '../components/ChatPanel';
import ChatThreadPanel from '../components/ChatThreadPanel';
import ChatSidebar from '../components/ChatSidebar';
import MyTasksPage from '../components/MyTasksPage';
import DirectMessagesPage from '../components/DirectMessagesPage';
import ProfilePage from '../components/ProfilePage';
import CommandPalette from '../components/CommandPalette';
import TrashPanel from '../components/TrashPanel';
import SettingsPanel, { readHiddenNavTabs, readHideWeekNumbers, type NavTabId } from '../components/SettingsPanel';
import type { NavTab, MenuTile } from '../components/mobile/navTypes';
import { PRIMARY_NAV_TAB_IDS } from '../components/mobile/navTypes';
import MobileBottomNav from '../components/mobile/MobileBottomNav';
import MobileSpacesSheet from '../components/mobile/MobileSpacesSheet';
import MobileDocPagesSheet from '../components/mobile/MobileDocPagesSheet';
import MobileCalendarFilterSheet from '../components/mobile/MobileCalendarFilterSheet';
import { useIsMobile } from '../hooks/useIsMobile';
import AccessControlPanel from '../components/AccessControlPanel';
import AccountSettingsPanel from '../components/AccountSettingsPanel';
import MentionText from '../components/MentionText';
import MentionTextarea from '../components/MentionTextarea';

// Client-only: HocuspocusProvider needs `window.location` and a real WebSocket, neither available
// during SSR — a live collaborative editor has no reason to render server-side anyway.
const CollabDocEditor = dynamic(() => import('../components/collab/CollabDocEditor'), { ssr: false });
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
        <div className="pl-6">
          <ColorSwatchPicker value={status.color} onChange={onChangeColor} choices={colorChoices} size="sm" />
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
        <div className="pl-6">
          <ColorSwatchPicker value={option.color} onChange={onChangeColor} choices={colorChoices} size="sm" />
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
  datesChanged: CalendarIcon,
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

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = { name: 280 };
const NAME_WIDTH_RANGE = { min: 140, max: 640 };
const COLUMN_WIDTH_RANGE = { min: 70, max: 300 };
const COLUMN_WIDTHS_STORAGE_KEY = 'siqt.columnWidths';
const ACTIVITY_PANEL_STORAGE_KEY = 'siqt.showActivityPanel';
const COLLAPSED_SPACES_STORAGE_KEY = 'siqt.collapsedSpaces';

// Same "only persist the collapsed ones" shape as FolderTree.tsx's readCollapsedFolders —
// Spaces default to expanded, so the minority (collapsed) is what's worth remembering.
function readCollapsedSpaces(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(COLLAPSED_SPACES_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function setSpaceCollapsed(spaceId: string, collapsed: boolean) {
  try {
    const next = readCollapsedSpaces();
    if (collapsed) next.add(spaceId);
    else next.delete(spaceId);
    localStorage.setItem(COLLAPSED_SPACES_STORAGE_KEY, JSON.stringify([...next]));
  } catch {}
}

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

// Task modal's own free-text description (Task.description — already existed in the schema/API,
// never had a UI until now). Same click-to-edit-textarea shape SpaceHome.tsx's DescriptionBlock
// already established for Space.description — kept as its own small copy rather than sharing that
// component, since the two are tied to different store actions/types with nothing else in common.
// Deliberately separate from Documents: Documents are full rich-text pages (live collaborative
// Tiptap editors, meant for specs/notes that grow over time); this is the one-paragraph "what is
// this task" summary ClickUp itself shows directly under the title/metadata row, not another doc.
function TaskDescriptionBlock({ value, onCommit }: { value: string | null; onCommit: (value: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value || '');
            setEditing(false);
          }
        }}
        rows={3}
        placeholder="Write a description..."
        className="w-full bg-neutral-900/60 border border-blue-500 rounded px-3 py-2 text-xs text-neutral-200 focus:outline-none resize-none"
      />
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(value || '');
        setEditing(true);
      }}
      className="group flex items-start gap-2 px-2 py-1.5 -mx-2 rounded hover:bg-neutral-800/40 cursor-text"
    >
      {value ? (
        <p className="text-xs text-neutral-300 whitespace-pre-wrap flex-1">{value}</p>
      ) : (
        <p className="text-xs text-neutral-500 italic flex-1">Write a description...</p>
      )}
      <Pencil className="w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
    </div>
  );
}

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
    events,
    workspaces,
    users,
    comments,
    docs,
    activeWorkspaceId,
    lastRealWorkspaceId,
    setActiveWorkspaceId,
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
    activeOfficeRoomId,
    setActiveOfficeRoomId,
    fetchInitialData,
    setNavigation,
    setShowArchived,
    optimisticMoveTask,
    optimisticCreateTask,
    optimisticCreateEvent,
    updateEvent,
    optimisticSetEventAssignees,
    deleteEvent,
    optimisticDeleteTask,
    optimisticArchiveTask,
    optimisticSetAssignees,
    optimisticSetDates,
    optimisticSetList,
    optimisticSetParent,
    optimisticSetTitle,
    optimisticSetDescription,
    setTaskPrivacy,
    createStatus,
    updateStatus,
    deleteStatus,
    createCustomField,
    updateCustomField,
    deleteCustomField,
    updateUser,
    createRoom,
    updateRoom,
    deleteRoom,
    assignUserToRoom,
    updateWorkspaceMessage,
    createWorkspace,
    addWorkspaceMember,
    removeWorkspaceMember,
    deleteWorkspace,
    memberInvitesIncoming,
    fetchMemberInvites,
    acceptMemberInvite,
    declineMemberInvite,
    refetchTasks,
    refetchEvents,
    ensurePersonalWorkspace,
    updateSpace,
    reorderSpace,
    createSpace,
    deleteSpace,
    moveList,
    reorderList,
    updateList,
    deleteList,
    archiveList,
    moveFolder,
    updateFolder,
    deleteFolder,
    updateDocFolder,
    moveDocFolder,
    deleteDocFolder,
    createSpaceDoc,
    updateSpaceDoc,
    moveSpaceDoc,
    moveDocToBoardFolder,
    reorderSpaceDoc,
    deleteSpaceDoc,
    archiveSpaceDoc,
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

  const { currentUserId } = useSessionStore();
  usePresenceConnection(activeWorkspaceId ?? null);
  const isMobile = useIsMobile();

  // Unread badges (Phase 8) — fetched here, not just inside ChatSidebar (which only mounts once
  // the user has already navigated into Chat), so the nav-rail/Me-zone badges below can show
  // *before* the user opens it. No global "anything changed anywhere" broadcast room exists (the
  // real-time signal is per-channel, only for whatever's open in ChatPanel) — a 30s poll is the
  // pragmatic, no-new-infrastructure way to keep these reasonably fresh otherwise.
  const chatChannelsByWorkspace = useChatStore((s) => s.channelsByWorkspace);
  const chatDms = useChatStore((s) => s.dms);
  const fetchChatChannels = useChatStore((s) => s.fetchChannels);
  const fetchChatDMs = useChatStore((s) => s.fetchDMs);
  const createOrOpenDM = useChatStore((s) => s.createOrOpenDM);
  const setActiveChatChannelId = useChatStore((s) => s.setActiveChannelId);
  const setActiveChatSidebarTab = useChatStore((s) => s.setActiveChatSidebarTab);

  // "Send DM" from ManageableAvatar (Office, backlog #9) — jumps straight into the real
  // conversation instead of just navigating to Chat and leaving the user to find/start it
  // themselves. Same createOrOpenDM + setActiveChannelId + setActiveChatSidebarTab shape
  // ChatSidebar.tsx's own "start a new chat" flow already uses.
  const handleStartDMFromOffice = async (targetUserId: string) => {
    if (!currentUserId || targetUserId === currentUserId) return;
    const dm = await createOrOpenDM([currentUserId, targetUserId]);
    if (!dm) return;
    setActiveChatChannelId(dm.id);
    setActiveChatSidebarTab('dms');
    setActiveView('chat');
  };
  useEffect(() => {
    fetchChatDMs();
    if (activeWorkspaceId) fetchChatChannels(activeWorkspaceId);
    const interval = setInterval(() => {
      fetchChatDMs();
      if (activeWorkspaceId) fetchChatChannels(activeWorkspaceId);
    }, 30000);
    return () => clearInterval(interval);
  }, [activeWorkspaceId, fetchChatDMs, fetchChatChannels]);
  // Channels (current workspace) + DMs (all, workspace-agnostic) — both now live under the one
  // Chat nav-rail tab (components/ChatSidebar.tsx's Channels/DMs toggle), so one combined badge.
  const chatUnreadCount = useMemo(() => {
    const channelsUnread = activeWorkspaceId ? (chatChannelsByWorkspace[activeWorkspaceId] || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0) : 0;
    const dmsUnread = chatDms.reduce((sum, d) => sum + (d.unreadCount || 0), 0);
    return channelsUnread + dmsUnread;
  }, [chatChannelsByWorkspace, activeWorkspaceId, chatDms]);

  // Same "fetch eagerly + 30s poll" shape as the chat unread badges just above — a workspace
  // invite (backlog #8) should be noticeable in the switcher without having to already be
  // looking at it, and there's no push mechanism for this yet either.
  useEffect(() => {
    fetchMemberInvites();
    const interval = setInterval(fetchMemberInvites, 30000);
    return () => clearInterval(interval);
  }, [fetchMemberInvites]);

  // Same "poll every 30s, no new infrastructure" shape as the two above — Tasks/Events have no
  // real-time push at all (unlike Chat's Hocuspocus room or Docs' collaborative editing), so a
  // change made on one device/tab was never reflected on another until a manual page reload.
  // Reported live: added something on mobile, had to refresh on PC to see it in the calendar.
  // Scoped to 'board'/'calendar' specifically (not always-on like the two polls above) since a
  // full task/event refetch is heavier than a small unread-count query — only worth the traffic
  // while actually looking at data that could go stale.
  useEffect(() => {
    if (activeView !== 'board' && activeView !== 'calendar') return;
    const interval = setInterval(() => {
      refetchTasks();
      refetchEvents();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeView, refetchTasks, refetchEvents]);

  // Just for the breadcrumb's "/ #channel-name" or "/ Someone" segment — the channel/DM list and
  // messages themselves live inside ChatSidebar/ChatPanel, which read the rest of useChatStore
  // directly. Checks real channels (current workspace) and DMs (flat, workspace-agnostic) since
  // both now share the one 'chat' view.
  //
  // Split into two steps deliberately — a real, previously-shipped infinite-render-loop bug lived
  // here: the Zustand selector used to build the {kind, text} object directly inline, which
  // constructs a brand-new object on literally every store read (not just when the active
  // channel/DM actually changes). Zustand's hook re-invokes the selector on every store update
  // (the 30s chat-unread poll above alone guarantees a few per minute) and compares the result by
  // reference — a selector that never returns a stable reference makes React's
  // useSyncExternalStore conclude the snapshot is perpetually "unstable," which manifests as an
  // uncatchable render loop (repeating update/dispatch frames in the console, the tab hanging or
  // showing a generic browser error page — reported live as "This page couldn't load" every time
  // a DM was opened). Fix: the selector itself returns a stable reference pulled straight from the
  // store's own arrays (.find() on an unchanged array element is reference-stable across
  // re-renders, same safe shape the old channel-only version of this selector already had) — the
  // {kind, text} object is now built in a separate useMemo, which only ever runs when that
  // reference (or currentUserId) actually changes.
  const activeChatEntity = useChatStore((s) => {
    const id = s.activeChannelId;
    if (!id) return null;
    const channel = activeWorkspaceId ? (s.channelsByWorkspace[activeWorkspaceId] || []).find((c) => c.id === id) : null;
    return channel ?? s.dms.find((d) => d.id === id) ?? null;
  });
  const activeChatChannelLabel = useMemo(() => {
    if (!activeChatEntity) return null;
    if (activeChatEntity.type !== 'dm' && activeChatEntity.type !== 'group_dm') {
      return { kind: 'channel' as const, text: activeChatEntity.name ?? '' };
    }
    const others = (activeChatEntity.members ?? []).map((m) => m.user).filter((u) => u.id !== currentUserId);
    return { kind: 'dm' as const, text: others.map((u) => u.name).join(', ') || 'Just you' };
  }, [activeChatEntity, currentUserId]);

  // Breadcrumb's own first segment — used to just say the literal word "Workspace" regardless of
  // which tab was open, which read as redundant/confusing once the actual workspace name is
  // already shown up in the header's own workspace switcher (top-left). Now reflects whichever
  // view is actually active instead, matching the nav-rail's own labels.
  const BREADCRUMB_VIEW_LABEL: Record<typeof activeView, string> = {
    board: 'Spaces',
    calendar: 'Planner',
    docs: 'Docs',
    office: 'Office',
    chat: 'Chat',
    mytasks: 'My assigned tasks',
    directMessages: 'Connections',
    profile: 'Profile',
  };
  const breadcrumbViewLabel = BREADCRUMB_VIEW_LABEL[activeView];

  // The Thread side panel (Phase 5) needs the actual root message object, not just its id — it's
  // already sitting in messagesByChannel (a thread root is a completely normal main-feed message,
  // it just also happens to have threadReplyCount > 0), so this is a lookup, not a fetch.
  const activeThreadRootMessage = useChatStore((s) => {
    if (!s.activeThreadRootId || !s.activeChannelId) return null;
    return (s.messagesByChannel[s.activeChannelId] || []).find((m) => m.id === s.activeThreadRootId) ?? null;
  });
  const setActiveThreadRootId = useChatStore((s) => s.setActiveThreadRootId);

  const [sortBy, setSortBy] = useState<'dueDate' | 'startDate' | 'name' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [activeAdd, setActiveAdd] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [modalTaskStack, setModalTaskStack] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  // Starts collapsed to a discreet text link on both mobile and desktop now (an expert design
  // review flagged the desktop input's permanently-visible dark box + bright blue "Add" button as
  // competing for attention with the task's own content) — matches the main Task list's own
  // "+ Add Task" pattern.
  const [subtaskAddOpen, setSubtaskAddOpen] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'assignee', 'startDate', 'dueDate']);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const [showActivityPanel, setShowActivityPanel] = useState(true);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDefaultDate, setCreateTaskDefaultDate] = useState<string | null>(null);
  const [eventDetailId, setEventDetailId] = useState<string | null>(null);

  const [calendarVisibleListIds, setCalendarVisibleListIds] = useState<Set<string>>(new Set());
  const calendarFilterInitRef = useRef(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [clearOverdueConfirmOpen, setClearOverdueConfirmOpen] = useState(false);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDef['type']>('text');

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState(FIELD_COLOR_CHOICES[0]);

  // Status/assignee popovers in the modal (TaskRow has its own local versions)
  const [modalStatusOpen, setModalStatusOpen] = useState(false);
  const [modalAssigneeOpen, setModalAssigneeOpen] = useState(false);

  const [memberToRemove, setMemberToRemove] = useState<AppUser | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  // Shared by Space/Folder/List/Task's own "Manage access" trigger — see AccessControlPanel.
  const [accessControlTarget, setAccessControlTarget] = useState<{
    kind: 'space' | 'folder' | 'list' | 'task';
    id: string;
    // updateFolder/updateList are keyed by (spaceId, id) — spaceId is required for those two
    // kinds specifically (it's how the store finds which Space's folders/lists array to patch
    // locally, not just part of the URL), unused for 'space'/'task'.
    spaceId?: string;
    label: string;
    isPrivate: boolean;
    accessJson: string;
  } | null>(null);

  const [newCommentBody, setNewCommentBody] = useState('');

  const [taskMenu, setTaskMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [spaceMenu, setSpaceMenu] = useState<{ x: number; y: number; space: HierarchySpace } | null>(null);
  const [spaceEditTarget, setSpaceEditTarget] = useState<HierarchySpace | null>(null);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editSpaceColor, setEditSpaceColor] = useState(FIELD_COLOR_CHOICES[0]);
  const [editSpaceTextColor, setEditSpaceTextColor] = useState<string | null>(null);
  const [editSpaceIcon, setEditSpaceIcon] = useState<string | null>(null);
  const [editSpaceCoverUrl, setEditSpaceCoverUrl] = useState('');
  const [spaceToDelete, setSpaceToDelete] = useState<HierarchySpace | null>(null);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'roles' | 'invite' | 'import'>('general');
  const [hiddenNavTabs, setHiddenNavTabs] = useState<Set<NavTabId>>(() => new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Whichever grid tile (AppLauncherGrid.tsx) the user last picked — remembered across reloads so
  // the bottom nav's dynamic 4th slot (MobileBottomNav.tsx) can shortcut straight back to it,
  // ClickUp-style, instead of always opening the grid. localStorage read is guarded for SSR.
  const [pinnedMenuTileId, setPinnedMenuTileIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('siqt:pinnedMobileMenuTile');
  });
  const pinMobileMenuTile = useCallback((id: string) => {
    setPinnedMenuTileIdState(id);
    if (typeof window !== 'undefined') window.localStorage.setItem('siqt:pinnedMobileMenuTile', id);
  }, []);
  const [mobileSpacesOpen, setMobileSpacesOpen] = useState(false);
  // "My Tasks"'s own tree browser (mirrors MobileSpacesSheet exactly, just fed the personal
  // workspace's data instead of the real one) — a separate open-state from mobileSpacesOpen so
  // browsing it never lights up the bottom nav's "Spaces" tab (that tab's own `spacesOpen` prop
  // only ever reads mobileSpacesOpen).
  const [mobilePersonalSpacesOpen, setMobilePersonalSpacesOpen] = useState(false);
  const [mobileCalendarFilterOpen, setMobileCalendarFilterOpen] = useState(false);
  const [mobileDocPagesOpen, setMobileDocPagesOpen] = useState(false);
  // The real bug behind "tapping a different nav button does nothing": none of these mobile-only
  // overlay screens had any reason to close themselves when the user tapped a *different* nav
  // destination instead of picking something from inside them — Spaces (or the Menu grid, or the
  // Chat/Planner filter sheets) just stayed visually on top forever after being opened once,
  // silently masking every subsequent tap even though `activeView` (and the URL) really was
  // switching correctly underneath the whole time.
  // Set synchronously (never via state) by openMobileSpaces()/the My Tasks tile's onClick right
  // before they call setActiveView('board') to open their own sheet — those two calls landing in
  // the same batched render change activeView's value, which used to make the backstop effect
  // below fire and immediately undo the very setMobileSpacesOpen(true)/setMobilePersonalSpacesOpen
  // (true) call from that same tap. Reported live as "Spaces dumps me straight into a random
  // Space/List instead of showing the tree" and "My Tasks shows the SpaceHome card instead of the
  // list" — both were really this same close-right-after-open race, not a targeting bug.
  //
  // Consumed by closeMobileOverlays() itself (below) rather than only by the activeView-watching
  // effect that follows it — Spaces and My Tasks both use activeView === 'board', so bouncing
  // directly between the two (a real, common path) never actually changes activeView's *value* at
  // all, meaning that effect's dependency never fires and the flag was never getting reset. It sat
  // stuck `true` until some later, unrelated nav tap happened to change activeView for real — at
  // which point *that* tap's own closeMobileOverlays() call got silently (and wrongly) skipped too.
  // Reported live as "My Tasks ender fortsatt opp på 'Kort sida' om jeg går frem og tilbake 2
  // ganger" — the second round tripped over a flag left behind by the first. Consuming it inside
  // closeMobileOverlays() itself means *any* call — direct (onNavigate, at the top of every real
  // nav tap) or via the effect — clears it, so it can never survive past the very next close.
  const suppressOverlayCloseRef = useRef(false);
  const closeMobileOverlays = useCallback(() => {
    // A task modal renders globally (outside any activeView branch — see its own "TASK / SUBTASK
    // MODAL" block further down), so a stale modalTaskStack entry (opened from Chat, search,
    // anywhere) doesn't just sit invisible on some other tab — it reappears, complete with its
    // row-into-modal "magic move" entrance animation, the instant *any* destination renders board
    // content again. Reported live happening leaving Chat specifically, toward several different
    // destinations (Spaces, My Tasks, even Planner) — not something specific to one nav handler,
    // so it belongs here, in the one place already called at the start of every real nav tap,
    // rather than duplicated into each individual handler. Deliberately unconditional (before the
    // suppress check below) — even while an overlay-close is being suppressed because a sheet is
    // about to open in this same tap, the destination is still genuinely new and a stale modal
    // should still go.
    setModalTaskStack([]);
    if (suppressOverlayCloseRef.current) {
      suppressOverlayCloseRef.current = false;
      return;
    }
    setMobileSpacesOpen(false);
    setMobilePersonalSpacesOpen(false);
    setMobileMenuOpen(false);
    setMobileCalendarFilterOpen(false);
  }, []);
  // Backstop for activeView changes that don't go through one of the nav's own tap handlers below
  // (e.g. a deep link, or opening a task from search) — MobileBottomNav/AppLauncherGrid also call
  // closeMobileOverlays() directly at the moment of every nav tap, which is the actual fix: this
  // effect alone isn't enough on its own, since it only fires when activeView's *value* changes —
  // re-tapping a destination you were already on before opening Spaces (activeView never changes)
  // silently skipped it, leaving Spaces stuck open exactly when the tap should have closed it.
  useEffect(() => {
    closeMobileOverlays();
  }, [activeView, closeMobileOverlays]);
  const [hideWeekNumbers, setHideWeekNumbers] = useState(false);
  useEffect(() => {
    setHiddenNavTabs(readHiddenNavTabs());
    setHideWeekNumbers(readHideWeekNumbers());
  }, []);
  const [newSpaceDraft, setNewSpaceDraft] = useState('');
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceDraft, setNewWorkspaceDraft] = useState('');
  // A more "official" workspace-creation step (backlog #2) — org type + an optional work email,
  // alongside the plain name this already had. Neither is verified (no email-sending
  // infrastructure exists in this app yet — that's a separate, larger feature); this is purely
  // metadata captured up front rather than a bare name field, and shown back in Workspace Settings.
  const [newWorkspaceType, setNewWorkspaceType] = useState<'company' | 'personal_project'>('company');
  const [newWorkspaceEmail, setNewWorkspaceEmail] = useState('');
  const [collapsedSpaceIds, setCollapsedSpaceIds] = useState<Set<string>>(() => readCollapsedSpaces());
  const toggleSpaceCollapsed = (spaceId: string) => {
    setCollapsedSpaceIds((prev) => {
      const next = new Set(prev);
      const collapsed = !next.has(spaceId);
      if (collapsed) next.add(spaceId);
      else next.delete(spaceId);
      setSpaceCollapsed(spaceId, collapsed);
      return next;
    });
  };
  // Clicking anywhere on the row body (name included, not just the dedicated icon/chevron slot)
  // should force the Space open — same as ClickUp — not toggle it shut again on a second click of
  // the name. Only the icon slot's own handler (which stops propagation before this ever runs)
  // is a real toggle.
  const expandSpace = (spaceId: string) => {
    setCollapsedSpaceIds((prev) => {
      if (!prev.has(spaceId)) return prev;
      const next = new Set(prev);
      next.delete(spaceId);
      setSpaceCollapsed(spaceId, false);
      return next;
    });
  };

  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: HierarchyFolder } | null>(null);
  const [folderEditTarget, setFolderEditTarget] = useState<HierarchyFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState<string | null>(null);
  const [editFolderTextColor, setEditFolderTextColor] = useState<string | null>(null);
  const [editFolderIcon, setEditFolderIcon] = useState<string | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);

  const [listMenu, setListMenu] = useState<{ x: number; y: number; list: HierarchyList; spaceId: string } | null>(null);
  const [listEditTarget, setListEditTarget] = useState<{ list: HierarchyList; spaceId: string } | null>(null);
  const [editListName, setEditListName] = useState('');
  const [editListColor, setEditListColor] = useState<string | null>(null);
  const [editListTextColor, setEditListTextColor] = useState<string | null>(null);
  const [editListIcon, setEditListIcon] = useState<string | null>(null);
  const [renameListId, setRenameListId] = useState<string | null>(null);
  const [listToDelete, setListToDelete] = useState<{ list: HierarchyList; spaceId: string } | null>(null);

  const [docMenu, setDocMenu] = useState<{ x: number; y: number; doc: TaskDoc; spaceId: string } | null>(null);
  const [docEditTarget, setDocEditTarget] = useState<{ doc: TaskDoc; spaceId: string } | null>(null);
  const [editDocColor, setEditDocColor] = useState<string | null>(null);
  const [editDocTextColor, setEditDocTextColor] = useState<string | null>(null);
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [docOwnerPickerOpen, setDocOwnerPickerOpen] = useState(false);
  const [docContributorsPickerOpen, setDocContributorsPickerOpen] = useState(false);

  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number; col: ColumnDef } | null>(null);
  const [taskListPicker, setTaskListPicker] = useState<{ x: number; y: number; taskId: string; options: { id: string; label: string }[] } | null>(null);
  const [fieldEditTarget, setFieldEditTarget] = useState<CustomFieldDef | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<{ id: string; name: string } | null>(null);
  const [fieldConflictPrompt, setFieldConflictPrompt] = useState<{
    taskId: string;
    targetListId: string;
    spaceId: string;
    conflictingFields: CustomFieldDef[];
  } | null>(null);

  // Moving a task to a different List needs to check whether it's carrying a value for a
  // List-scoped custom field that only exists on its *current* List — silently moving would either
  // drop the field from view (if the destination has no matching column) or, worse, misattribute
  // the value to an unrelated same-named field there. Only single-task moves go through this
  // wrapper (drag onto a List, the folder/space auto-pick, the multi-list picker) — bulk multi-
  // select move (bulkArchive's sibling) still calls optimisticSetList directly, since prompting
  // per-task there would need a real batched UI this wasn't asked to build.
  const moveTaskToList = (taskId: string, targetListId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const space = workspaces.flatMap((w) => w.spaces).find((s) => s.lists.some((l) => l.id === targetListId));
    if (!task || !space) {
      optimisticSetList(taskId, targetListId);
      return;
    }
    const values = JSON.parse(task.customFieldValues || '{}');
    const conflicting = space.customFields.filter(
      (f) => f.listId !== null && f.listId !== targetListId && values[f.id] !== undefined && values[f.id] !== ''
    );
    if (conflicting.length > 0) {
      setFieldConflictPrompt({ taskId, targetListId, spaceId: space.id, conflictingFields: conflicting });
    } else {
      optimisticSetList(taskId, targetListId);
    }
  };

  // "Move to..." (task context menu) — unlike moveTaskToList's other callers (drag-and-drop onto
  // a List/Folder/Space), this one can target a task that's currently a subtask. Explicitly
  // choosing a destination list means the user is treating it as an independent item from here
  // on, not still nested under its old parent — so this also clears parentId first (only when the
  // task actually has one; a no-op for an already-top-level task). Both changes are wrapped in one
  // transaction() so Ctrl+Z undoes them together, not one at a time. (If moveTaskToList hits a
  // custom-field conflict and defers to a user prompt instead of moving synchronously, the two
  // changes land as separate undo steps instead — a rare edge case, not worth more complexity to
  // avoid.)
  const moveTaskToListAndUnparent = (taskId: string, targetListId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    useHistoryStore.getState().transaction('Move task', () => {
      if (task?.parentId) optimisticSetParent(taskId, null);
      moveTaskToList(taskId, targetListId);
    });
  };

  const resolveFieldConflictByCreating = async () => {
    if (!fieldConflictPrompt) return;
    const { taskId, targetListId, spaceId, conflictingFields } = fieldConflictPrompt;
    for (const f of conflictingFields) {
      await createCustomField(spaceId, f.name, f.type, f.options, undefined, targetListId);
    }
    optimisticSetList(taskId, targetListId);
    setFieldConflictPrompt(null);
  };
  const [statusToDelete, setStatusToDelete] = useState<{ id: string; name: string } | null>(null);
  const [fieldNameDraft, setFieldNameDraft] = useState('');
  const [fieldOptionsDraft, setFieldOptionsDraft] = useState<{ id: string; label: string; color: string }[]>([]);

  useEffect(() => {
    if (fieldEditTarget) {
      setFieldNameDraft(fieldEditTarget.name);
      setFieldOptionsDraft(
        (fieldEditTarget.options ?? []).map((o) => ({ id: o.id || crypto.randomUUID(), label: o.label, color: o.color }))
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
    useHistoryStore.getState().transaction('Reorder statuses', async () => {
      await Promise.all(
        arrayMove(statuses, oldIndex, newIndex).map((s, index) => (s.order !== index ? updateStatus(currentSpace.id, s.id, { order: index }) : null))
      );
    });
  };

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  // Docs (sub-tab in the modal) — content itself now lives in each doc's own Yjs document,
  // synced live via components/collab/CollabDocEditor.tsx; only which doc is selected is local state.
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; title: string } | null>(null);
  const [linkDocOpen, setLinkDocOpen] = useState(false);
  // Reverse direction of "Link existing" above — links an existing Task onto a standalone
  // (Docs-tab) doc, from the Docs tab side. Same setDocTaskLink action, just initiated from here.
  const [linkTaskOpen, setLinkTaskOpen] = useState(false);
  // Captured on this editor instance's own focus, compared on its own blur — logs one "document
  // edited" activity entry per edit session (not per keystroke) for whichever field(s) actually
  // changed during that session. Scoped to this browser tab's own connection, not a shared field.
  const docEditBaselineRef = useRef<{ docId: string; title: string; content: string } | null>(null);

  const [docFolderToDelete, setDocFolderToDelete] = useState<HierarchyDocFolder | null>(null);
  const [spaceDocToDelete, setSpaceDocToDelete] = useState<TaskDoc | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<HierarchyRoom | null>(null);

  const [editingModalTitle, setEditingModalTitle] = useState(false);
  const [modalTitleDraft, setModalTitleDraft] = useState('');
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);

  // Re-fetches whenever the "You are: ..." identity changes, not just on mount — workspace-scoped
  // endpoints (workspaces/tasks/task-docs) filter by whoever's currently asserted, so switching
  // identity needs to pull that person's own workspaces rather than keep showing the previous
  // person's data (or nothing, if the app started with no identity selected).
  useEffect(() => {
    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchInitialData, currentUserId]);

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
  const urlOfficeRoomIdKey = activeOfficeRoomId ?? '';

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
      workspaceId: activeWorkspaceId,
      spaceId: activeSpaceId,
      listIds: [...activeListIds],
      modalStack: modalTaskStack,
      granularity: calendarGranularity,
      focusDate: calendarFocusDate,
      docFolderId: activeDocFolderId,
      docId: activeStandaloneDocId,
      officeUserId: activeOfficeUserId,
      officeRoomId: activeOfficeRoomId,
    });
    if (qs === searchParams.toString()) return;
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    activeWorkspaceId,
    activeSpaceId,
    urlListIdsKey,
    urlModalStackKey,
    calendarGranularity,
    urlFocusDateKey,
    urlDocFolderIdKey,
    urlDocIdKey,
    urlOfficeUserIdKey,
    urlOfficeRoomIdKey,
  ]);

  // Effect 2: URL -> nav state. Runs once real data has loaded (so a deep-linked Space/List/task
  // can be validated) and again on every back/forward navigation. Content-compares before calling
  // any setter so it never fights effect 1 above.
  useEffect(() => {
    if (workspaces.length === 0) return;
    const parsed = parseNavUrl(searchParams);

    if (parsed.view !== activeView) setActiveView(parsed.view);

    // Same "URL says nothing -> leave it" rule as spaceId below, just simpler since workspace has
    // no distinct "explicit default" value the way Space has 'everything' — a stale/deleted
    // workspace id (e.g. this identity is no longer a member) silently falls back to whichever
    // workspace fetchInitialData already picked, rather than erroring.
    if (parsed.workspaceId && parsed.workspaceId !== activeWorkspaceId && workspaces.some((w) => w.id === parsed.workspaceId)) {
      setActiveWorkspaceId(parsed.workspaceId);
    }

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

    const validOfficeRoomId =
      parsed.officeRoomId && workspaces.some((w) => w.rooms.some((r) => r.id === parsed.officeRoomId)) ? parsed.officeRoomId : null;
    if (validOfficeRoomId !== activeOfficeRoomId) setActiveOfficeRoomId(validOfficeRoomId);

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

  // Falls back to the first non-personal workspace only while activeWorkspaceId hasn't resolved
  // yet (e.g. the very first render before fetchInitialData's own selection lands) — every other
  // "which workspace" call site in this file should read this instead of workspaces[0] directly.
  // A personal workspace (the hidden one behind "My tasks") is never "the current workspace."
  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces.find((w) => !w.isPersonal),
    [workspaces, activeWorkspaceId]
  );
  // Mobile-only header title (replaces the generic "S" logo — see the header's own comment) — same
  // per-view labels the breadcrumb already uses, except "board" splits on whether the personal
  // workspace is active, since "Spaces" and "My Tasks" are genuinely different destinations that
  // happen to share one activeView value.
  const mobileHeaderTitle = activeView === 'board' && currentWorkspace?.isPersonal ? 'My Tasks' : breadcrumbViewLabel;
  // Gates the Tasks/Planner/Docs/Office nav tabs — before creating/joining a real workspace,
  // those tabs have nothing to show (every Space/List lives under a real workspace, never the
  // personal one), so showing them just to render empty is more confusing than hiding them until
  // there's something behind them. My tasks/Network/Chat aren't gated by this — they're
  // cross-workspace by design.
  const hasRealWorkspace = useMemo(() => workspaces.some((w) => !w.isPersonal), [workspaces]);
  // MobilePersonalSpacesSheet's own data source — a plain find (not useMemo) since `workspaces`
  // already changes identity on every relevant update and this isn't hot-path.
  const personalWorkspace = workspaces.find((w) => w.isPersonal);
  // The real "Spaces" sheet's own data source — deliberately NOT currentWorkspace, which
  // legitimately *is* the personal workspace while My Tasks is active. That sheet component is
  // never unmounted (see MobileSpacesSheet.tsx's own file-level comment), so feeding it
  // currentWorkspace would carry the personal workspace's own Spaces into its internal
  // expand-state tracking while hidden, purely because of which workspace happened to be active
  // at that moment — this always resolves to a *real* workspace, same fallback openMobileSpaces()
  // itself already uses.
  const realSheetWorkspace =
    currentWorkspace && !currentWorkspace.isPersonal
      ? currentWorkspace
      : (workspaces.find((w) => w.id === lastRealWorkspaceId) ?? workspaces.find((w) => !w.isPersonal));

  // Shared with the mobile bottom nav / app-launcher grid (components/mobile/*) so both surfaces
  // drive the exact same setters as the desktop icon rail — see handleTasksNavClick below and the
  // "board" nav tab. Kept as a plain function (not useCallback) since currentWorkspace/workspaces
  // already change identity on every relevant update and this isn't hot-path.
  const handleTasksNavClick = () => {
    // Clicking Tasks while inside "My tasks" (the personal workspace) previously did nothing
    // visible — activeView was already 'board', so this was a no-op, and nothing ever switched
    // activeWorkspaceId back to a real team workspace. Prefer lastRealWorkspaceId (the workspace
    // actually last selected) over just grabbing the first non-personal workspace in fetch
    // order — for anyone in more than one real workspace, that used to silently land on whichever
    // one happened to fetch first, not the one they were actually on (reported live: New Game
    // Media -> My Tasks -> Spaces landed on CRRM Media instead of back on New Game Media).
    // setActiveWorkspaceId itself now restores that workspace's own last-visited Space/List
    // (store-level lastPositionByWorkspaceId) — no separate manual setNavigation call needed here
    // any more (that used to rely on a React-local `lastRealNav` that could drift out of sync with
    // this exact same information already tracked in the store, reported live as the memory
    // "sometimes working, sometimes not").
    if (currentWorkspace?.isPersonal && realSheetWorkspace) {
      setActiveWorkspaceId(realSheetWorkspace.id);
    }
    setActiveView('board');
  };

  // Opens the mobile Spaces sheet, switching off the personal workspace first if that's still
  // active (e.g. arrived here via "My Tasks") — same fallback logic as handleTasksNavClick just
  // above, extracted into one function so every entry point to the sheet applies it identically.
  // Originally duplicated inline at each call site; one of them (the board view's own in-header
  // "Spaces" button) was missed when the fallback was first added, which is exactly how "Spaces
  // shows Personal, and the nav pill lights up too" resurfaced from a second, forgotten call site
  // rather than a real regression in the already-fixed one.
  const openMobileSpaces = () => {
    // setActiveWorkspaceId now restores this workspace's own last position automatically — see
    // its own comment in store/useTaskStore.ts.
    if (currentWorkspace?.isPersonal && realSheetWorkspace) {
      setActiveWorkspaceId(realSheetWorkspace.id);
    }
    // Opening the sheet with nothing picked yet left activeView pointed at whatever view was
    // active before (Chat, Planner, ...) — the nav-tab highlight glitches this caused (another
    // tab reading as "active," with no sliding pill, since two tabs can't share the same
    // layoutId cleanly) were only the visible symptom; the same stale activeView is also what the
    // popup menu's dimmed backdrop was showing through as "the wrong window's background."
    // Setting it explicitly here is the actual fix, not just the nav highlight's own !mobileSheetOpen
    // guard below (kept anyway, as defense-in-depth against the state update not having landed yet).
    // suppressOverlayCloseRef: without this, changing activeView here in the same tap as
    // setMobileSpacesOpen(true) triggered the backstop effect above, which immediately closed the
    // sheet that was just opened. Only set when activeView is actually about to change — Spaces and
    // My Tasks both use 'board', so this call is a no-op between the two, and the backstop effect's
    // own dependency (activeView) never changes either — meaning it would never fire to *consume*
    // the flag, leaving it stuck true and wrongly suppressing some later, unrelated tap's own
    // legitimate close. Reported live as "fra Spaces til My Tasks... kan jeg ikke gå tilbake til
    // Spaces igjen, stuck" — bouncing between the two 'board' screens is exactly the pairing where
    // the flag could never get consumed and cleared normally.
    if (useTaskStore.getState().activeView !== 'board') {
      suppressOverlayCloseRef.current = true;
    }
    setActiveView('board');
    // If there's already a specific List to land on — either because we never actually left the
    // real workspace, or setActiveWorkspaceId just restored one above — skip the picker sheet and
    // go straight to its board content, same "skip the pointless middle screen" check meNavItems'
    // own My Tasks handler below uses. Reported live as
    // "går jeg inn på en liste i Spaces, så til planner og tilbake, så havner jeg i oversikten" —
    // this used to unconditionally reopen the tree even when there was a specific List to return
    // to directly. Read fresh from the store (not a closed-over value) since setActiveWorkspaceId
    // above may have just changed it synchronously in this same call.
    if (useTaskStore.getState().activeListIds.size === 0) {
      setMobileSpacesOpen(true);
    }
  };

  const handleOfficeNavClick = () => {
    // Always resets to the team grid, even if Office was already the active tab — same
    // "click the rail icon to go home" expectation as clicking a nav icon in most apps, not just
    // a tab switch. Without this, clicking Office while already viewing a person's page did
    // nothing (setActiveView('office') is a no-op when already there).
    setActiveView('office');
    setActiveOfficeUserId(null);
    setActiveOfficeRoomId(null);
  };

  // Single source of truth for which view-switching tabs are visible right now — read by both the
  // desktop icon rail and the mobile bottom nav / app-launcher grid, so hiddenNavTabs/
  // hasRealWorkspace are never re-derived (and never drift) between the two surfaces.
  const visibleNavTabs: NavTab[] = useMemo(() => {
    const tabs: NavTab[] = [];
    if (!hiddenNavTabs.has('board') && hasRealWorkspace) {
      tabs.push({
        id: 'board',
        // "Spaces," not "Tasks" — a Space also holds Docs/Folders/Lists, not just tasks (mobile's
        // bottom nav already independently relabels this same tab "Spaces" for the same reason;
        // this brings desktop in line with it, per explicit user feedback: "Docs er ikke tasks").
        label: 'Spaces',
        icon: ListIcon,
        onClick: handleTasksNavClick,
        active: activeView === 'board' && !currentWorkspace?.isPersonal,
      });
    }
    // Opening either mobile tree sheet (Spaces, My Tasks' own Personal Spaces) never changes
    // activeView by itself — only actually picking a Space/List/Doc inside one does (same fact
    // `board`'s own active check already accounts for via !currentWorkspace?.isPersonal, and My
    // Tasks' own via `|| mobilePersonalSpacesOpen`). Every *other* tab here was still just a bare
    // `activeView === X` with no equivalent exclusion, so whichever tab was active before opening
    // one of these sheets kept reading as active underneath it — reported live as Chat or Planner
    // staying/turning blue (with no sliding pill, since two tabs simultaneously claiming the same
    // shared `layoutId="mobileNavPill"` is undefined behavior) while genuinely looking at Spaces or
    // My Tasks. Same fix applied uniformly: nothing else can read as active while either sheet is
    // covering the screen.
    const mobileSheetOpen = mobileSpacesOpen || mobilePersonalSpacesOpen;
    if (!hiddenNavTabs.has('calendar') && hasRealWorkspace) {
      tabs.push({
        id: 'calendar',
        label: 'Planner',
        icon: CalendarIcon,
        onClick: () => setActiveView('calendar'),
        active: activeView === 'calendar' && !mobileSheetOpen,
      });
    }
    if (!hiddenNavTabs.has('docs') && hasRealWorkspace) {
      tabs.push({
        id: 'docs',
        label: 'Docs',
        icon: FileText,
        onClick: () => setActiveView('docs'),
        active: activeView === 'docs' && !mobileSheetOpen,
      });
    }
    if (!hiddenNavTabs.has('office') && hasRealWorkspace) {
      tabs.push({
        id: 'office',
        label: 'Office',
        icon: Building2,
        onClick: handleOfficeNavClick,
        active: activeView === 'office' && !mobileSheetOpen,
      });
    }
    if (!hiddenNavTabs.has('chat')) {
      tabs.push({
        id: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        onClick: () => setActiveView('chat'),
        active: activeView === 'chat' && !mobileSheetOpen,
        badge: chatUnreadCount,
      });
    }
    return tabs;
  }, [hiddenNavTabs, hasRealWorkspace, activeView, currentWorkspace, workspaces, chatUnreadCount, mobileSpacesOpen, mobilePersonalSpacesOpen]);

  // The desktop sidebar's "Me zone" (My tasks/My assigned tasks/Network/Profile) has no mobile
  // equivalent — it's inside the same hidden-below-md <aside> as the Spaces/Lists tree, and unlike
  // that tree it isn't reachable through any other mobile surface either. Surfaced as its own
  // small tile group in the mobile app-launcher grid instead — same MenuTile shape as
  // visibleNavTabs, just not gated by hiddenNavTabs (none of these are hideable rail tabs).
  const meNavItems: MenuTile[] = useMemo(
    () => [
      {
        id: 'my-tasks',
        label: 'My Tasks',
        icon: ListChecks,
        onClick: async () => {
          if (!currentUserId) {
            showToast('Signed-out session — try reloading the page.');
            return;
          }
          try {
            // ensurePersonalWorkspace makes a real POST round-trip every time — harmless (the
            // route is an idempotent upsert) but a real, noticeable delay on every tap once the
            // workspace already exists. Skip it once `workspaces` already has one; only fall back
            // to the async ensure-and-create path the very first time (or a stale local list).
            const known = workspaces.find((w) => w.isPersonal)?.id;
            const workspaceId = known ?? (await ensurePersonalWorkspace(currentUserId)).workspaceId;
            // setActiveWorkspaceId itself now restores this workspace's own last-visited Space/List
            // (store-level lastPositionByWorkspaceId, kept current by setNavigation) — replaces the
            // separate React-local `lastPersonalNav` this used to read, which could drift out of
            // sync with the store's own idea of "where was I" and made this "sometimes work,
            // sometimes not" depending on exactly which of two near-duplicate mechanisms had the
            // current answer. Same unified mechanism openMobileSpaces now uses for "Spaces."
            setActiveWorkspaceId(workspaceId);
            // Same fix as openMobileSpaces just above: opening the tree with nothing picked yet
            // used to leave activeView pointed at whatever was active before (Chat, Planner, ...),
            // which is what caused both the nav-tab highlight glitches (another tab reading as
            // active underneath this one) and the popup menu's dimmed backdrop showing the wrong
            // view's content through it. suppressOverlayCloseRef: same race as openMobileSpaces —
            // only set when activeView is actually about to change (see that function's own
            // comment for why bouncing between two 'board' screens — Spaces and My Tasks — must
            // never set this, or the flag gets stuck and wrongly suppresses a later, unrelated tap).
            if (useTaskStore.getState().activeView !== 'board') {
              suppressOverlayCloseRef.current = true;
            }
            setActiveView('board');
            // Only open the tree picker when there's genuinely nothing more specific to land on —
            // same "skip the pointless middle screen" check openMobileSpaces uses for "Spaces."
            if (useTaskStore.getState().activeListIds.size === 0) {
              setMobilePersonalSpacesOpen(true);
            }
          } catch (err) {
            // A failed ensurePersonalWorkspace() previously left this tap looking like it did
            // absolutely nothing — the whole async body just stopped at the rejected await, with
            // nothing surfacing it. Now it's at least visible instead of a silent dead tap.
            showToast(`Couldn't open My Tasks: ${err instanceof Error ? err.message : 'unknown error'}`);
          }
        },
        // Deliberately 'board' only, not 'docs' too — 'docs' can't be attributed to My Tasks
        // specifically, since the standalone Docs tab shares that same activeView value regardless
        // of which workspace happens to be active.
        // `|| mobilePersonalSpacesOpen`: opening the tree itself doesn't set activeView to 'board'
        // (only actually picking something in it does — same reason the primary Spaces tab's own
        // `active` needed `|| spacesOpen`), so without this the pinned button read as "not active"
        // — no blue highlight, and the very next tap tried to navigate again instead of opening the
        // switcher grid — the whole time you were legitimately looking at My Tasks's own screen.
        active: !!currentWorkspace?.isPersonal && (activeView === 'board' || mobilePersonalSpacesOpen),
      },
      {
        id: 'mytasks',
        label: 'Assigned',
        icon: ClipboardCheck,
        onClick: () => setActiveView('mytasks'),
        active: activeView === 'mytasks',
      },
      {
        // Chat (the bottom-nav tab) already covers channels and DMs — this entry point's only
        // real job is Connections (find people, connect link, requests).
        id: 'directMessages',
        label: 'Connections',
        icon: Users,
        onClick: () => setActiveView('directMessages'),
        active: activeView === 'directMessages',
      },
      {
        id: 'profile',
        label: 'Profile',
        icon: UserCircle,
        onClick: () => setActiveView('profile'),
        active: activeView === 'profile',
      },
    ],
    [currentUserId, currentWorkspace, activeView, workspaces, mobilePersonalSpacesOpen, ensurePersonalWorkspace, setActiveWorkspaceId, setActiveView]
  );

  // Everything not already pinned to the bottom nav's 3 fixed slots — shared between
  // MobileBottomNav (to resolve the dynamic 4th slot's icon/label/onClick) and AppLauncherGrid (to
  // render + highlight it), so both surfaces read the exact same "what's pinnable" list.
  const mobileGridTabs = useMemo(
    () => visibleNavTabs.filter((tab) => !PRIMARY_NAV_TAB_IDS.includes(tab.id)),
    [visibleNavTabs]
  );
  const pinnableMobileTiles: MenuTile[] = useMemo(() => [...mobileGridTabs, ...meNavItems], [mobileGridTabs, meNavItems]);
  // No `?? pinnableMobileTiles[0]` fallback any more — that silently pinned whatever happened to
  // be first in this array-order-dependent list (meNavItems' own first entry is "My Tasks")
  // before the user had ever actually picked anything. MobileBottomNav.tsx's handlePinnedTap
  // treats a *real* pinned tile as a navigate-there shortcut whenever you're not already on it —
  // meaning the very first tap on the dynamic 4th slot, before any deliberate pin exists, could
  // silently jump straight to My Tasks instead of opening the picker grid the user actually
  // expected, landing on its own empty SpaceHome card if nothing was remembered there yet.
  // Reported live as "jeg trykker på popup-menyen, og får 'My task'-kortet i bakgrunnen" — it
  // wasn't the menu showing the wrong thing behind it, the tap never opened the menu at all.
  // `pinnedTile` already renders correctly as `null` (MobileBottomNav's own `PinnedIcon = pinnedTile
  // ?.icon ?? MenuIcon`, a generic hamburger) and behaves correctly as `null` (handlePinnedTap's
  // `pinnedTile && ...` check falls through to opening the menu), so there's no need for an
  // implicit default here at all — only an explicit pick (persisted via pinnedMenuTileId) should
  // ever turn the 4th slot into a shortcut.
  const pinnedMobileTile: MenuTile | null = pinnableMobileTiles.find((t) => t.id === pinnedMenuTileId) ?? null;

  // Owner or Admin of the current workspace — gates role management, member role changes, and
  // the "make private" control on Space/Folder/List/Task (server re-checks this independently on
  // every mutating route, this is only for what the UI offers to click).
  const canManageCurrentWorkspace = useMemo(() => {
    const myRole = currentWorkspace?.members.find((m) => m.id === currentUserId)?.workspaceRole;
    return myRole === 'owner' || myRole === 'admin';
  }, [currentWorkspace, currentUserId]);

  const currentSpace = useMemo(() => {
    if (activeSpaceId === 'everything') return null;
    for (const ws of workspaces) {
      const found = ws.spaces.find((s) => s.id === activeSpaceId);
      if (found) return found;
    }
    return null;
  }, [workspaces, activeSpaceId]);

  // Archive mode always wants the flat task table (to browse every archived task in the Space),
  // even with no List selected — SpaceHome has no concept of "archived", so it must yield to the
  // table here or the Archive toggle silently does nothing while on a Space's home page.
  const showingSpaceHome = activeView === 'board' && !!currentSpace && activeListIds.size === 0 && !showArchived;

  const statuses: StatusDef[] = currentSpace?.statuses?.length ? currentSpace.statuses : DEFAULT_STATUSES;
  // Space-wide fields (listId: null — every field created before per-List scoping existed) always
  // show; a List-scoped field only shows on the List(s) it was actually created on.
  const customFields: CustomFieldDef[] = (currentSpace?.customFields || []).filter(
    (f) => f.listId === null || activeListIds.has(f.listId)
  );

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
      // Space selected but no List active: normally SpaceHome renders instead of a flat table,
      // so this table is never seen — except in Archive mode, which has no SpaceHome equivalent
      // and needs to show every archived task across the whole Space, not just one List's worth.
      if (showArchived && currentSpace) return collectListIdsUnder(currentSpace, null).includes(task.listId);
      return false;
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

  // Scoped to whatever's currently visible/filtered in the board (filteredTasks), not the whole
  // workspace — the "Clear overdue" toolbar button below only ever touches what's on screen, so
  // its effect is predictable. `dueDateColor` (same util driving the date badges' red state) is
  // the single source of truth for "overdue," so this and the visible badges never disagree.
  const overdueTasksInView = useMemo(
    () => filteredTasks.filter((t) => dueDateColor(t.dueDate) === 'red'),
    [filteredTasks]
  );

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
    // Scoped to the single active List; with multi-select or no List selected (Everything/Space
    // home), there's no one List to own it, so it lands Space-wide — same as every field created
    // before per-List scoping existed.
    const listId = activeListIds.size === 1 ? [...activeListIds][0] : null;
    createCustomField(
      currentSpace.id,
      newFieldName,
      newFieldType,
      newFieldType === 'dropdown' ? [{ label: 'Option 1', color: FIELD_COLOR_CHOICES[0] }] : [],
      undefined,
      listId
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

  const handleQuickAdd = () => {
    if (!newTaskTitle.trim()) return;
    let targetListId: string | null = [...activeListIds][0] ?? null;
    let targetSpaceId = activeSpaceId === 'everything' ? '' : activeSpaceId;

    if (!targetListId && currentSpace && currentSpace.lists.length > 0) {
      targetListId = currentSpace.lists[0].id;
    } else if (!targetListId && currentWorkspace?.spaces[0]?.lists[0]) {
      targetListId = currentWorkspace.spaces[0].lists[0].id;
      targetSpaceId = currentWorkspace.spaces[0].id;
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

  // A raw click/long-press coordinate alone can place a fixed-position menu partway or fully off
  // the viewport edge — especially on a narrow phone screen, where a tap near an edge (e.g. the
  // task card's own top-right "more" button) is common, not a rare case. Clamped to stay fully
  // on-screen with an 8px margin; height is an estimate since actual menu height depends on which
  // items render (a task with no archive option is shorter, etc.) — better to slightly
  // over-reserve space than let the menu clip.
  const clampMenuPosition = (x: number, y: number, width: number, height: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  });

  const openTaskMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 192, 230);
    setTaskMenu({ x, y, task });
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
    setEditSpaceTextColor(space.textColor);
    setEditSpaceIcon(space.icon);
    setEditSpaceCoverUrl(space.coverImageUrl ?? '');
    setSpaceMenu(null);
  };

  const saveSpaceEdit = () => {
    if (!spaceEditTarget) return;
    updateSpace(spaceEditTarget.id, {
      name: editSpaceName.trim() || spaceEditTarget.name,
      color: editSpaceColor,
      textColor: editSpaceTextColor,
      icon: editSpaceIcon,
      coverImageUrl: editSpaceCoverUrl.trim() || null,
    });
    setSpaceEditTarget(null);
  };

  const commitNewSpace = () => {
    const trimmed = newSpaceDraft.trim();
    if (trimmed && currentWorkspace) createSpace(currentWorkspace.id, trimmed);
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
    setEditFolderTextColor(folder.textColor);
    setEditFolderIcon(folder.icon);
    setFolderMenu(null);
  };

  const saveFolderEdit = () => {
    if (!folderEditTarget) return;
    updateFolder(folderEditTarget.spaceId, folderEditTarget.id, {
      name: editFolderName.trim() || folderEditTarget.name,
      color: editFolderColor,
      textColor: editFolderTextColor,
      icon: editFolderIcon,
    });
    setFolderEditTarget(null);
  };

  const startEditList = (list: HierarchyList, spaceId: string) => {
    setListEditTarget({ list, spaceId });
    setEditListName(list.name);
    setEditListColor(list.color);
    setEditListTextColor(list.textColor);
    setEditListIcon(list.icon);
    setListMenu(null);
  };

  const saveListEdit = () => {
    if (!listEditTarget) return;
    updateList(listEditTarget.spaceId, listEditTarget.list.id, {
      name: editListName.trim() || listEditTarget.list.name,
      color: editListColor,
      textColor: editListTextColor,
      icon: editListIcon,
    });
    setListEditTarget(null);
  };

  const openDocMenu = (e: React.MouseEvent, doc: TaskDoc, spaceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDocMenu({ x: e.clientX, y: e.clientY, doc, spaceId });
  };

  const startEditDoc = (doc: TaskDoc, spaceId: string) => {
    setDocEditTarget({ doc, spaceId });
    setEditDocColor(doc.color);
    setEditDocTextColor(doc.textColor);
    setDocMenu(null);
  };

  const saveDocEdit = () => {
    if (!docEditTarget) return;
    updateSpaceDoc(docEditTarget.doc.id, docEditTarget.spaceId, { color: editDocColor, textColor: editDocTextColor });
    setDocEditTarget(null);
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
  const [activeDragEntity, setActiveDragEntity] = useState<{
    kind: 'folder' | 'list' | 'space' | 'person' | 'room' | 'docfolder' | 'spacedoc';
    name: string;
    color?: string | null;
    initials?: string;
    icon?: string | null;
  } | null>(
    null
  );
  const [spaceDropIndicator, setSpaceDropIndicator] = useState<{ targetId: string; position: 'above' | 'below' } | null>(null);
  const spaceOverRef = useRef<
    { mode: 'header'; targetId: string; top: number; height: number } | { mode: 'nested'; targetId: string } | null
  >(null);

  // Same insertion-line pattern as Space reordering above, scoped to standalone-Doc rows
  // (`spacedoc-drag:`/`spacedoc:` — shared by both DocFolderTree.tsx's sidebar rows and
  // DocSubpagesPanel.tsx's subpage rows, since they use the identical id prefixes) — no "nested"
  // mode needed here, unlike Space, since a Doc row's own droppable already covers its full
  // clickable height with nothing else layered underneath it.
  const [docDropIndicator, setDocDropIndicator] = useState<{ targetId: string; position: 'above' | 'below' } | null>(null);
  const docOverRef = useRef<{ targetId: string; top: number; height: number } | null>(null);

  // Same pattern again, scoped to List rows (`list-drag:`/`list:`) — the `list:${id}` droppable
  // is dual-purpose (also a task-drop target), so this only engages while the *dragged* item is
  // itself a List, never for a plain task drag over the same target. Lets a List be dropped at an
  // exact position among a *different* Space's Lists, not just appended via that Space's header.
  const [listDropIndicator, setListDropIndicator] = useState<{ targetId: string; position: 'above' | 'below' } | null>(null);
  const listOverRef = useRef<{ targetId: string; top: number; height: number } | null>(null);

  // dnd-kit ships a built-in autoScroll, but it never actually kicks in for this sidebar (verified
  // directly — holding the pointer at the scrollable container's own edge for several seconds
  // produces zero scrollTop change, even though basic drag/hover detection works fine). Rather than
  // chase why inside dnd-kit's internals, a small manual autoscroll: while any sidebar-tree item is
  // being dragged, scroll the container itself when the pointer is near its top/bottom edge. Fixes
  // the reported "can't drag a Doc into [some Space]" — that Space simply wasn't scrolled into view
  // and nothing scrolled it there mid-drag, not a targeting bug in the drop logic itself.
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const kind = activeDragEntity?.kind;
    if (kind !== 'space' && kind !== 'folder' && kind !== 'list' && kind !== 'docfolder' && kind !== 'spacedoc') return;
    const EDGE = 60; // px from the container's own top/bottom edge that triggers scrolling
    const MAX_SPEED = 14; // px per animation frame at the very edge
    let raf = 0;
    let pointerY = 0;
    const onPointerMove = (e: PointerEvent) => {
      pointerY = e.clientY;
    };
    const tick = () => {
      const el = sidebarScrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const distFromTop = pointerY - rect.top;
        const distFromBottom = rect.bottom - pointerY;
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          if (distFromTop < EDGE && el.scrollTop > 0) {
            el.scrollTop -= MAX_SPEED * (1 - distFromTop / EDGE);
          } else if (distFromBottom < EDGE && el.scrollTop < el.scrollHeight - el.clientHeight) {
            el.scrollTop += MAX_SPEED * (1 - distFromBottom / EDGE);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onPointerMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(raf);
    };
  }, [activeDragEntity?.kind]);

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
    const ok = await copyToClipboard(url);
    showToast(
      ok
        ? 'Calendar feed link copied — paste it into Google/Apple/Outlook calendar as a subscription.'
        : 'Could not copy automatically — copy this link manually: ' + url
    );
  };

  // One-shot signal from app/api/google/oauth/callback/route.ts's redirect — deliberately not
  // part of lib/navUrl.ts's persistent nav-state<->URL sync (it's a single toast trigger, not
  // app state), so it's handled here in its own effect and stripped from the URL immediately
  // after, rather than folded into the existing nav-sync effects.
  useEffect(() => {
    const googleConnect = searchParams.get('googleConnect');
    if (!googleConnect) return;
    showToast(
      googleConnect === 'success' ? 'Google account connected.' : 'Could not connect Google account — please try again.'
    );
    const next = new URLSearchParams(searchParams.toString());
    next.delete('googleConnect');
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Global Ctrl+Z / Ctrl+Shift+Z undo/redo. Skipped while focus is inside an editable element so
  // the browser's own native text-undo keeps working there instead of being hijacked — same
  // `keydown` + cleanup shape as FloatingPopover.tsx's Escape handler, the only other global
  // keyboard listener in this app.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      // Most browsers don't blur the focused element just because the tab lost visibility —
      // switching away and back can leave `document.activeElement` pointing at a text field/doc
      // editor the user no longer thinks of as "in," silently tripping this guard and making
      // global undo look broken (reported as "Ctrl+Z stops working after switching tabs"). A
      // stale reference from an already-closed modal/unmounted editor is also possible. Only
      // treat it as "genuinely editable right now" if it's still connected AND actually laid out
      // (`offsetParent` is null for anything `display:none`/detached) — a real, currently-visible
      // field the user could still be typing into still correctly defers to native undo.
      const isEditable =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) &&
        el.isConnected &&
        el.offsetParent !== null;
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
    // transaction()'s group only closes once its callback's returned Promise resolves — an async
    // callback awaiting every update (Promise.all, same shape as bulkDelete below) is required for
    // that, not a sync forEach firing fetches it doesn't wait for. A sync forEach here would close
    // (and push) an EMPTY group immediately, since none of the individual updateFolder calls'
    // own history pushes (which happen after their own await fetch) have landed yet — so each
    // change would end up as its own separate top-level undo entry instead of one combined step,
    // and Ctrl+Z would only revert the last of them, leaving the rest applied. Only visible when a
    // reorder actually changes 2+ siblings at once (a 2-item swap where one side's old order
    // already happens to equal its new index dodges it by luck) — found via the Office Rooms
    // reorder fix, where a 3-way tie made a simultaneous 2-item change unavoidable.
    useHistoryStore.getState().transaction('Reorder folders', async () => {
      await Promise.all(
        arrayMove(siblings, oldIndex, newIndex).map((f, index) => (f.order !== index ? updateFolder(space.id, f.id, { order: index }) : null))
      );
    });
  };


  // Lets a List and a Doc be dragged into position relative to *each other* in the Tasks-tab
  // sidebar (FolderTree.tsx renders them as sibling-native rows there, but this repo's schema
  // keeps List.folderId and Doc.folderId as two genuinely different foreign keys — List.folderId
  // -> Folder, Doc.folderId -> DocFolder, a completely separate model/table, see prisma/schema.prisma
  // — so a Doc can never actually nest inside a real Folder the way a List can; every sidebar-
  // native Doc is structurally top-level (folderId: null) no matter how it's dragged). Rather than
  // trying to reconcile two incompatible foreign-key spaces, this only ever combines them at the
  // top level (folderId === null): a List target keeps its own real folderId for other List
  // siblings; a Doc target (or a dragged Doc) is always treated as folderId: null, which is the
  // only value it can ever structurally have. One combined, order-sorted sibling array either way,
  // covering both the top-level "Lists + Docs interleaved" case and the plain "Lists nested in a
  // Folder" case (where the Doc side is simply always empty).
  type SidebarSibling = { type: 'list' | 'doc'; id: string; order: number };
  // Docs use boardFolderId here (the Tasks-tab sidebar's own folder axis — see
  // lib/folderTree.ts's getBoardDocsIn), not folderId (the separate Docs-tab/DocFolder axis) —
  // works at every Folder depth now, not just the Space root.
  const combinedSidebarSiblings = (space: HierarchySpace, folderId: string | null): SidebarSibling[] => [
    ...space.lists.filter((l) => l.folderId === folderId).map((l) => ({ type: 'list' as const, id: l.id, order: l.order })),
    ...space.spaceDocs.filter((d) => d.boardFolderId === folderId && d.parentId === null).map((d) => ({ type: 'doc' as const, id: d.id, order: d.order })),
  ];

  const moveSidebarItemRelativeTo = (
    sourceSpace: HierarchySpace,
    dragged: { type: 'list' | 'doc'; id: string },
    targetSpace: HierarchySpace,
    target: { type: 'list' | 'doc'; id: string },
    position: 'above' | 'below'
  ) => {
    // Both branches now look up the right axis per type — Lists via folderId, Docs via
    // boardFolderId — rather than hardcoding null for Docs (which used to mean "a Doc dropped near
    // another Doc/List *inside* a Folder never actually adopted that Folder," only a drop directly
    // on the Folder's own header row did).
    const targetFolderId =
      target.type === 'list'
        ? targetSpace.lists.find((l) => l.id === target.id)?.folderId ?? null
        : targetSpace.spaceDocs.find((d) => d.id === target.id)?.boardFolderId ?? null;
    const draggedFolderId =
      dragged.type === 'list'
        ? sourceSpace.lists.find((l) => l.id === dragged.id)?.folderId ?? null
        : sourceSpace.spaceDocs.find((d) => d.id === dragged.id)?.boardFolderId ?? null;
    const sameContext = sourceSpace.id === targetSpace.id && draggedFolderId === targetFolderId;

    const writeOrder = (space: HierarchySpace, items: SidebarSibling[]) =>
      Promise.all(
        items.map((item, index) =>
          item.type === 'list' ? reorderList(space.id, item.id, index) : reorderSpaceDoc(space.id, item.id, index)
        )
      );

    if (sameContext) {
      const siblings = combinedSidebarSiblings(sourceSpace, targetFolderId).sort((a, b) => a.order - b.order);
      const withoutDragged = siblings.filter((s) => !(s.type === dragged.type && s.id === dragged.id));
      const targetIndex = withoutDragged.findIndex((s) => s.type === target.type && s.id === target.id);
      if (targetIndex === -1) return;
      const insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
      const draggedEntry = siblings.find((s) => s.type === dragged.type && s.id === dragged.id);
      if (!draggedEntry) return;
      const next = [...withoutDragged.slice(0, insertAt), draggedEntry, ...withoutDragged.slice(insertAt)];
      useHistoryStore.getState().transaction(dragged.type === 'list' ? 'Reorder lists' : 'Reorder documents', async () => {
        await writeOrder(sourceSpace, next);
      });
      return;
    }

    useHistoryStore.getState().transaction(dragged.type === 'list' ? 'Move list' : 'Move document', async () => {
      if (dragged.type === 'list') await moveList(sourceSpace.id, dragged.id, targetFolderId, targetSpace.id);
      else await moveDocToBoardFolder(sourceSpace.id, dragged.id, targetFolderId, targetSpace.id);
      const siblings = combinedSidebarSiblings(targetSpace, targetFolderId)
        .filter((s) => !(s.type === dragged.type && s.id === dragged.id))
        .sort((a, b) => a.order - b.order);
      const targetIndex = siblings.findIndex((s) => s.type === target.type && s.id === target.id);
      if (targetIndex === -1) return;
      const insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
      const next = [...siblings.slice(0, insertAt), { ...dragged, order: 0 }, ...siblings.slice(insertAt)];
      await writeOrder(targetSpace, next);
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
    useHistoryStore.getState().transaction('Reorder doc folders', async () => {
      await Promise.all(
        arrayMove(siblings, oldIndex, newIndex).map((f, index) => (f.order !== index ? updateDocFolder(space.id, f.id, { order: index }) : null))
      );
    });
  };

  // Rooms are workspace-scoped, not nested under a Space, so this is flat siblings-among-all-
  // rooms — same arrayMove + transaction shape as every other reorder helper regardless.
  const reorderRoomSiblings = (workspace: HierarchyWorkspace, draggedId: string, targetId: string) => {
    const siblings = [...workspace.rooms].sort((a, b) => a.order - b.order);
    const oldIndex = siblings.findIndex((r) => r.id === draggedId);
    const newIndex = siblings.findIndex((r) => r.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;
    useHistoryStore.getState().transaction('Reorder rooms', async () => {
      await Promise.all(arrayMove(siblings, oldIndex, newIndex).map((r, index) => (r.order !== index ? updateRoom(r.id, { order: index }) : null)));
    });
  };

  // Explicit above/below position, mirroring reorderSpaceRelativeTo — driven by the insertion-line
  // indicator (docDropIndicator) rather than arrayMove's implicit "lands at the target's index"
  // behavior, so a drop always matches whichever side of the target row the indicator last showed.
  // `targetSpace` defaults to `sourceSpace` for the common same-Space case; passed explicitly for
  // a cross-Space drop (previously unsupported here — a Doc dropped onto another Doc in a
  // *different* Space silently did nothing, since this always looked up both the dragged doc and
  // the sibling group in the same single `space` param).
  const reorderSpaceDocRelativeTo = (
    sourceSpace: HierarchySpace,
    draggedId: string,
    targetId: string,
    position: 'above' | 'below',
    targetSpace: HierarchySpace = sourceSpace
  ) => {
    const dragged = sourceSpace.spaceDocs.find((d) => d.id === draggedId);
    const target = targetSpace.spaceDocs.find((d) => d.id === targetId);
    if (!dragged || !target) return;
    // Every subpage has folderId: null (same as every top-level, non-foldered doc — see
    // TaskDoc.parentId's own comment), so folderId alone isn't enough to tell true siblings
    // apart from two subpages that just happen to sit under different parents. Matching parentId
    // too is what actually scopes this to "docs shown together in the same row/panel" — without
    // it, dragging one subpage onto another would silently reorder against every null-folderId
    // doc in the whole Space, not just its real siblings.
    if (sourceSpace.id === targetSpace.id && dragged.folderId === target.folderId && dragged.parentId === target.parentId) {
      const siblings = sourceSpace.spaceDocs
        .filter((d) => d.folderId === dragged.folderId && d.parentId === dragged.parentId)
        .sort((a, b) => a.order - b.order);
      const withoutDragged = siblings.filter((d) => d.id !== draggedId);
      const targetIndex = withoutDragged.findIndex((d) => d.id === targetId);
      if (targetIndex === -1) return;
      const insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
      const next = [...withoutDragged.slice(0, insertAt), dragged, ...withoutDragged.slice(insertAt)];
      useHistoryStore.getState().transaction('Reorder documents', async () => {
        await Promise.all(next.map((d, index) => (d.order !== index ? reorderSpaceDoc(sourceSpace.id, d.id, index) : null)));
      });
      return;
    }

    useHistoryStore.getState().transaction('Move document', async () => {
      await moveSpaceDoc(sourceSpace.id, draggedId, target.folderId, targetSpace.id);
      const siblings = targetSpace.spaceDocs
        .filter((d) => d.id !== draggedId && d.folderId === target.folderId && d.parentId === target.parentId)
        .sort((a, b) => a.order - b.order);
      const targetIndex = siblings.findIndex((d) => d.id === targetId);
      if (targetIndex === -1) return;
      const insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
      const next = [...siblings.slice(0, insertAt), dragged, ...siblings.slice(insertAt)];
      await Promise.all(next.map((d, index) => reorderSpaceDoc(targetSpace.id, d.id, index)));
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
    useHistoryStore.getState().transaction('Reorder spaces', async () => {
      await Promise.all(next.map((s, index) => (s.order !== index ? reorderSpace(s.id, index) : null)));
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

    if (draggedId.startsWith('room-drag:')) {
      const roomId = draggedId.slice('room-drag:'.length);
      const room = workspaces.flatMap((w) => w.rooms).find((r) => r.id === roomId);
      if (room) setActiveDragEntity({ kind: 'room', name: room.name, color: room.color, icon: room.icon });
      return;
    }

    if (draggedId.startsWith('docfolder-drag:') || draggedId.startsWith('spacedoc-drag:') || draggedId.startsWith('subpage-drag:')) {
      const isDocFolder = draggedId.startsWith('docfolder-drag:');
      // `subpage-drag:` (DocSubpagesPanel.tsx) is the identical concept as `spacedoc-drag:` (the
      // sidebar) under a different id prefix — the two panels can render the same doc's row at
      // once, so they can't share an id (see DocSubpagesPanel.tsx's own comment on this).
      const treeId = isDocFolder
        ? draggedId.slice('docfolder-drag:'.length)
        : draggedId.slice((draggedId.startsWith('subpage-drag:') ? 'subpage-drag:' : 'spacedoc-drag:').length);
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
      docOverRef.current = null;
      setDocDropIndicator(null);
      listOverRef.current = null;
      setListDropIndicator(null);
      return;
    }
    const draggedId = active.id as string;
    const overId = over.id as string;

    if (draggedId.startsWith('list-drag:')) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      docOverRef.current = null;
      setDocDropIndicator(null);
      const draggedListId = draggedId.slice('list-drag:'.length);
      // `list:${id}` is dual-purpose (also a task-drop target) — only meaningful as a reorder
      // target here since the dragged item is itself a List. Also tracks hovering a `spacedoc:`
      // target (a Doc row) — Lists and top-level Docs render interleaved in this sidebar
      // (FolderTree.tsx), so dropping a List next to a Doc needs the same live indicator.
      if ((overId.startsWith('list:') || overId.startsWith('spacedoc:')) && over.rect) {
        const targetId = overId.startsWith('spacedoc:') ? overId.slice('spacedoc:'.length) : overId.slice('list:'.length);
        listOverRef.current = targetId === draggedListId ? null : { targetId, top: over.rect.top, height: over.rect.height };
      } else {
        listOverRef.current = null;
      }
      return;
    }

    if (draggedId.startsWith('subpage-drag:')) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      listOverRef.current = null;
      setListDropIndicator(null);
      // Subpages panel only ever reorders against its own `subpage:` rows — no Lists there.
      const draggedDocId = draggedId.slice('subpage-drag:'.length);
      if (overId.startsWith('subpage:') && over.rect) {
        const targetId = overId.slice('subpage:'.length);
        docOverRef.current = targetId === draggedDocId ? null : { targetId, top: over.rect.top, height: over.rect.height };
      } else {
        docOverRef.current = null;
      }
      return;
    }

    if (draggedId.startsWith('spacedoc-drag:')) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      // A Doc dragged from the sidebar can be hovering either another Doc (`spacedoc:`, either
      // tab) or a List (`list:`, only possible in the Tasks tab, where Lists and top-level Docs
      // render interleaved) — feed both refs identically; whichever component is actually
      // mounted (DocFolderTree.tsx reads docDropIndicator, FolderTree.tsx reads
      // listDropIndicator) picks up the one relevant to it, the other is simply unused.
      const draggedDocId = draggedId.slice('spacedoc-drag:'.length);
      if ((overId.startsWith('spacedoc:') || overId.startsWith('list:')) && over.rect) {
        const targetId = overId.startsWith('spacedoc:') ? overId.slice('spacedoc:'.length) : overId.slice('list:'.length);
        const next = targetId === draggedDocId ? null : { targetId, top: over.rect.top, height: over.rect.height };
        docOverRef.current = next;
        listOverRef.current = next;
      } else {
        docOverRef.current = null;
        listOverRef.current = null;
      }
      return;
    }

    if (!draggedId.startsWith('space-drag:')) {
      spaceOverRef.current = null;
      setSpaceDropIndicator(null);
      docOverRef.current = null;
      setDocDropIndicator(null);
      listOverRef.current = null;
      setListDropIndicator(null);
      return;
    }
    docOverRef.current = null;
    setDocDropIndicator(null);
    listOverRef.current = null;
    setListDropIndicator(null);
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

  // Same continuous pointer tracking, scoped to standalone-Doc drags.
  useEffect(() => {
    if (activeDragEntity?.kind !== 'spacedoc') return;
    const onPointerMove = (e: PointerEvent) => {
      const over = docOverRef.current;
      if (!over) {
        setDocDropIndicator(null);
        return;
      }
      const overCenterY = over.top + over.height / 2;
      setDocDropIndicator({ targetId: over.targetId, position: e.clientY < overCenterY ? 'above' : 'below' });
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [activeDragEntity?.kind]);

  // Same continuous pointer tracking, scoped to List drags — also runs during a Doc drag
  // (`spacedoc`), since Lists and top-level Docs render interleaved in this sidebar and a Doc
  // drag needs this same indicator when hovering a List row (handleTaskDragOver feeds
  // listOverRef for both cases — see its spacedoc-drag branch).
  useEffect(() => {
    if (activeDragEntity?.kind !== 'list' && activeDragEntity?.kind !== 'spacedoc') return;
    const onPointerMove = (e: PointerEvent) => {
      const over = listOverRef.current;
      if (!over) {
        setListDropIndicator(null);
        return;
      }
      const overCenterY = over.top + over.height / 2;
      setListDropIndicator({ targetId: over.targetId, position: e.clientY < overCenterY ? 'above' : 'below' });
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [activeDragEntity?.kind]);

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const droppedSpaceIndicator = spaceDropIndicator;
    const droppedDocIndicator = docDropIndicator;
    const droppedListIndicator = listDropIndicator;
    setActiveDragTask(null);
    setActiveDragEntity(null);
    setSpaceDropIndicator(null);
    spaceOverRef.current = null;
    setDocDropIndicator(null);
    docOverRef.current = null;
    setListDropIndicator(null);
    listOverRef.current = null;
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

    // Reuses the same `room-drop:` droppable people drag onto (disambiguated by the dragged id's
    // prefix, same trick as every other reorder-vs-drop-target reuse in this app) — dropping a
    // Room onto another Room reorders them; the Unassigned tray isn't a valid reorder target.
    if (draggedId.startsWith('room-drag:')) {
      const roomId = draggedId.slice('room-drag:'.length);
      if (overId.startsWith('room-drop:')) {
        const targetId = overId.slice('room-drop:'.length);
        if (targetId !== 'unassigned' && targetId !== roomId) {
          const workspace = workspaces.find((w) => w.rooms.some((r) => r.id === roomId));
          if (workspace) reorderRoomSiblings(workspace, roomId, targetId);
        }
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
      } else if ((overId.startsWith('list:') || overId.startsWith('spacedoc:')) && !isFolder) {
        // Lists can't "contain" anything, so a List dragged onto another List's `list:` target
        // (already registered for task-drops) has no competing meaning the way folder-onto-
        // folder does — for a list-drag specifically, it always means reorder/move. Also accepts
        // a `spacedoc:` target (a Doc row) — Lists and top-level Docs render interleaved in this
        // sidebar, so a List needs to be droppable relative to a Doc too, not just other Lists.
        // Works across Spaces too, landing exactly where listDropIndicator last showed — search
        // all Spaces for the target (same reasoning as the folder-drop branch above).
        const isDocTarget = overId.startsWith('spacedoc:');
        const targetId = isDocTarget ? overId.slice('spacedoc:'.length) : overId.slice('list:'.length);
        const targetSpace = allSpaces.find((s) => (isDocTarget ? s.spaceDocs.some((d) => d.id === targetId) : s.lists.some((l) => l.id === targetId)));
        if (targetId !== treeId && targetSpace) {
          const position = droppedListIndicator?.targetId === targetId ? droppedListIndicator.position : 'below';
          moveSidebarItemRelativeTo(space, { type: 'list', id: treeId }, targetSpace, { type: isDocTarget ? 'doc' : 'list', id: targetId }, position);
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

    // Same reorder concept from the DocSubpagesPanel side panel, under its own distinct id prefix
    // (see that component's own comment on why it can't share the sidebar's ids) — only supports
    // sibling reorder via `subpage:`, since that panel never renders a docfolder-drop/Space target.
    if (draggedId.startsWith('subpage-drag:')) {
      const treeId = draggedId.slice('subpage-drag:'.length);
      const space = workspaces.flatMap((w) => w.spaces).find((s) => s.spaceDocs.some((d) => d.id === treeId));
      if (!space || !overId.startsWith('subpage:')) return;
      const targetDocId = overId.slice('subpage:'.length);
      if (targetDocId !== treeId && space.spaceDocs.some((d) => d.id === targetDocId)) {
        const position = droppedDocIndicator?.targetId === targetDocId ? droppedDocIndicator.position : 'below';
        reorderSpaceDocRelativeTo(space, treeId, targetDocId, position);
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
      } else if (overId.startsWith('folder-drop:') && !isDocFolder) {
        // A Doc dropped onto a real Folder (`folder-drop:` target, the same droppable Lists use) —
        // independent from the docfolder-drop: branch above (which moves between DocFolders, the
        // Docs tab's own tree). Mirrors the list-drag/folder-drag branch's own folder-drop
        // handling: search all Spaces for the target, not just the source, so a cross-Space move
        // works too.
        const targetFolderId = overId.slice('folder-drop:'.length);
        const targetSpace = allSpaces.find((s) => s.folders.some((f) => f.id === targetFolderId));
        if (targetSpace) moveDocToBoardFolder(space.id, treeId, targetFolderId, targetSpace.id);
      } else if (overId.startsWith('list:') && !isDocFolder) {
        // A Doc dropped onto a List (`list:` target) — only possible in the Tasks-tab sidebar,
        // where Lists and top-level Docs render interleaved. Goes through the same combined
        // List+Doc ordering as a List-onto-Doc drop (see the list-drag branch above), rather than
        // reorderSpaceDocRelativeTo (which only knows about Docs, not the Lists interleaved
        // between them).
        const targetListId = overId.slice('list:'.length);
        const targetSpace = allSpaces.find((s) => s.lists.some((l) => l.id === targetListId));
        if (targetSpace) {
          const position = droppedListIndicator?.targetId === targetListId ? droppedListIndicator.position : 'below';
          moveSidebarItemRelativeTo(space, { type: 'doc', id: treeId }, targetSpace, { type: 'list', id: targetListId }, position);
        }
      } else if (overId.startsWith('spacedoc:') && !isDocFolder) {
        const targetDocId = overId.slice('spacedoc:'.length);
        // Search all Spaces for the target, not just the source one — same reasoning as every
        // other cross-Space drop in this file; previously scoped to `space.spaceDocs` only, so a
        // Doc dropped onto another Doc in a *different* Space silently did nothing.
        const targetSpace = allSpaces.find((s) => s.spaceDocs.some((d) => d.id === targetDocId));
        // Drop exactly where the indicator last showed, same as Space reordering — `over` alone
        // can't distinguish "insert before" from "insert after" the target row.
        if (targetDocId !== treeId && targetSpace) {
          const position = droppedDocIndicator?.targetId === targetDocId ? droppedDocIndicator.position : 'below';
          // The `spacedoc:` id is shared by both DocFolderTree.tsx (Docs tab — folderId/DocFolder
          // is the right axis) and FolderTree.tsx (Tasks tab — boardFolderId is) — `activeView`
          // picks the one actually relevant here, since only one of those trees is ever mounted at
          // once. Tasks-tab reuses moveSidebarItemRelativeTo (already boardFolderId-aware, same
          // function the list: branch above already uses) rather than a parallel duplicate.
          if (activeView === 'docs') {
            reorderSpaceDocRelativeTo(space, treeId, targetDocId, position, targetSpace);
          } else {
            moveSidebarItemRelativeTo(space, { type: 'doc', id: treeId }, targetSpace, { type: 'doc', id: targetDocId }, position);
          }
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
      moveTaskToList(draggedId, overId.slice('list:'.length));
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
        moveTaskToList(draggedId, listIds[0]);
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
      setActiveOfficeRoomId(null);
    }
  };

  // ---- Docs (live collaborative content via CollabDocEditor; title is still a plain field) ----
  const captureDocEditBaseline = () => {
    const doc = activeTaskDocs.find((d) => d.id === activeDocId);
    if (doc) docEditBaselineRef.current = { docId: doc.id, title: doc.title, content: doc.content };
  };

  // Fires at most once per edit session (bounded by this editor instance's own focus→blur), for
  // whichever of title/content actually changed. `liveText` is this browser tab's own current
  // text, passed by CollabDocEditor's onEditorBlur — under real concurrent editing, two people
  // blurring around the same moment can now log two sessions instead of one; inherent to moving
  // from a single shared field to a multi-writer document, not a regression to fix.
  const commitDocEditActivity = (liveText?: string) => {
    useHistoryStore.getState().endCoalesce();
    const baseline = docEditBaselineRef.current;
    const doc = activeTaskDocs.find((d) => d.id === activeDocId);
    if (!baseline || !doc || baseline.docId !== doc.id || !activeModalTaskId) return;
    if (doc.title !== baseline.title) {
      logActivity(activeModalTaskId, `Dokument omdøpt til «${doc.title}»`, 'docEdited');
    } else if (liveText !== undefined && liveText !== baseline.content) {
      logActivity(activeModalTaskId, `Dokument redigert: «${doc.title}»`, 'docEdited');
    }
    docEditBaselineRef.current = { docId: doc.id, title: doc.title, content: liveText ?? baseline.content };
  };

  const handleNewDoc = async () => {
    if (!activeModalTaskId) return;
    const doc = await createDoc(activeModalTaskId);
    if (doc) setActiveDocId(doc.id);
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

  // ---- Docs tab: full-page editor — live collaborative content via CollabDocEditor ----
  const activeStandaloneDoc = currentSpace?.spaceDocs.find((d) => d.id === activeStandaloneDocId) ?? null;

  // Doc-ancestor breadcrumb (Space > [DocFolder chain, if the root ancestor lives in one] > Doc >
  // ... > current doc) — built entirely from the already-loaded spaceDocs/docFolders, same
  // parentId-walk technique DocsBrowser.tsx already uses for its own Space > DocFolder trail, no
  // extra fetch needed either way.
  const docBreadcrumb = useMemo(() => {
    if (!currentSpace || !activeStandaloneDoc) return { folderChain: [] as HierarchyDocFolder[], docChain: [] as TaskDoc[] };
    const docChain: TaskDoc[] = [];
    let docCursor: TaskDoc | null = activeStandaloneDoc;
    while (docCursor) {
      docChain.unshift(docCursor);
      const parentId: string | null = docCursor.parentId;
      docCursor = parentId ? currentSpace.spaceDocs.find((d) => d.id === parentId) ?? null : null;
    }
    const rootDoc = docChain[0];
    const folderChain: HierarchyDocFolder[] = [];
    let folderCursor = rootDoc?.folderId ? currentSpace.docFolders.find((f) => f.id === rootDoc.folderId) ?? null : null;
    while (folderCursor) {
      folderChain.unshift(folderCursor);
      const parentId: string | null = folderCursor.parentId;
      folderCursor = parentId ? currentSpace.docFolders.find((f) => f.id === parentId) ?? null : null;
    }
    return { folderChain, docChain };
  }, [currentSpace, activeStandaloneDoc]);

  // The "book" this doc belongs to is rooted at docBreadcrumb.docChain[0] (already walked all the
  // way up). Every page in the book is reachable as some depth of descendant of that root, so
  // checking the root's own direct children is enough to know whether the book has any pages
  // beyond a lone empty doc — no separate recursive count needed.
  const docBookRoot = docBreadcrumb.docChain[0] ?? null;
  const docBookHasPages = !!(currentSpace && docBookRoot && getChildDocs(currentSpace, docBookRoot.id).length > 0);

  const handleNewSpaceDoc = async () => {
    if (!currentSpace) return;
    const doc = await createSpaceDoc(currentSpace.id, activeDocFolderId, {});
    if (doc) setDocsNavigation(activeDocFolderId, doc.id);
  };

  if (isLoading) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-neutral-950 text-blue-400 font-mono text-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading Siqt...</span>
        </div>
      </div>
    );
  }

  const activeModalTask = activeModalTaskId ? tasks.find((t) => t.id === activeModalTaskId) ?? null : null;
  // Archived (done) subtasks stay out of the list, same as the main Task list already does for
  // top-level tasks (filteredTasks' own `!!task.archived === showArchived` filter) — this list had
  // no such filter at all, so marking a subtask done just left it sitting there, green, forever,
  // instead of disappearing the way checking off a normal task does.
  const currentSubtasks = activeModalTask ? tasks.filter((t) => t.parentId === activeModalTask.id && !t.archived) : [];
  const activeComments = activeModalTask ? comments[activeModalTask.id] || [] : [];
  const allListsFlat = workspaces.flatMap((ws) => ws.spaces.flatMap((s) => s.lists.map((l) => ({ ...l, spaceName: s.name }))));

  // The task's own Space (via its List) — scopes the "Link existing doc" picker to standalone
  // docs from the same Space, rather than an overwhelming cross-Space list.
  const activeModalTaskSpace = activeModalTask
    ? workspaces.flatMap((w) => w.spaces).find((s) => s.lists.some((l) => l.id === activeModalTask.listId))
    : null;
  const linkableSpaceDocs = activeModalTaskSpace ? activeModalTaskSpace.spaceDocs.filter((d) => d.taskId === null) : [];

  // Reverse picker: Tasks in the current Space, for linking an existing Task onto a standalone
  // doc from the Docs tab side. Same Space-scoping rationale as linkableSpaceDocs above.
  const linkableTasks = currentSpace
    ? tasks.filter((t) => !t.archived && collectListIdsUnder(currentSpace, null).includes(t.listId))
    : [];

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

  return (
    <DndContext sensors={taskSensors} collisionDetection={closestCenter} onDragStart={handleTaskDragStart} onDragOver={handleTaskDragOver} onDragEnd={handleTaskDragEnd}>
    {/* select-none here is app-wide (mostly buttons/rows/drag targets, not prose) — CSS
        user-select is inherited, so any real copyable text content (chat messages, task
        descriptions, comments, etc.) needs its own explicit `select-text` to opt back in, or it
        silently can't be highlighted at all. See ChatPanel.tsx/ChatThreadPanel.tsx's message
        body divs for the pattern. */}
    {/* h-dvh, not h-screen (100vh) — on mobile, 100vh is sized against the browser's *largest*
        possible viewport (address bar hidden), not the currently visible one, so with the
        address bar showing, a 100vh-tall root pushes its last flex child (the mobile bottom nav)
        below the actual visible fold, requiring a scroll to reach it. `dvh` tracks the real
        visible viewport and updates as the browser chrome shows/hides — the standard fix for
        exactly this class of "have to scroll to see the bottom bar" mobile-web bug. */}
    <div className="flex flex-col h-dvh bg-neutral-950 text-neutral-100 font-sans overflow-hidden select-none">
      {/* ================= TOP BAR — workspace + search, so the icon rail/sidebar below don't
          have to carry that weight themselves (previously both lived stacked at the very top
          of the sidebar, which read as cramped). ================= */}
      <header className="h-14 shrink-0 border-b-0 md:border-b border-neutral-800/80 bg-neutral-950 flex items-center px-3 gap-4">
        {/* Workspace name/switcher is desktop-only now — mobile switches workspace from the
            popup menu's own "Workspace" section (AppLauncherGrid.tsx) instead, per explicit
            feedback that having it in both places (top bar AND the popup) was one too many. The
            "S" brand mark itself is desktop-only too now — mobile shows the current view's own
            name instead ("Planner"/"Chat"/"My Tasks"/etc, same labels the breadcrumb already
            uses), matching MobileSpacesSheet's own title-on-the-left header shape so every mobile
            screen's top bar reads consistently instead of a plain logo everywhere except Spaces. */}
        <div className="flex items-center gap-2 shrink-0 md:w-64">
          <div className="hidden md:flex w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-blue-700 items-center justify-center font-black text-white shadow-lg shadow-blue-500/20 shrink-0">
            S
          </div>
          <span className="md:hidden text-lg font-semibold text-white shrink-0">{mobileHeaderTitle}</span>
          <FloatingPopover
            open={workspaceSwitcherOpen}
            onClose={() => {
              setWorkspaceSwitcherOpen(false);
              setCreatingWorkspace(false);
            }}
            panelClassName="w-64 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1 max-h-[70vh] overflow-y-auto"
            anchor={
              <button
                onClick={() => setWorkspaceSwitcherOpen((o) => !o)}
                className="hidden md:flex min-w-0 flex-1 items-center justify-between gap-1 cursor-pointer group"
                title="Switch workspace"
              >
                <div className="min-w-0 text-left">
                  <h1 className="font-bold tracking-tight text-white leading-tight text-sm truncate">
                    {currentWorkspace?.name ?? 'No workspace'}
                  </h1>
                </div>
                {/* Pending workspace invites (backlog #8) previously had zero visible signal outside
                    this popover's own contents — genuinely invisible unless someone thought to open
                    it. Same badge convention as the Chat/Network unread counts above. */}
                {memberInvitesIncoming.length > 0 && (
                  <span
                    title={`${memberInvitesIncoming.length} pending workspace invite${memberInvitesIncoming.length === 1 ? '' : 's'}`}
                    className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none"
                  >
                    {memberInvitesIncoming.length > 99 ? '99+' : memberInvitesIncoming.length}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 shrink-0" />
              </button>
            }
          >
            {/* Incoming, targeted workspace invites via Network (backlog #8) — shown first since
                this is actionable, not just navigation. Same Accept/Decline shape as Connection
                requests. */}
            {memberInvitesIncoming.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-3 py-1">Invites ({memberInvitesIncoming.length})</div>
                {memberInvitesIncoming.map((inv) => (
                  <div key={inv.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-200 truncate">{inv.workspace.name}</div>
                      <div className="text-[10px] text-neutral-500 truncate">from {inv.invitedBy.name}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => acceptMemberInvite(inv.id)}
                        title="Accept"
                        className="w-6 h-6 rounded flex items-center justify-center text-green-500 hover:bg-neutral-800 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => declineMemberInvite(inv.id)}
                        title="Decline"
                        className="w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-800 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-neutral-800 my-1" />
              </>
            )}
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-3 py-1">Workspaces</div>
            {workspaces.filter((ws) => !ws.isPersonal).map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setActiveWorkspaceId(ws.id);
                  setWorkspaceSwitcherOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800/60 cursor-pointer flex items-center justify-between gap-2 ${
                  ws.id === currentWorkspace?.id ? 'text-blue-400' : 'text-neutral-300'
                }`}
              >
                <span className="truncate">{ws.name}</span>
                {ws.members.length === 1 && <span className="text-[9px] text-neutral-600 shrink-0">Private</span>}
              </button>
            ))}
            <div className="border-t border-neutral-800 my-1" />
            {creatingWorkspace ? (
              <div className="mx-3 my-1 space-y-2">
                <input
                  autoFocus
                  value={newWorkspaceDraft}
                  onChange={(e) => setNewWorkspaceDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setNewWorkspaceDraft('');
                      setCreatingWorkspace(false);
                    }
                  }}
                  placeholder="Workspace name..."
                  className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                />
                <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded p-0.5">
                  <button
                    type="button"
                    onClick={() => setNewWorkspaceType('company')}
                    className={`flex-1 text-[10px] py-1 rounded cursor-pointer transition ${
                      newWorkspaceType === 'company' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Company
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewWorkspaceType('personal_project')}
                    className={`flex-1 text-[10px] py-1 rounded cursor-pointer transition ${
                      newWorkspaceType === 'personal_project' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Personal project
                  </button>
                </div>
                <input
                  type="email"
                  value={newWorkspaceEmail}
                  onChange={(e) => setNewWorkspaceEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setNewWorkspaceDraft('');
                      setCreatingWorkspace(false);
                    }
                  }}
                  placeholder="Work email (optional)"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newWorkspaceDraft.trim();
                    if (trimmed && currentUserId) {
                      createWorkspace(trimmed, currentUserId, {
                        orgType: newWorkspaceType,
                        workEmail: newWorkspaceEmail.trim() || null,
                      });
                    }
                    setNewWorkspaceDraft('');
                    setNewWorkspaceEmail('');
                    setNewWorkspaceType('company');
                    setCreatingWorkspace(false);
                  }}
                  disabled={!newWorkspaceDraft.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] py-1.5 rounded font-medium cursor-pointer"
                >
                  Create workspace
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  currentUserId ? setCreatingWorkspace(true) : showToast('Sign in first to create a workspace.')
                }
                className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" /> New workspace
              </button>
            )}
            {/* Member view/add/remove moved to Office (per explicit feedback — Office is the
                team-roster surface, this popover is for switching *which* workspace, not managing
                who's in it). Office's own avatar tiles already cover view+remove via
                ManageableAvatar's right-click menu; a "+ Add / Invite" entry point lives in
                OfficeRooms.tsx's own header now. */}
            {currentWorkspace && !currentWorkspace.isPersonal && (
              <button
                onClick={() => {
                  setActiveView('office');
                  setWorkspaceSwitcherOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-1.5 border-t border-neutral-800 mt-1"
              >
                <Building2 className="w-3 h-3" /> Manage team in Office
              </button>
            )}
          </FloatingPopover>
        </div>
        {/* Mobile's own search pill moved down into the per-view header row below (same row as
            the back button/Spaces/Archive/Chat/Pages buttons) so it sits in one consistent spot
            across every view instead of sharing this title row — this row is title-only on
            mobile now, matching how plain it reads on desktop next to the workspace switcher. */}
        <div className="hidden md:flex flex-1 justify-center">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full max-w-md flex items-center gap-2 bg-neutral-900/60 rounded border border-neutral-800/80 px-3 py-1.5 text-[11px] text-neutral-500 hover:border-neutral-700 hover:text-neutral-300 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search...</span>
            <span className="hidden md:inline text-[9px] font-mono text-neutral-600">Ctrl+K</span>
          </button>
        </div>
        <div className="hidden md:block w-64 shrink-0" aria-hidden />
      </header>

      <div className="flex flex-1 overflow-hidden">
      {/* ================= ICON RAIL ================= */}
      <nav className="w-14 bg-neutral-950 border-r border-neutral-800/80 hidden md:flex flex-col items-center py-4 gap-2 shrink-0 select-none">
        {visibleNavTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={tab.onClick}
            title={tab.label}
            className={`relative w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
              tab.active ? 'bg-neutral-800 text-blue-400' : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="text-[8px] font-medium leading-none">{tab.label}</span>
            {!!tab.badge && tab.badge > 0 && (
              <span className="absolute top-0.5 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}

        {/* Pushes Trash/Settings down to the bottom, visually separated from the view-switching
            tabs above — neither is a tab, so they shouldn't sit in the same run as Tasks/Planner/
            Docs/Office. */}
        <div className="flex-1" />
        <div className="w-8 border-t border-neutral-800/80 mb-2" />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Workspace settings"
          className="w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
        >
          <Settings className="w-4 h-4" />
          <span className="text-[8px] font-medium leading-none">Settings</span>
        </button>
        <button
          onClick={() => setTrashOpen(true)}
          title="Trash"
          className="w-10 h-10 rounded flex flex-col items-center justify-center gap-0.5 transition cursor-pointer text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[8px] font-medium leading-none">Trash</span>
        </button>
      </nav>

      {/* ================= LEFT MENU (SIDEBAR) ================= */}
      <aside className="w-64 bg-neutral-900/90 border-r border-neutral-800/80 hidden md:flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Persistent "Me" zone — above the workspace switcher, not a nav-rail tab. Avatar
              opens the profile page; the two lists below split what used to be one cross-
              workspace "My Tasks" nav icon into a private personal list (spans every workspace,
              only this identity ever sees it) and an assigned-tasks list scoped to whichever
              workspace is currently active. */}
          <div className="px-4 py-3 border-b border-neutral-800/80">
            {(() => {
              const me = users.find((u) => u.id === currentUserId);
              if (!me) {
                return <div className="text-[11px] text-neutral-500 px-1 py-1">Sign in to see your tasks.</div>;
              }
              return (
                <div className="space-y-1">
                  <FloatingPopover
                    open={userMenuOpen}
                    onClose={() => setUserMenuOpen(false)}
                    panelClassName="w-60 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
                    anchor={
                      <button
                        onClick={() => setUserMenuOpen((o) => !o)}
                        className={`w-full flex items-center gap-2.5 px-1 py-1 rounded cursor-pointer transition ${
                          activeView === 'profile' || userMenuOpen ? 'bg-neutral-800' : 'hover:bg-neutral-800/40'
                        }`}
                      >
                        {me.avatarUrl ? (
                          <img src={me.avatarUrl} alt={me.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <span
                            className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: me.color }}
                          >
                            {me.initials}
                          </span>
                        )}
                        <div className="min-w-0 text-left flex-1">
                          <div className="text-xs font-semibold text-white truncate">{me.name}</div>
                          <div className="text-[10px] text-neutral-500">View profile</div>
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      </button>
                    }
                  >
                    <div className="px-3 py-2.5 border-b border-neutral-800 flex items-center gap-2.5">
                      {me.avatarUrl ? (
                        <img src={me.avatarUrl} alt={me.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <span
                          className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: me.color }}
                        >
                          {me.initials}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate">{me.name}</div>
                        {me.email && <div className="text-[10px] text-neutral-500 truncate">{me.email}</div>}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveView('profile');
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-800/60 cursor-pointer"
                    >
                      <UserCircle className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-xs text-neutral-300">My Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setAccountSettingsOpen(true);
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-800/60 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-xs text-neutral-300">Settings</span>
                    </button>
                    <div className="border-t border-neutral-800 my-1" />
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut({ redirectTo: '/login' });
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-800/60 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-xs text-neutral-300">Sign out</span>
                    </button>
                  </FloatingPopover>
                  <button
                    // "My tasks" is a real private Workspace under the hood (isPersonal: true,
                    // its own Space/List, auto-created via the atomic /personal upsert route) —
                    // this button switches straight into it, same as picking any workspace from
                    // the switcher, so the exact same Spaces/Lists sidebar tree and Board columns
                    // render for it with zero new UI: create as many/few personal Spaces/Lists as
                    // you want, tasks look identical to any other workspace's board. Deliberately
                    // NOT its own activeView — Board rendering isn't componentized in this file,
                    // it's the real activeView === 'board' branch keyed on activeWorkspaceId, so
                    // reusing it this way is what makes the personal Space/List tree "just work."
                    onClick={async () => {
                      if (!currentUserId) return;
                      // Same fix as the mobile "My Tasks" tile (app/page.tsx's meNavItems) —
                      // selecting just the workspace left activeSpaceId pointed at its one
                      // auto-created Space with no List chosen, landing on SpaceHome instead of
                      // the tasks themselves. Selecting the List directly skips that.
                      const { workspaceId, spaceId, listId } = await ensurePersonalWorkspace(currentUserId);
                      setActiveWorkspaceId(workspaceId);
                      setNavigation(spaceId, [listId]);
                      setActiveView('board');
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] cursor-pointer flex items-center gap-1.5 transition ${
                      // Requires activeView === 'board' too, not just "the active workspace
                      // happens to be personal" — otherwise this stayed highlighted after
                      // navigating to Chat/Docs/etc. for the personal workspace (activeWorkspaceId
                      // doesn't change when you click a different icon-rail tab), showing two
                      // things "active" at once.
                      currentWorkspace?.isPersonal && activeView === 'board'
                        ? 'bg-neutral-800 text-blue-400'
                        : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
                    }`}
                  >
                    <ListChecks className="w-3 h-3" /> My tasks
                  </button>
                  <button
                    onClick={() => setActiveView('mytasks')}
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] cursor-pointer flex items-center gap-1.5 transition ${
                      activeView === 'mytasks' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
                    }`}
                  >
                    <ClipboardCheck className="w-3 h-3" /> My assigned tasks
                  </button>
                  <button
                    onClick={() => setActiveView('directMessages')}
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] cursor-pointer flex items-center gap-1.5 transition ${
                      activeView === 'directMessages' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'
                    }`}
                  >
                    <MessageCircle className="w-3 h-3" /> Connections
                  </button>
                </div>
              );
            })()}
          </div>
          <div ref={sidebarScrollRef} className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-96px)]">
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
                  const navigateToUser = () => {
                    setActiveOfficeUserId(u.id);
                    setActiveOfficeRoomId(null);
                  };
                  return (
                    <div
                      key={u.id}
                      // A plain <div>, not <button> — ManageableAvatar's own avatar is a <button>
                      // (right-click/DM/role popover, backlog #9), and nesting a button inside a
                      // button is both invalid HTML and breaks click handling. Its own onClick
                      // covers the rest of the row (name/count), same navigation the avatar's own
                      // onClick already does.
                      onClick={navigateToUser}
                      className={`w-full px-2.5 py-1.5 rounded text-xs font-medium transition flex items-center justify-between gap-2 cursor-pointer ${
                        isActive ? 'bg-neutral-800 text-blue-400 font-semibold' : 'text-neutral-300 hover:bg-neutral-800/40'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {currentWorkspace && (
                          <ManageableAvatar
                            user={u}
                            workspace={currentWorkspace}
                            currentUserId={currentUserId}
                            canManage={canManageCurrentWorkspace}
                            onRequestRemove={(user) => setMemberToRemove(user)}
                            onStartDM={handleStartDMFromOffice}
                            onClick={navigateToUser}
                            size="sm"
                          />
                        )}
                        <span className="truncate">{u.name}</span>
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : activeView === 'chat' ? (
              <ChatSidebar workspaceId={activeWorkspaceId} />
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
              {[...(currentWorkspace?.spaces ?? [])].sort((a, b) => a.order - b.order).map((space: HierarchySpace) => {
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
                            expandSpace(space.id);
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
                            isSpaceActive ? 'bg-neutral-800 font-semibold border-l-2' : 'text-neutral-300 hover:bg-neutral-800/40'
                          } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''}`}
                          style={isSpaceActive ? { borderLeftColor: space.color || '#6366f1' } : undefined}
                        >
                          <span className="flex items-center gap-2 truncate">
                            {/* Same hover-reveal treatment as FolderTree.tsx's FolderRow — no
                                permanently-visible chevron. A chosen Space icon (same
                                FOLDER_ICON_MAP as Folder/List) fades out and the chevron fades in
                                over the same slot on hover; a Space with no icon set falls back to
                                the plain color dot it's always shown, so nothing changes visually
                                for existing Spaces until someone opts in. */}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSpaceCollapsed(space.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleSpaceCollapsed(space.id);
                                }
                              }}
                              title={collapsedSpaceIds.has(space.id) ? 'Expand' : 'Collapse'}
                              className="shrink-0 cursor-pointer flex items-center justify-center p-1.5 -m-1.5"
                            >
                              <span className="relative w-3.5 h-3.5 flex items-center justify-center">
                                {(() => {
                                  const SpaceIcon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
                                  return SpaceIcon ? (
                                    <SpaceIcon
                                      className="absolute inset-0 w-3.5 h-3.5 opacity-100 group-hover:opacity-0 transition"
                                      style={{ color: space.color || undefined }}
                                    />
                                  ) : (
                                    // Bigger + a faint white ring so the dot stays legible at a
                                    // glance even for darker chosen colors that would otherwise
                                    // blend into the near-black sidebar — was too small/weak
                                    // to read as "this Space's color" before this pass.
                                    <span
                                      className="w-3 h-3 rounded-full ring-1 ring-white/15 opacity-100 group-hover:opacity-0 transition"
                                      style={{ backgroundColor: space.color || '#6366f1' }}
                                    />
                                  );
                                })()}
                                {collapsedSpaceIds.has(space.id) ? (
                                  <ChevronRight className="absolute inset-0 w-3.5 h-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                                ) : (
                                  <ChevronDown className="absolute inset-0 w-3.5 h-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                                )}
                              </span>
                            </span>
                            {activeView === 'calendar' && (
                              // Same dot-that-morphs-into-an-eye-on-hover treatment as List/Folder
                              // rows (FolderTree.tsx) — a checkbox reads as "select this to do
                              // something," an eye reads as "show/hide," which is what this
                              // actually does. Whole-row click already toggles it (see this
                              // button's own onClick above), this is purely the visual indicator.
                              <span className="relative w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                                <span
                                  className="absolute w-2 h-2 rounded-full transition group-hover:opacity-0"
                                  style={{ backgroundColor: space.color || '#6b7280', opacity: spaceAllChecked ? 1 : spaceSomeChecked ? 0.6 : 0.25 }}
                                />
                                {spaceAllChecked ? (
                                  <Eye className="absolute w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition" />
                                ) : (
                                  <EyeOff className="absolute w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 transition" />
                                )}
                              </span>
                            )}
                            {/* Own color always — only the checkbox indicates "checked" (Google
                                Calendar's sidebar convention); when active, the name glows a
                                bright version of that same color instead of switching to blue. */}
                            <span className="truncate" style={isSpaceActive ? activeGlowStyle(space.textColor || space.color) : { color: space.textColor || space.color || undefined }}>
                              {space.name}
                            </span>
                            {space.isPrivate && <Lock className="w-2.5 h-2.5 text-neutral-500 shrink-0" />}
                          </span>
                          {activeView === 'board' && <span className="text-[10px] text-neutral-500 font-mono">{spaceTasksCount}</span>}
                        </button>
                      )}
                    </DroppableSidebarItem>

                    {!collapsedSpaceIds.has(space.id) &&
                      (activeView === 'docs' ? (
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
                          onDocContextMenu={(e, doc) => openDocMenu(e, doc, space.id)}
                          renameDocId={renameDocId}
                          onRenameDocHandled={() => setRenameDocId(null)}
                          docDropIndicator={docDropIndicator}
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
                          activeStandaloneDocId={activeSpaceId === space.id ? activeStandaloneDocId : null}
                          onOpenDoc={(docId) => {
                            setNavigation(space.id, []);
                            setDocsNavigation(null, docId);
                          }}
                          onDeleteDocRequest={setSpaceDocToDelete}
                          onDocContextMenu={(e, doc) => openDocMenu(e, doc, space.id)}
                          renameDocId={renameDocId}
                          onRenameDocHandled={() => setRenameDocId(null)}
                          listDropIndicator={listDropIndicator}
                          showArchived={showArchived}
                        />
                      ))}
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

      </aside>

      {/* activeStandaloneDocId (lib/navUrl.ts) deliberately isn't cleared on a plain nav-rail
          switch — it's part of Docs' own back/forward-navigable state, same as activeSpaceId is
          for Tasks, so returning to Docs later still shows what was open. But that means this
          panel needs its own explicit activeView check, not just "is some standalone doc still
          set" — without it, the subpages tree for whatever doc was last open in Docs kept
          rendering as its own sidebar column no matter which nav-rail tab was actually active
          (reported live: opening a multi-page doc, then switching to Chat, left the doc's page
          list lingering next to the Chat sidebar). Matches the same (activeView === 'board' ||
          activeView === 'docs') convention already used elsewhere in this file for when a
          standalone doc is actually being shown. */}
      {(activeView === 'board' || activeView === 'docs') && currentSpace && activeStandaloneDoc && docBookRoot && docBookHasPages && (
        <aside className="w-56 bg-neutral-900/60 border-r border-neutral-800/80 shrink-0 overflow-y-auto select-none hidden md:block">
          <DocSubpagesPanel
            space={currentSpace}
            rootDoc={docBookRoot}
            activeDocId={activeStandaloneDoc.id}
            members={users}
            onOpenDoc={(docId) => setDocsNavigation(activeDocFolderId, docId)}
            onAddPage={(parentId) => createSpaceDoc(currentSpace.id, null, { parentId })}
            onDocContextMenu={(e, doc) => openDocMenu(e, doc, currentSpace.id)}
            renameDocId={renameDocId}
            onRenameDocHandled={() => setRenameDocId(null)}
            docDropIndicator={docDropIndicator}
          />
        </aside>
      )}

      {/* ================= MAIN AREA ================= */}
      {/* bg-neutral-950 (not the old hardcoded bg-[#121212]): that arbitrary value predates the
          rounded-sheet treatment below and was never updated when the app's shared background
          tokens were — it sat one shade lighter than the header's own bg-neutral-950, which
          quietly peeks through at the header/content boundary and at a content sheet's own
          rounded-top corners (Planner, Chat) as a straight-edged, slightly-darker line/frame right
          where the rounded corner cuts away, reported live as "a darker frame that is straight
          behind it... you can see the straight line go past where the corner starts to round
          off." Matching this to the header's own token removes the mismatched third shade
          entirely, rather than chasing the geometry of exactly where it peeks through. */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 relative">
        {/* Mobile: no border framing this row at all, and the same bg-neutral-950 as the title bar
            above — reads as one continuous header block instead of two visually distinct bands.
            Desktop keeps its original border+lighter-bg treatment unchanged. */}
        <header className="border-b-0 md:border-b border-neutral-800/80 bg-neutral-950 md:bg-neutral-900/40 shrink-0">
          {/* md:h-11 + md:py-0 restore the original fixed-height compact desktop row exactly —
              mobile instead sizes naturally off its own padding (pt-2 pb-8 — bumped twice now,
              pb-3 -> pb-5 -> pb-8, per repeated direct feedback that it still felt tight) so the
              now-taller/rounder search bar has real breathing room instead of being squeezed into
              a height tuned for the old shorter one. Bumping *this* shared padding — one row, used
              by literally every view — rather than each view's own content-wrapper padding is
              what makes the extra air apply identically everywhere in one change, without touching
              Calendar/Chat's own tighter p-2 content-wrapper budget (they were the two specifically
              flagged as feeling cramped, since every other view already used a roomier p-6). */}
          <div className="relative md:h-11 pt-2 pb-9 md:py-0 px-3 md:px-6 flex items-center gap-2 justify-between border-b-0 md:border-b border-neutral-800/40">
            {/* Mobile-only — the Spaces/Personal-Spaces tree sheets are the *only* way to reach a
                specific List or Doc on mobile (the desktop sidebar is hidden below md), and neither
                sheet stays mounted once you've navigated in, so there was previously no way back at
                all short of the bottom nav's own Spaces/Menu buttons ("jeg havner inn på lista...
                men det er ingen vei tilbake"). Reopens whichever sheet is contextually correct —
                Personal for "My Tasks," the real one otherwise — rather than a browser-style
                back-in-history, since that tree's own expand-state is local to the sheet component
                anyway (it remounts fresh either way; matching *which* workspace's tree reopens is
                what actually matters here). */}
            {/* Fixed-width slot, always present on mobile whether or not the button inside it
                actually renders — without this, the search bar sat one flex position earlier on
                Planner/Chat (no Back button) than on Board/Docs (Back button present), so it
                visibly shifted left/right depending on which screen you were on. Reserving the
                width unconditionally keeps the search bar's own position identical everywhere. */}
            <div className="relative z-10 md:hidden w-7 h-7 shrink-0 flex items-center justify-center">
              {(activeView === 'board' || activeView === 'docs') && (
                <button
                  onClick={() => {
                    // Pressing Back here is a deliberate "I want the overview now, not a specific
                    // list" signal. Clearing just the List selection (keeping the Space, so the
                    // sheet still shows it expanded) via setNavigation immediately updates
                    // activeListIds — which is what the skip-the-picker-sheet check in
                    // openMobileSpaces()/the My Tasks handler actually reads — *and* updates
                    // lastPositionByWorkspaceId for next time, in one call. A bare
                    // forgetLastPosition() alone wasn't enough: it only affects a *future*
                    // setActiveWorkspaceId call, so bouncing Spaces -> Back -> Planner -> Spaces
                    // without ever actually switching workspace (a very common path) left the
                    // current activeListIds untouched, and the very next Spaces visit skipped
                    // straight back into the same List anyway. Applies to both "My Tasks" and real
                    // Spaces now that both skip the picker sheet when a position is remembered.
                    if (activeSpaceId !== 'everything') setNavigation(activeSpaceId, []);
                    if (currentWorkspace?.isPersonal) {
                      setMobilePersonalSpacesOpen(true);
                    } else {
                      setMobileSpacesOpen(true);
                    }
                  }}
                  title="Back"
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800/60 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              {/* Same slot, same affordance, for Chat once a channel/DM is actually open — mobile
                  now shows the Channels/DMs picker (ChatSidebar) inline as the main view instead
                  of behind the removed header "Chat" button, so this is the only way back to it
                  once you've picked something. Only rendered while something IS picked; the picker
                  itself is already what's showing otherwise, so there's nothing to go "back" to. */}
              {activeView === 'chat' && !!activeChatEntity && (
                <button
                  onClick={() => setActiveChatChannelId(null)}
                  title="Back"
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800/60 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* The mobile search pill lives here — this per-view row — for every view, not the
                title row above, so it's in one consistent spot regardless of which screen is
                showing (the title row's own height/content varies less predictably per view than
                this row, which already always hosts view-specific controls).
                True absolute centering on the row itself (which is `relative` for exactly this),
                not a `flex-1 justify-center` wrapper — that still centered *within whatever space
                was left* after the back-slot and any trailing per-view content, and even an empty
                trailing element still consumes its own `gap` before it, quietly narrowing that
                space on some views but not others (reported live: Spaces/My Tasks landing a bit
                further right than Planner/Chat, despite neither having any *visible* trailing
                content on mobile — the gap reservation alone was enough to shift it). Being
                absolutely positioned off the row's own bounding box means it's now identically
                centered on literally every view, full stop, regardless of what else is or isn't in
                the row. The back-button slot and any trailing content stay in normal flex flow
                (still pinned to the row's own left/right via justify-between) and simply sit behind
                the centered pill in stacking order — the back-slot's own icon has room to spare on
                the sides, so nothing ends up covered. */}
            <div className="md:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(calc(100%-88px),420px)]">
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="w-full flex items-center gap-1.5 bg-neutral-900/60 border border-neutral-800/80 rounded-full px-3 py-3 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] truncate">Search...</span>
              </button>
            </div>
            {/* Hidden on mobile entirely — a breadcrumb reads as unpolished clutter at phone
                width, and the "Lists"/"Channels"/"Archive" buttons below already tell you where
                you are well enough without it. Desktop keeps it unchanged. */}
            <div className="hidden md:flex items-center gap-2 text-xs font-medium">
              {/* Office/Chat already lead with their own icon+label as the breadcrumb's first
                  real segment below (and Office's own click-to-reset behavior lives on that
                  button) — prefixing the same word again here would just recreate the exact
                  "Workspace / Office" redundancy this change exists to remove, one word later. */}
              {activeView !== 'office' && activeView !== 'chat' && (
                <>
                  <span className="text-neutral-500">{breadcrumbViewLabel}</span>
                  <span className="text-neutral-600">/</span>
                </>
              )}
              {activeView === 'office' ? (
                <>
                  <button
                    onClick={() => {
                      setActiveOfficeUserId(null);
                      setActiveOfficeRoomId(null);
                    }}
                    className={`flex items-center gap-1.5 cursor-pointer ${
                      activeOfficeUserId || activeOfficeRoomId ? 'text-neutral-500 hover:text-neutral-300' : 'text-blue-400 font-semibold'
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
                  {!activeOfficeUserId && activeOfficeRoomId && (
                    <>
                      <span className="text-neutral-600">/</span>
                      <span className="text-neutral-300 font-semibold">
                        {workspaces.flatMap((w) => w.rooms).find((r) => r.id === activeOfficeRoomId)?.name}
                      </span>
                    </>
                  )}
                </>
              ) : activeView === 'chat' ? (
                <>
                  <span className={`flex items-center gap-1.5 ${activeChatChannelLabel ? 'text-neutral-500' : 'text-blue-400 font-semibold'}`}>
                    <MessageSquare className="w-3.5 h-3.5" /> Chat
                  </span>
                  {activeChatChannelLabel && (
                    <>
                      <span className="text-neutral-600">/</span>
                      <span className="text-neutral-300 font-semibold">
                        {activeChatChannelLabel.kind === 'channel' ? `#${activeChatChannelLabel.text}` : activeChatChannelLabel.text}
                      </span>
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

            {/* ml-auto: on desktop this is redundant with the breadcrumb div's own justify-between
                placement (harmless); on mobile the breadcrumb div above is hidden entirely, and
                without this these buttons would land at the row's start instead of staying
                pinned to the right the way they visually always have. */}
            <div className="relative z-10 flex items-center gap-1.5 ml-auto">
              {/* Removed on mobile — redundant with the bottom nav's own "Spaces" tab and the new
                  Back button (both reach the exact same sheet). Desktop never had this button at
                  all (it was already md:hidden), so nothing changes there. */}
              {/* Desktop-only now — moved into the mobile Menu popup instead (AppLauncherGrid.tsx),
                  next to Settings/Trash, since it was showing up "under My Tasks" specifically
                  confusingly (this row is shared by every activeView === 'board' screen, personal
                  workspace included) for a toggle that's really a utility action, not a per-view one. */}
              {activeView === 'board' && (
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className={`hidden md:flex text-[11px] px-2.5 py-1 rounded border cursor-pointer transition items-center gap-1.5 ${
                    showArchived
                      ? 'bg-neutral-800 text-blue-400 border-neutral-700'
                      : 'text-neutral-400 border-neutral-800 hover:bg-neutral-800/60'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" /> {showArchived ? 'Viewing archive' : 'Archive'}
                </button>
              )}
              {/* DocSubpagesPanel (a real 224px sidebar column) is hidden below md same as the
                  Spaces/Lists tree — on a phone-width screen it left barely any room for the
                  actual doc editor (reported live: "jeg ser kun 1 av docsene... feltet jeg skal
                  skrive i er croppa vekk"). Only shown when that panel would actually have
                  something to show (mirrors its own desktop render gate exactly). */}
              {activeView === 'docs' && activeStandaloneDoc && docBookHasPages && (
                <button
                  onClick={() => setMobileDocPagesOpen(true)}
                  className="md:hidden text-[11px] px-2.5 py-1 rounded border cursor-pointer transition flex items-center gap-1.5 text-neutral-400 border-neutral-800 hover:bg-neutral-800/60"
                >
                  <FileText className="w-3.5 h-3.5" /> Pages
                </button>
              )}
            </div>
          </div>
        </header>

        <div
          className={
            // Planner's month grid sizes its own rows to exactly fill this box's measured height
            // (CalendarView.tsx's `containerHeight`, via `clientHeight` — which *includes* an
            // element's own padding), so reserving the floating nav's clearance as padding on that
            // same measured element does nothing: the row-height math still divides up the full
            // padded box, and the grid renders straight through the padding to the true bottom
            // edge. Reserving it here instead — one level up, on this element's *parent* — actually
            // shrinks the space CalendarView measures, so its rows correctly leave room instead of
            // running under the nav. Chat doesn't need this: its own list is a normal scrolling
            // flow (own bottom padding genuinely works there), and an open conversation hides the
            // nav entirely rather than floating over it.
            //
            // bg-neutral-900 rounded-t-2xl (mobile only): this is the layer that actually sits
            // right below the search bar for Planner — the earlier attempt at this rounded-sheet
            // look was placed one level too deep, on CalendarView's own inner grid/day-timeline box,
            // which isn't what should visually differentiate from the header. Matches the same
            // treatment Chat's own list wrapper got, right below the search bar there too.
            activeView === 'calendar'
              ? 'flex-1 min-h-0 overflow-hidden p-2 pb-28 md:p-6 flex flex-col bg-neutral-900 md:bg-transparent rounded-t-2xl md:rounded-none'
              : activeView === 'chat'
              ? // The Chat *list* (nothing picked yet) draws its own rounded-top sheet flush
                // against the screen edges (see the ChatSidebar wrapper below) — this outer
                // wrapper's own p-2 was sitting *around* that sheet, showing the page's darker
                // root background through the gap as a second, straight-edged "layer" behind a
                // smaller rounded one. Reported live as looking like two stacked boxes instead of
                // one. Dropped entirely for the list case; kept for an *open* conversation
                // (ChatPanel), which still wants real breathing room around its message bubbles
                // and has no rounded sheet of its own to go edge-to-edge with.
                isMobile && !activeChatEntity
                ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
                : 'flex-1 min-h-0 overflow-hidden p-2 md:p-6 flex flex-col'
              : activeView === 'board'
              ? // Same rounded-top sheet as Chat/Planner get, right below the search bar — put
                // directly on this outermost scrollable element itself (not a nested inner div)
                // specifically to avoid the "smaller rounded box inset inside a bigger straight
                // background" seam Chat had before its own fix above; this element's own p-6
                // padding just becomes the sheet's internal content inset instead of an external
                // gap around a separately-colored box.
                'flex-1 overflow-auto p-6 pb-28 md:pb-6 bg-neutral-900 md:bg-transparent rounded-t-2xl md:rounded-none'
              : 'flex-1 overflow-auto p-6 pb-28 md:pb-6'
          }
          onClick={closeAllMenus}
        >
          <div
            className={
              activeView === 'calendar' || activeView === 'chat'
                ? 'flex-1 min-h-0 flex flex-col'
                : (activeView === 'board' || activeView === 'docs') && activeStandaloneDoc?.pageWidth === 'full'
                ? 'w-full space-y-2'
                : 'max-w-6xl mx-auto space-y-2'
            }
          >
            {activeView === 'board' && !showingSpaceHome && (
            <div className="flex items-center justify-between">
              <div className="text-neutral-500 font-mono text-[10px]">{filteredTasks.length} tasks</div>
              <div className="flex items-center gap-1.5">
                {overdueTasksInView.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClearOverdueConfirmOpen(true);
                    }}
                    className="text-[11px] rounded px-3 py-2 md:px-2.5 md:py-1 flex items-center gap-1 border text-red-400 bg-neutral-900 border-red-500/30 hover:border-red-500/60 cursor-pointer"
                  >
                    Clear overdue ({overdueTasksInView.length})
                  </button>
                )}
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
                    className={`text-[11px] rounded px-3 py-2 md:px-2.5 md:py-1 flex items-center gap-1 border ${
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

            {activeStandaloneDoc && currentSpace && (activeView === 'board' || activeView === 'docs') ? (
              <div className="w-full space-y-2">
                {/* Desktop always has DocFolderTree (the main sidebar, hidden below md) sitting
                    right there to jump to any other Doc/Folder at a glance — mobile has no
                    equivalent, so the small breadcrumb link below (easy to miss next to "+ Add
                    page"/export/link controls on a cramped screen) was the *only* way back to the
                    Docs browser grid. Reported live as a doc "actually missing" on mobile — it
                    wasn't gone, just not reachable in an obvious way once a different doc/folder
                    is open. Same handler the breadcrumb's own Space-name segment already uses,
                    just promoted to its own prominent, always-visible mobile-only row. */}
                {activeView === 'docs' && (
                  <button
                    onClick={() => setDocsNavigation(docBreadcrumb.folderChain[0]?.id ?? null, null)}
                    className="md:hidden flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-400 cursor-pointer -ml-1 mb-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> All docs
                  </button>
                )}
                {!docBookHasPages && (
                  <button
                    onClick={() => createSpaceDoc(currentSpace.id, null, { parentId: activeStandaloneDoc.id })}
                    className="text-[11px] text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/30 px-2 py-1 -ml-2 rounded cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" /> Add page
                  </button>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] text-neutral-500 min-w-0 flex-wrap">
                    <button
                      onClick={() => setDocsNavigation(docBreadcrumb.folderChain[0]?.id ?? null, null)}
                      className="cursor-pointer hover:text-neutral-300 shrink-0"
                    >
                      {currentSpace.name}
                    </button>
                    {docBreadcrumb.folderChain.map((folder, i) => (
                      <span key={folder.id} className="flex items-center gap-1 shrink-0">
                        <ChevronRight className="w-3 h-3" />
                        <button
                          onClick={() => setDocsNavigation(docBreadcrumb.folderChain[i + 1]?.id ?? folder.id, null)}
                          className="cursor-pointer hover:text-neutral-300"
                        >
                          {folder.name}
                        </button>
                      </span>
                    ))}
                    {docBreadcrumb.docChain.map((doc, i) => {
                      const isLast = i === docBreadcrumb.docChain.length - 1;
                      return (
                        <span key={doc.id} className="flex items-center gap-1 min-w-0">
                          <ChevronRight className="w-3 h-3 shrink-0" />
                          <button
                            onClick={() => setDocsNavigation(activeDocFolderId, doc.id)}
                            disabled={isLast}
                            className={`truncate ${isLast ? 'text-neutral-300 font-medium' : 'cursor-pointer hover:text-neutral-300'}`}
                          >
                            {doc.title || 'Untitled'}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <DocExportMenu docId={activeStandaloneDoc.id} onToast={showToast} />
                    {activeStandaloneDoc.taskId ? (
                      (() => {
                        const linkedTask = tasks.find((t) => t.id === activeStandaloneDoc.taskId);
                        return (
                          <span className="flex items-center gap-1 text-[10px] text-neutral-500">
                            <Link2 className="w-3 h-3 shrink-0" />
                            Linked to{' '}
                            <button
                              onClick={() => linkedTask && setModalTaskStack([linkedTask.id])}
                              className="text-blue-400 hover:underline cursor-pointer"
                            >
                              {linkedTask?.title ?? 'task'}
                            </button>
                            <button
                              onClick={() => setDocTaskLink(activeStandaloneDoc.id, null)}
                              title="Unlink"
                              className="text-neutral-500 hover:text-red-400 cursor-pointer"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })()
                    ) : (
                      linkableTasks.length > 0 && (
                        <FloatingPopover
                          open={linkTaskOpen}
                          onClose={() => setLinkTaskOpen(false)}
                          panelClassName="w-56 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
                          anchor={
                            <button
                              onClick={() => setLinkTaskOpen((o) => !o)}
                              className="text-[11px] text-neutral-400 hover:text-blue-400 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer flex items-center gap-1"
                            >
                              <Link2 className="w-3 h-3" /> Link to task
                            </button>
                          }
                        >
                          <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-3 py-1">From this Space</div>
                          {linkableTasks.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => {
                                setDocTaskLink(activeStandaloneDoc.id, t.id);
                                setLinkTaskOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer truncate"
                            >
                              {t.title}
                            </button>
                          ))}
                        </FloatingPopover>
                      )
                    )}
                  </div>
                </div>
                <div className="py-2 space-y-3">
                  {activeStandaloneDoc.coverImageUrl && (
                    <div className="relative -mx-6 group/cover">
                      <img
                        src={activeStandaloneDoc.coverImageUrl}
                        alt=""
                        className="w-full h-40 object-cover"
                      />
                      <button
                        onClick={() => updateSpaceDoc(activeStandaloneDoc.id, currentSpace.id, { coverImageUrl: null })}
                        className="absolute top-2 right-2 text-[10px] bg-neutral-900/80 hover:bg-neutral-900 text-neutral-300 hover:text-white px-2 py-1 rounded opacity-0 group-hover/cover:opacity-100 transition cursor-pointer"
                      >
                        Remove cover
                      </button>
                    </div>
                  )}
                  <input
                    value={activeStandaloneDoc.title}
                    onChange={(e) => updateSpaceDoc(activeStandaloneDoc.id, currentSpace.id, { title: e.target.value })}
                    className="w-full bg-transparent text-lg font-semibold text-white focus:outline-none"
                    placeholder="Document title"
                  />
                  {activeStandaloneDoc.subtitle !== null && (
                    <input
                      value={activeStandaloneDoc.subtitle}
                      onChange={(e) => updateSpaceDoc(activeStandaloneDoc.id, currentSpace.id, { subtitle: e.target.value })}
                      className="w-full -mt-2 bg-transparent text-sm text-neutral-400 focus:outline-none"
                      placeholder="Add a subtitle..."
                    />
                  )}
                  {(() => {
                    const owner = activeStandaloneDoc.ownerId ? users.find((u) => u.id === activeStandaloneDoc.ownerId) : undefined;
                    const contributors = activeStandaloneDoc.contributorIds.map((id) => users.find((u) => u.id === id)).filter((u): u is AppUser => !!u);
                    const updated = new Date(activeStandaloneDoc.updatedAt);
                    return (
                      <div className="flex items-center gap-3 text-[11px] text-neutral-500 -mt-1">
                        <FloatingPopover
                          open={docOwnerPickerOpen}
                          onClose={() => setDocOwnerPickerOpen(false)}
                          panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
                          anchor={
                            <button
                              onClick={() => setDocOwnerPickerOpen((o) => !o)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setDocOwnerPickerOpen(true);
                              }}
                              className="flex items-center gap-1.5 cursor-pointer hover:text-neutral-300"
                            >
                              Owner
                              {owner ? (
                                <>
                                  <span
                                    title={owner.name}
                                    className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0"
                                    style={{ backgroundColor: owner.color }}
                                  >
                                    {owner.initials}
                                  </span>
                                  {owner.name}
                                </>
                              ) : (
                                <span className="w-4 h-4 rounded-full border border-dashed border-neutral-600 flex items-center justify-center shrink-0">+</span>
                              )}
                            </button>
                          }
                        >
                          <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-2 py-1">Owner</div>
                          {users.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => {
                                updateSpaceDoc(activeStandaloneDoc.id, currentSpace.id, { ownerId: u.id });
                                setDocOwnerPickerOpen(false);
                              }}
                              className="w-full flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer"
                            >
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                  owner?.id === u.id ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                                }`}
                              >
                                {owner?.id === u.id && <Check className="w-2.5 h-2.5" />}
                              </span>
                              <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: u.color }}>
                                {u.initials}
                              </span>
                              {u.name}
                            </button>
                          ))}
                        </FloatingPopover>

                        {activeStandaloneDoc.showLastModified && (
                          <span>
                            Last updated {updated.toLocaleDateString()} at {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}

                        <FloatingPopover
                          open={docContributorsPickerOpen}
                          onClose={() => setDocContributorsPickerOpen(false)}
                          panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
                          anchor={
                            <button
                              onClick={() => setDocContributorsPickerOpen((o) => !o)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setDocContributorsPickerOpen(true);
                              }}
                              className="flex items-center gap-1.5 cursor-pointer hover:text-neutral-300"
                            >
                              Contributors
                              <span className="flex items-center -space-x-1">
                                {contributors.length === 0 && (
                                  <span className="w-4 h-4 rounded-full border border-dashed border-neutral-600 flex items-center justify-center shrink-0">+</span>
                                )}
                                {contributors.slice(0, 5).map((u) => (
                                  <span
                                    key={u.id}
                                    title={u.name}
                                    className="w-4 h-4 rounded-full border border-neutral-900 text-[8px] font-bold flex items-center justify-center text-white"
                                    style={{ backgroundColor: u.color }}
                                  >
                                    {u.initials}
                                  </span>
                                ))}
                              </span>
                            </button>
                          }
                        >
                          <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-2 py-1">Contributors</div>
                          {users.map((u) => {
                            const checked = activeStandaloneDoc.contributorIds.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                onClick={() => {
                                  const next = checked
                                    ? activeStandaloneDoc.contributorIds.filter((id) => id !== u.id)
                                    : [...activeStandaloneDoc.contributorIds, u.id];
                                  updateSpaceDoc(activeStandaloneDoc.id, currentSpace.id, { contributorIds: next });
                                }}
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
                        </FloatingPopover>
                      </div>
                    );
                  })()}
                  <CollabDocEditor
                    key={activeStandaloneDoc.id}
                    docId={activeStandaloneDoc.id}
                    spaceId={currentSpace.id}
                    onJump={jumpToMention}
                    onDocContextMenu={(e, doc) => openDocMenu(e, doc, currentSpace.id)}
                    placeholder="Write anything..."
                    className="min-h-[24em] text-sm text-neutral-300"
                  />
                </div>
              </div>
            ) : activeView === 'mytasks' ? (
              <MyTasksPage
                currentUser={users.find((u) => u.id === currentUserId) ?? null}
                currentWorkspace={currentWorkspace}
                tasks={tasks}
                statuses={statuses}
                onOpenTask={(id) => setModalTaskStack([id])}
              />
            ) : activeView === 'directMessages' ? (
              <DirectMessagesPage />
            ) : activeView === 'profile' ? (
              <ProfilePage
                currentUser={users.find((u) => u.id === currentUserId) ?? null}
                onUpdate={(patch) => currentUserId && updateUser(currentUserId, patch)}
              />
            ) : activeView === 'office' ? (
              <OfficePage
                users={users}
                activeUserId={activeOfficeUserId}
                activeRoomId={activeOfficeRoomId}
                workspace={currentWorkspace ?? null}
                workspaces={workspaces}
                currentUserId={currentUserId}
                canManage={canManageCurrentWorkspace}
                tasks={tasks}
                statuses={statuses}
                onSelectUser={setActiveOfficeUserId}
                onSelectRoom={setActiveOfficeRoomId}
                onOpenTask={(id) => setModalTaskStack([id])}
                onUpdatePhone={(userId, phone) => updateUser(userId, { phone })}
                onUpdateUserField={(userId, field, value) => updateUser(userId, { [field]: value })}
                onDeleteRoomRequest={setRoomToDelete}
                onRequestRemoveMember={(user) => setMemberToRemove(user)}
                onStartDM={handleStartDMFromOffice}
                onOpenInviteSettings={() => {
                  setSettingsInitialTab('invite');
                  setSettingsOpen(true);
                }}
              />
            ) : activeView === 'chat' ? (
              // No workspace-level gate here — DMs are workspace-agnostic (Connections work), and
              // ChatPanel itself already renders a "pick a channel or DM" empty state when nothing
              // is selected, which correctly covers "no workspace + no channel" too.
              //
              // flex-1 min-h-0, not a hardcoded h-[75vh] — a fixed vh fraction doesn't know how
              // much of the viewport the header/mobile-bottom-nav/safe-area already ate, so on
              // mobile it routinely overflowed the space actually available, leaving the composer
              // below the fold until the *outer* page was scrolled down first (reported live: "må
              // scrolle ned for å skrive"). The parent chain above (this content wrapper, and its
              // own wrapper two levels up) now gets the same flex-1/min-h-0 treatment already used
              // for Calendar for exactly this reason, so ChatPanel's own internal `flex flex-col
              // h-full` (message list scrolls, composer stays pinned below it) resolves against a
              // real, correctly-bounded height instead of an unconstrained block ancestor.
              //
              // On mobile, an open thread replaces the message list entirely instead of squeezing
              // beside it — ChatThreadPanel is a fixed w-80 side panel, the same "cropped on a
              // phone screen" shape as the task modal's Comments panel was before that got the
              // same full-screen-replace treatment.
              <div className="flex-1 min-h-0 flex gap-3">
                <div className={`flex-1 min-w-0 min-h-0 ${isMobile && activeThreadRootMessage ? 'hidden' : ''}`}>
                  {/* Mobile with nothing picked: ChatSidebar (the same Channels/DMs list the
                      desktop <aside> already renders) shows inline as the main content instead of
                      behind a separate sheet — removes the need for the header's own blue "Chat"
                      button (dedicated, single purpose, and its function wasn't obvious from the
                      label alone per direct feedback) entirely for this state. The Back button in
                      the header row re-opens this same view once a channel *is* picked (see its own
                      condition below), matching how Spaces/Docs already get back to their own tree. */}
                  {isMobile && !activeChatEntity ? (
                    // pb-28: this list coexists with the floating bottom nav (MobileBottomNav.tsx
                    // is `fixed`, floating over content rather than reserving space for itself —
                    // see its own top comment), so the list needs enough of its own bottom padding
                    // to let the very last channel/DM row scroll fully clear of the island.
                    // rounded-t-2xl + bg-neutral-900: a step lighter than the page's own
                    // bg-neutral-950 header above it, matching MobileSpacesSheet.tsx's own list —
                    // same "content sits on a rounded sheet below the header" reference the user
                    // pointed at (ClickUp's own Chats list), applied consistently everywhere a
                    // mobile screen is fundamentally a plain list like this one.
                    <div className="h-full overflow-y-auto px-3 py-3 pb-28 bg-neutral-900 rounded-t-2xl">
                      <ChatSidebar workspaceId={activeWorkspaceId} />
                    </div>
                  ) : (
                    <ChatPanel />
                  )}
                </div>
                {activeThreadRootMessage && (
                  <ChatThreadPanel
                    rootMessage={activeThreadRootMessage}
                    onClose={() => setActiveThreadRootId(null)}
                    fullWidth={isMobile}
                  />
                )}
              </div>
            ) : activeView === 'docs' ? (
              !currentSpace ? (
                <div className="text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
                  Pick a Space in the sidebar to browse its Docs.
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
              <div className="flex-1 min-h-0">
                <CalendarView
                  tasks={calendarFilteredTasks}
                  events={events}
                  statuses={statuses}
                  workspaces={workspaces}
                  showWeekNumbers={!hideWeekNumbers}
                  onOpenTask={(id) => setModalTaskStack([id])}
                  onOpenEvent={(id) => setEventDetailId(id)}
                  onRequestCreateTask={(date) => {
                    setCreateTaskDefaultDate(date.toISOString());
                    setCreateTaskOpen(true);
                  }}
                  onOpenFilter={() => setMobileCalendarFilterOpen(true)}
                />
              </div>
            ) : showingSpaceHome ? (
              <SpaceHome
                space={currentSpace!}
                tasks={tasks}
                onNavigateList={(listId) => setNavigation(currentSpace!.id, [listId])}
              />
            ) : (
            /* On mobile this "table shell" mostly disappears — no border/shared background, no
               forced min-width (that alone was still causing horizontal scroll even after
               TaskRow's own mobile layout stopped needing it, since it's an inline style keyed
               off the desktop grid's column widths regardless of which layout actually renders
               inside) — each TaskRow.tsx card below carries its own elevated background instead. */
            <div className={isMobile ? 'rounded' : 'bg-neutral-900/60 border border-neutral-800/80 rounded overflow-x-auto shadow-sm'}>
              <div style={{ minWidth: isMobile ? undefined : tableMinWidth }}>
              <div
                className="hidden md:grid items-center px-4 py-2.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-800 bg-neutral-950/40"
                style={{ gridTemplateColumns: rowGridTemplate }}
              >
                <div className="flex items-center">
                  {filteredTasks.length > 0 && (() => {
                    const allSelected = filteredTasks.every((t) => selectedIds.has(t.id));
                    return (
                      <button
                        onClick={() => (allSelected ? clearSelection() : setSelectedIds(new Set(filteredTasks.map((t) => t.id))))}
                        title={allSelected ? 'Deselect all' : 'Select all'}
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center cursor-pointer transition ${
                          allSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600 hover:border-neutral-400'
                        }`}
                      >
                        {allSelected && <Check className="w-2.5 h-2.5" />}
                      </button>
                    );
                  })()}
                </div>
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

              <div className={isMobile ? 'flex flex-col gap-2' : 'divide-y divide-neutral-800/50'}>
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
                      className="w-full text-left px-4 py-3.5 md:py-2 text-sm md:text-xs font-medium text-neutral-400 hover:bg-neutral-800/40 hover:text-blue-400 transition flex items-center gap-2 cursor-pointer"
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
      </div>

      {/* Hidden entirely (not just visually) while an actual conversation is open on mobile — an
          open DM/channel should read as its own full-screen destination, matching the reference
          the user pointed at: no floating nav in front of the message list/input, only the header's
          own Back button (already wired to setActiveChatChannelId(null), see the header row above)
          gets you out. The channel/DM *picker* (ChatSidebar, shown when nothing's picked yet) still
          gets the floating nav like every other screen — only an actually-open conversation hides
          it. */}
      {!(activeView === 'chat' && isMobile && activeChatEntity) && (
      <MobileBottomNav
        navTabs={visibleNavTabs}
        menuOpen={mobileMenuOpen}
        onOpenMenu={() => setMobileMenuOpen(true)}
        onCloseMenu={() => setMobileMenuOpen(false)}
        onOpenSpaces={openMobileSpaces}
        spacesOpen={mobileSpacesOpen}
        pinnedTile={pinnedMobileTile}
        onNavigate={closeMobileOverlays}
        contentTiles={mobileGridTabs}
        meItems={meNavItems}
        onSelectTile={pinMobileMenuTile}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        showArchived={showArchived}
        onToggleArchive={() => setShowArchived(!showArchived)}
        realWorkspaces={workspaces.filter((w) => !w.isPersonal)}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={setActiveWorkspaceId}
      />
      )}

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
                // Same picker the drag-and-drop "dropped on a Folder/Space with several Lists"
                // flow already uses (taskListPicker) — offered here as a direct, no-drag way to
                // move a task to any List, which also happens to be the easiest way to pull a
                // subtask back out to the top level (moveTaskToListAndUnparent clears its
                // parentId too) after an accidental drag-onto-another-task nest.
                const options = workspaces
                  .flatMap((w) => w.spaces)
                  .flatMap((s) => s.lists.filter((l) => !l.archived).map((l) => ({ id: l.id, label: `${s.name} / ${listPathLabel(s, l.id)}` })));
                const { x, y } = clampMenuPosition(taskMenu.x, taskMenu.y, 224, 288);
                setTaskListPicker({ x, y, taskId: taskMenu.task.id, options });
                setTaskMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <FolderInput className="w-3.5 h-3.5" /> Move to...
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
            {canManageCurrentWorkspace && (
              <button
                onClick={() => {
                  setAccessControlTarget({ kind: 'space', id: spaceMenu.space.id, label: 'Space', isPrivate: spaceMenu.space.isPrivate, accessJson: spaceMenu.space.accessJson });
                  setSpaceMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" /> Manage access
              </button>
            )}
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
            {canManageCurrentWorkspace && (
              <button
                onClick={() => {
                  setAccessControlTarget({ kind: 'folder', id: folderMenu.folder.id, spaceId: folderMenu.folder.spaceId, label: 'Folder', isPrivate: folderMenu.folder.isPrivate, accessJson: folderMenu.folder.accessJson });
                  setFolderMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" /> Manage access
              </button>
            )}
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
            {canManageCurrentWorkspace && (
              <button
                onClick={() => {
                  setAccessControlTarget({ kind: 'list', id: listMenu.list.id, spaceId: listMenu.spaceId, label: 'List', isPrivate: listMenu.list.isPrivate, accessJson: listMenu.list.accessJson });
                  setListMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" /> Manage access
              </button>
            )}
            <button
              onClick={() => {
                archiveList(listMenu.spaceId, listMenu.list.id, !listMenu.list.archived);
                setListMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              {listMenu.list.archived ? (
                <>
                  <Undo2 className="w-3.5 h-3.5" /> Restore from archive
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" /> Archive list
                </>
              )}
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

      {/* ================= CONTEXT MENU: DOC ================= */}
      {docMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setDocMenu(null)} onContextMenu={(e) => { e.preventDefault(); setDocMenu(null); }} />
          <div className="fixed z-[61] w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1" style={{ top: docMenu.y, left: docMenu.x }}>
            <button
              onClick={() => startEditDoc(docMenu.doc, docMenu.spaceId)}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit appearance
            </button>
            <button
              onClick={() => {
                setRenameDocId(docMenu.doc.id);
                setDocMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                archiveSpaceDoc(docMenu.spaceId, docMenu.doc.id, !docMenu.doc.archived);
                setDocMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              {docMenu.doc.archived ? (
                <>
                  <Undo2 className="w-3.5 h-3.5" /> Restore from archive
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" /> Archive doc
                </>
              )}
            </button>
            <button
              onClick={() => {
                setSpaceDocToDelete(docMenu.doc);
                setDocMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete doc
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
                  moveTaskToListAndUnparent(taskListPicker.taskId, opt.id);
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
                <ColorSwatchPicker value={editSpaceColor} onChange={setEditSpaceColor} choices={FIELD_COLOR_CHOICES} />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Text color (defaults to Color above)</label>
                <ColorSwatchPicker value={editSpaceTextColor} onChange={setEditSpaceTextColor} choices={FIELD_COLOR_CHOICES} />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setEditSpaceIcon(null)}
                    title="Default (plain color dot)"
                    className={`w-7 h-7 rounded bg-neutral-950 border border-neutral-700 flex items-center justify-center cursor-pointer ${
                      editSpaceIcon === null ? 'border-blue-500' : ''
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: editSpaceColor }} />
                  </button>
                  {FOLDER_ICON_CHOICES.map((iconKey) => {
                    const Icon = FOLDER_ICON_MAP[iconKey];
                    return (
                      <button
                        key={iconKey}
                        onClick={() => setEditSpaceIcon(iconKey)}
                        className={`w-7 h-7 rounded bg-neutral-950 border border-neutral-700 flex items-center justify-center cursor-pointer text-neutral-300 ${
                          editSpaceIcon === iconKey ? 'border-blue-500 text-blue-400' : ''
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
                  const PreviewIcon = editSpaceIcon ? FOLDER_ICON_MAP[editSpaceIcon] : null;
                  return PreviewIcon ? (
                    <PreviewIcon className="w-3.5 h-3.5" style={{ color: editSpaceColor }} />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: editSpaceColor }}></span>
                  );
                })()}
                <span className="text-xs text-neutral-300">{editSpaceName || 'Preview'}</span>
              </div>
              <div>
                {/* Moved here from a permanently-visible empty gradient banner on the Space Home
                    page itself — that banner showed on *every* Space with no cover set (including
                    the auto-created personal "My Tasks" space, which never has one), just to offer
                    an "Add cover" hover button. Setting a cover is now purely opt-in from Edit
                    Space instead; Space Home itself shows nothing at all when coverImageUrl is
                    unset (see SpaceHome.tsx's own CoverBanner). */}
                <label className="text-[11px] text-neutral-400 mb-1 block">Cover image URL (optional)</label>
                <input
                  value={editSpaceCoverUrl}
                  onChange={(e) => setEditSpaceCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditFolderColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center shrink-0 ${
                      editFolderColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editFolderColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <ColorSwatchPicker value={editFolderColor} onChange={setEditFolderColor} choices={FIELD_COLOR_CHOICES} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Text color (defaults to Color above)</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditFolderTextColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center shrink-0 ${
                      editFolderTextColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editFolderTextColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <ColorSwatchPicker value={editFolderTextColor} onChange={setEditFolderTextColor} choices={FIELD_COLOR_CHOICES} />
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditListColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center shrink-0 ${
                      editListColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editListColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <ColorSwatchPicker value={editListColor} onChange={setEditListColor} choices={FIELD_COLOR_CHOICES} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Text color (defaults to Color above)</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditListTextColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center shrink-0 ${
                      editListTextColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editListTextColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <ColorSwatchPicker value={editListTextColor} onChange={setEditListTextColor} choices={FIELD_COLOR_CHOICES} />
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

      {/* ================= EDIT DOC (color only — icon is fixed, rename is inline) ================= */}
      {docEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={() => setDocEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Edit Doc</h3>
              <button onClick={() => setDocEditTarget(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Color</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditDocColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center shrink-0 ${
                      editDocColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editDocColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <ColorSwatchPicker value={editDocColor} onChange={setEditDocColor} choices={FIELD_COLOR_CHOICES} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400 mb-1 block">Text color (defaults to Color above)</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditDocTextColor(null)}
                    title="Default"
                    className={`w-6 h-6 rounded-full cursor-pointer bg-neutral-700 flex items-center justify-center shrink-0 ${
                      editDocTextColor === null ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {editDocTextColor === null && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <ColorSwatchPicker value={editDocTextColor} onChange={setEditDocTextColor} choices={FIELD_COLOR_CHOICES} />
                </div>
              </div>
              <div className="flex items-center gap-2 bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                <FileText className="w-3.5 h-3.5" style={{ color: editDocColor || undefined }} />
                <span className="text-xs text-neutral-300" style={{ color: editDocTextColor || editDocColor || undefined }}>
                  {docEditTarget.doc.title || 'Untitled'}
                </span>
              </div>
              <button onClick={saveDocEdit} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
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
                <ColorSwatchPicker value={newStatusColor} onChange={setNewStatusColor} choices={FIELD_COLOR_CHOICES} size="sm" />
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
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/55 backdrop-blur-[3px] p-6 md:p-10"
          onClick={() => setModalTaskStack([])}
        >
          {/* Plain fade-in, no shared-layout zoom from the row (dropped layoutId here — TaskRow.tsx
              keeps its own layout/layoutId untouched, that still drives its independent list-reflow
              animation). No `exit` prop on this div or its children below: a motion component with
              no exit unmounts the instant it's removed from the tree, so closing (X, backdrop
              click, or Escape) snaps away immediately instead of playing a reverse transition. */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-6xl h-[88vh] bg-neutral-900 border border-neutral-800 rounded-xl md:rounded shadow-2xl overflow-hidden"
          >
          <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40 shrink-0">
              {/* Smaller, lower-contrast on mobile — a breadcrumb is orientation, not the main
                  content, and shouldn't compete with the task title for attention. */}
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 md:text-xs md:text-neutral-400 font-mono overflow-x-auto">
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
                {/* Mobile-only — the UUID itself is hidden from the main view (see below), so this
                    is the one place left to grab it if it's ever actually needed. */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeModalTask.id);
                    showToast('Task ID copied');
                  }}
                  title="Copy task ID"
                  className="md:hidden text-[11px] px-2.5 py-1 rounded border cursor-pointer transition flex items-center gap-1.5 text-neutral-400 border-neutral-800 hover:bg-neutral-800/60"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {canManageCurrentWorkspace && (
                  <button
                    onClick={() =>
                      setAccessControlTarget({
                        kind: 'task',
                        id: activeModalTask.id,
                        label: 'Task',
                        isPrivate: activeModalTask.isPrivate,
                        accessJson: activeModalTask.accessJson,
                      })
                    }
                    title={activeModalTask.isPrivate ? 'Private — manage access' : 'Manage access'}
                    className={`text-[11px] px-2.5 py-1 rounded border cursor-pointer transition flex items-center gap-1.5 ${
                      activeModalTask.isPrivate
                        ? 'bg-neutral-800 text-blue-400 border-neutral-700'
                        : 'text-neutral-400 border-neutral-800 hover:bg-neutral-800/60'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </button>
                )}
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
              {/* On mobile, Comments replaces the task view entirely (rather than a cropped
                  side-by-side 420px panel) — hidden outright here while showActivityPanel is on,
                  the same toggle button in the header above acts as the "back to task" control
                  since it just flips showActivityPanel again. Desktop keeps the side-by-side
                  split unchanged. */}
              <div className={`flex-1 min-w-0 overflow-y-auto p-8 space-y-6 ${showActivityPanel ? (isMobile ? 'hidden' : 'border-r border-neutral-800') : ''}`}>
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
                </div>

                {/* Compact metadata bar — Status, Dates, Assignees together right under the
                    title. An expert design review flagged the old layout: Status alone up top in
                    its own bordered box, Timeframe/Assignees each in their own near-empty
                    bordered box all the way down at the bottom (after Documents/Subtasks) —
                    scattered and boxy compared to ClickUp's compact icon-led row. Desktop: one
                    flat row, small icon-led groups, no borders — a thin vertical divider between
                    groups is enough structure on its own. Mobile keeps its existing pill-per-row
                    shape, just moved up here from the bottom. */}
                <div className={isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-x-4 gap-y-2'}>
                  <div className={isMobile ? 'flex items-center gap-2.5 bg-neutral-900/60 rounded-lg px-3 py-2.5' : 'flex items-center gap-1.5'}>
                    {isMobile && <span className="text-xs text-neutral-400 font-medium shrink-0">Status:</span>}
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

                  {!isMobile && <span className="w-px h-4 bg-neutral-800" />}

                  {isMobile ? (
                    <div className="flex items-center gap-2.5 bg-neutral-900/60 rounded-lg px-3 py-2.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="text-xs text-neutral-400 font-medium shrink-0">Dato:</span>
                      <div className="flex items-center gap-1 text-xs font-mono min-w-0">
                        <DatePickerPopover
                          value={activeModalTask.startDate}
                          onChange={(iso) =>
                            optimisticSetDates(
                              activeModalTask.id,
                              iso,
                              activeModalTask.dueDate ? new Date(activeModalTask.dueDate).toISOString() : null
                            )
                          }
                          badgeColorHex={(() => {
                            const c = startDateColor(activeModalTask.startDate, activeModalTask.dueDate);
                            return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
                          })()}
                          tooltip={startDateTooltip(activeModalTask.startDate)}
                        />
                        <span className="text-neutral-600 shrink-0">–</span>
                        <DatePickerPopover
                          value={activeModalTask.dueDate}
                          onChange={(iso) =>
                            optimisticSetDates(
                              activeModalTask.id,
                              activeModalTask.startDate ? new Date(activeModalTask.startDate).toISOString() : null,
                              iso
                            )
                          }
                          badgeColorHex={(() => {
                            const c = dueDateColor(activeModalTask.dueDate);
                            return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
                          })()}
                          tooltip={dueDateTooltip(activeModalTask.dueDate)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-mono">
                      <CalendarIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <DatePickerPopover
                        value={activeModalTask.startDate}
                        onChange={(iso) =>
                          optimisticSetDates(
                            activeModalTask.id,
                            iso,
                            activeModalTask.dueDate ? new Date(activeModalTask.dueDate).toISOString() : null
                          )
                        }
                        badgeColorHex={(() => {
                          const c = startDateColor(activeModalTask.startDate, activeModalTask.dueDate);
                          return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
                        })()}
                        tooltip={startDateTooltip(activeModalTask.startDate)}
                      />
                      <span className="text-neutral-600">–</span>
                      <DatePickerPopover
                        value={activeModalTask.dueDate}
                        onChange={(iso) =>
                          optimisticSetDates(
                            activeModalTask.id,
                            activeModalTask.startDate ? new Date(activeModalTask.startDate).toISOString() : null,
                            iso
                          )
                        }
                        badgeColorHex={(() => {
                          const c = dueDateColor(activeModalTask.dueDate);
                          return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
                        })()}
                        tooltip={dueDateTooltip(activeModalTask.dueDate)}
                      />
                    </div>
                  )}

                  {!isMobile && <span className="w-px h-4 bg-neutral-800" />}

                  {(() => {
                    const assigneeChips = (
                      <>
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
                      </>
                    );
                    return isMobile ? (
                      <div className="flex items-center gap-2.5 bg-neutral-900/60 rounded-lg px-3 py-2.5">
                        <UserCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="text-xs text-neutral-400 font-medium shrink-0">Ansvarlig:</span>
                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">{assigneeChips}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <UserCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <div className="flex flex-wrap items-center gap-1.5">{assigneeChips}</div>
                      </div>
                    );
                  })()}
                </div>

                {/* Description — a plain free-text summary, distinct from Documents below (full
                    rich-text pages). Matches where ClickUp itself puts this: directly under the
                    Status/Dates/Assignees row, above everything else. */}
                <TaskDescriptionBlock
                  value={activeModalTask.description}
                  onCommit={(value) => optimisticSetDescription(activeModalTask.id, value)}
                />

                {/* Docs — multiple named documents, live collaborative editing */}
                <div className="space-y-2 pt-4 border-t border-neutral-800">
                  <h3 className="text-xs font-medium text-neutral-500 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents</h3>
                  <div>
                    <div className="flex items-center gap-1.5 pb-2 border-b border-neutral-800/80 overflow-x-auto">
                      <DndContext sensors={docSensors} collisionDetection={closestCenter} onDragEnd={handleDocDragEnd}>
                        <SortableContext items={activeTaskDocs.map((d) => d.id)} strategy={horizontalListSortingStrategy}>
                          {activeTaskDocs.map((d) => (
                            <DocTab
                              key={d.id}
                              doc={d}
                              isActive={activeDocId === d.id}
                              onSelect={() => setActiveDocId(d.id)}
                              onDelete={() => setDocToDelete({ id: d.id, title: d.title || 'Untitled' })}
                              onUnlink={
                                activeModalTaskId
                                  ? () => {
                                      setDocTaskLink(d.id, null);
                                      if (activeDocId === d.id) setActiveDocId(null);
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
                      <div className="pt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={activeTaskDocs.find((d) => d.id === activeDocId)?.title || ''}
                            onChange={(e) => activeModalTaskId && updateDoc(activeDocId, activeModalTaskId, { title: e.target.value })}
                            onFocus={captureDocEditBaseline}
                            onBlur={() => commitDocEditActivity()}
                            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-white focus:outline-none"
                            placeholder="Document title"
                          />
                          <DocExportMenu docId={activeDocId} onToast={showToast} />
                        </div>
                        <CollabDocEditor
                          key={activeDocId}
                          docId={activeDocId}
                          onJump={jumpToMention}
                          placeholder="Write notes, specs, anything..."
                          className="min-h-[8em] text-xs text-neutral-300"
                          onEditorFocus={captureDocEditBaseline}
                          onEditorBlur={commitDocEditActivity}
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-neutral-500 py-4">No documents yet — press "+ New" to add one.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-neutral-800">
                  <h3 className="text-xs font-medium text-neutral-500">
                    Subtasks ({currentSubtasks.length})
                  </h3>

                  <div className={isMobile ? '' : 'overflow-x-auto'}>
                    <div style={{ minWidth: isMobile || currentSubtasks.length === 0 ? undefined : tableMinWidth }}>
                    {currentSubtasks.length > 0 && (
                      <div
                        className="hidden md:grid items-center px-3 py-1.5 text-[9px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-800"
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
                    <div className={isMobile ? 'flex flex-col gap-2' : ''}>
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
                    {!subtaskAddOpen ? (
                      <button
                        onClick={() => setSubtaskAddOpen(true)}
                        className="w-full text-left px-1 py-2 text-xs text-neutral-500 hover:text-blue-400 cursor-pointer"
                      >
                        {isMobile ? '+ Legg til underoppgave' : '+ Add subtask'}
                      </button>
                    ) : (
                      <div className="flex gap-2 items-center pt-1">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Subtask name..."
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddSubtask(activeModalTask);
                            if (e.key === 'Escape') {
                              setNewSubtaskTitle('');
                              setSubtaskAddOpen(false);
                            }
                          }}
                          // Collapses back to the discreet link once blurred with nothing typed —
                          // never mid-typing, and never while there's still text to add (so
                          // clicking "Add" itself can't race the collapse).
                          onBlur={() => {
                            if (!newSubtaskTitle.trim()) setSubtaskAddOpen(false);
                          }}
                          className="flex-1 bg-transparent border-b border-neutral-700 focus:border-blue-500 px-1 py-1.5 text-xs text-white focus:outline-none"
                        />
                        <button
                          onClick={() => handleAddSubtask(activeModalTask)}
                          className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer px-1 shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <AnimatePresence initial={false}>
              {showActivityPanel && (
              <motion.div
                key="activity-panel"
                initial={isMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
                animate={isMobile ? { opacity: 1 } : { width: 420, opacity: 1 }}
                exit={isMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className={isMobile ? 'w-full h-full overflow-hidden' : 'shrink-0 overflow-hidden'}
              >
              <div className={`${isMobile ? 'w-full' : 'w-[420px]'} h-full flex flex-col overflow-hidden`}>
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
                  <MentionTextarea
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (newCommentBody.trim()) {
                          addComment(activeModalTask.id, newCommentBody.trim());
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
                      addComment(activeModalTask.id, newCommentBody.trim());
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
          </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <QuickCreatePopover
        open={createTaskOpen}
        workspaces={workspaces}
        users={users}
        defaultStartDate={createTaskDefaultDate}
        activeWorkspaceId={activeWorkspaceId}
        onClose={() => setCreateTaskOpen(false)}
        onCreateTask={({ title, spaceId, listId, startDate, dueDate }) => {
          optimisticCreateTask(title, listId, spaceId, null, startDate, dueDate);
        }}
        onCreateEvent={({ title, startDate, endDate, allDay, spaceId, workspaceId, assigneeIds, location }) => {
          optimisticCreateEvent({ title, startDate, endDate, allDay, spaceId, workspaceId, assigneeIds, location });
        }}
      />

      <EventDetailModal
        event={events.find((e) => e.id === eventDetailId) ?? null}
        workspaces={workspaces}
        users={users}
        onClose={() => setEventDetailId(null)}
        onUpdate={(patch) => eventDetailId && updateEvent(eventDetailId, patch)}
        onSetAssignees={(assigneeIds) => eventDetailId && optimisticSetEventAssignees(eventDetailId, assigneeIds)}
        onDelete={() => eventDetailId && deleteEvent(eventDetailId)}
      />

      {/* Team membership management (promote/demote, Roles, remove) moved into Office's
          ManageableAvatar popover — this ConfirmDialog is its one remaining shared piece, reused
          by whichever avatar's manage popover requests a removal (see onRequestRemoveMember
          threaded into OfficePage below). */}
      <ConfirmDialog
        open={!!memberToRemove}
        title="Remove from workspace?"
        message={memberToRemove ? `This removes ${memberToRemove.name} from this workspace. Their account itself isn't deleted — they can be re-added later.` : ''}
        confirmLabel="Remove"
        onCancel={() => setMemberToRemove(null)}
        onConfirm={() => {
          if (memberToRemove && currentWorkspace) removeWorkspaceMember(currentWorkspace.id, memberToRemove.id);
          setMemberToRemove(null);
        }}
      />

      <ConfirmDialog
        open={clearOverdueConfirmOpen}
        title="Clear overdue due dates?"
        message={`This clears the due date on ${overdueTasksInView.length} overdue task${overdueTasksInView.length === 1 ? '' : 's'} in this view. Start dates are left untouched.`}
        confirmLabel="Clear"
        onCancel={() => setClearOverdueConfirmOpen(false)}
        onConfirm={() => {
          for (const t of overdueTasksInView) {
            optimisticSetDates(t.id, t.startDate ? new Date(t.startDate).toISOString() : null, null);
          }
          setClearOverdueConfirmOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!docToDelete}
        title="Delete document?"
        message={docToDelete ? `This permanently deletes "${docToDelete.title}".` : ''}
        onCancel={() => setDocToDelete(null)}
        onConfirm={() => {
          if (docToDelete && activeModalTaskId) {
            deleteDoc(docToDelete.id, activeModalTaskId);
            if (activeDocId === docToDelete.id) setActiveDocId(null);
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
        open={!!fieldConflictPrompt}
        title="Custom field not on the destination list"
        message={
          fieldConflictPrompt
            ? `This task's "${fieldConflictPrompt.conflictingFields.map((f) => f.name).join('", "')}" ${
                fieldConflictPrompt.conflictingFields.length > 1 ? "fields aren't" : "field isn't"
              } on the destination list — create ${
                fieldConflictPrompt.conflictingFields.length > 1 ? 'them' : 'it'
              } there to keep the value, or cancel the move.`
            : ''
        }
        confirmLabel="Create field there"
        cancelLabel="Cancel"
        danger={false}
        onCancel={() => setFieldConflictPrompt(null)}
        onConfirm={resolveFieldConflictByCreating}
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
            ) : activeDragEntity.kind === 'room' ? (
              <span className="text-sm shrink-0">{activeDragEntity.icon || '🏠'}</span>
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

      <MobileSpacesSheet
        open={mobileSpacesOpen}
        onClose={() => setMobileSpacesOpen(false)}
        title="Spaces"
        onOpenSearch={() => setCommandPaletteOpen(true)}
        // Deliberately NOT currentWorkspace — that legitimately *becomes* the personal workspace
        // while My Tasks is active, and this sheet (never unmounted, see MobileSpacesSheet.tsx's
        // own file-level comment) would then briefly carry the personal workspace's own Spaces
        // into its internal expand-state tracking, even while hidden. This mirrors what
        // openMobileSpaces()'s own fallback already resolves to.
        workspaceName={realSheetWorkspace?.name ?? 'Workspace'}
        workspaceId={realSheetWorkspace?.id ?? null}
        spaces={realSheetWorkspace?.spaces ?? []}
        activeSpaceId={activeSpaceId}
        activeListIds={activeListIds}
        onSelectSpace={(spaceId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, []);
          setActiveView('board');
        }}
        onSelectList={(spaceId, listId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, [listId]);
          setActiveView('board');
        }}
        onSelectDoc={(spaceId, docId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, []);
          setDocsNavigation(null, docId);
          setActiveView('board');
        }}
        onSelectSpaceDoc={(spaceId, docId, folderId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, []);
          setDocsNavigation(folderId, docId);
          setActiveView('docs');
        }}
      />
      {/* "My Tasks"'s own tree browser — literally the same MobileSpacesSheet component, just
          fed the personal workspace's own data instead of the real one, per the explicit ask for
          this to have "samme oppbygning som Spaces." Its own onSelect* callbacks are identical to
          the real sheet's above except they don't need any workspace-switching logic (My Tasks
          already switched activeWorkspaceId to the personal one before opening this). */}
      <MobileSpacesSheet
        open={mobilePersonalSpacesOpen}
        onClose={() => setMobilePersonalSpacesOpen(false)}
        title="Personal Spaces"
        onOpenSearch={() => setCommandPaletteOpen(true)}
        workspaceName="Personal"
        workspaceId={personalWorkspace?.id ?? null}
        spaces={personalWorkspace?.spaces ?? []}
        activeSpaceId={activeSpaceId}
        activeListIds={activeListIds}
        onSelectSpace={(spaceId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, []);
          setActiveView('board');
        }}
        onSelectList={(spaceId, listId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, [listId]);
          setActiveView('board');
        }}
        onSelectDoc={(spaceId, docId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, []);
          setDocsNavigation(null, docId);
          setActiveView('board');
        }}
        onSelectSpaceDoc={(spaceId, docId, folderId) => {
          setModalTaskStack([]);
          setNavigation(spaceId, []);
          setDocsNavigation(folderId, docId);
          setActiveView('docs');
        }}
      />
      {currentSpace && activeStandaloneDoc && docBookRoot && docBookHasPages && (
        <MobileDocPagesSheet
          open={mobileDocPagesOpen}
          onClose={() => setMobileDocPagesOpen(false)}
          space={currentSpace}
          rootDoc={docBookRoot}
          activeDocId={activeStandaloneDoc.id}
          members={users}
          onOpenDoc={(docId) => setDocsNavigation(activeDocFolderId, docId)}
          onAddPage={(parentId) => createSpaceDoc(currentSpace.id, null, { parentId })}
          onDocContextMenu={(e, doc) => openDocMenu(e, doc, currentSpace.id)}
          renameDocId={renameDocId}
          onRenameDocHandled={() => setRenameDocId(null)}
          docDropIndicator={docDropIndicator}
        />
      )}
      <MobileCalendarFilterSheet
        open={mobileCalendarFilterOpen}
        onClose={() => setMobileCalendarFilterOpen(false)}
        spaces={currentWorkspace?.spaces ?? []}
        visibleListIds={calendarVisibleListIds}
        onToggleList={toggleCalendarList}
        onToggleSpace={toggleCalendarSpace}
      />

      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
      {settingsOpen && currentWorkspace && (
        <SettingsPanel
          workspace={currentWorkspace}
          canManage={canManageCurrentWorkspace}
          initialTab={settingsInitialTab}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsInitialTab('general');
          }}
          onChange={() => {
            setHiddenNavTabs(readHiddenNavTabs());
            setHideWeekNumbers(readHideWeekNumbers());
          }}
        />
      )}
      {accountSettingsOpen &&
        (() => {
          const me = users.find((u) => u.id === currentUserId);
          if (!me) return null;
          return <AccountSettingsPanel user={me} onClose={() => setAccountSettingsOpen(false)} onCopyCalendarLink={handleCopyCalendarLink} />;
        })()}

      {accessControlTarget && currentWorkspace && (
        <AccessControlPanel
          label={accessControlTarget.label}
          isPrivate={accessControlTarget.isPrivate}
          accessJson={accessControlTarget.accessJson}
          members={currentWorkspace.members}
          roles={currentWorkspace.roles}
          onClose={() => setAccessControlTarget(null)}
          onSave={(isPrivate, accessJson) => {
            const { kind, id, spaceId } = accessControlTarget;
            if (kind === 'space') updateSpace(id, { isPrivate, accessJson });
            else if (kind === 'folder' && spaceId) updateFolder(spaceId, id, { isPrivate, accessJson });
            else if (kind === 'list' && spaceId) updateList(spaceId, id, { isPrivate, accessJson });
            else if (kind === 'task') setTaskPrivacy(id, isPrivate, accessJson);
          }}
        />
      )}
      <SessionSync />
    </div>
    </DndContext>
  );
}

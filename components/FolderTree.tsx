'use client';

import { useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIconLucide,
  FolderOpen,
  List as ListIcon,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Check,
  Lock,
  Star,
  Rocket,
  Briefcase,
  Bookmark,
  Flag,
  Layers,
  Target,
  Heart,
  Trophy,
  Zap,
  Sparkles,
  Lightbulb,
  Gem,
  Crown,
  Shield,
  Palette,
  Music,
  Camera,
  Film,
  Book,
  GraduationCap,
  Code,
  Terminal,
  Database,
  Server,
  Cloud,
  Wifi,
  Globe,
  Compass,
  Map,
  Home,
  Building,
  ShoppingCart,
  Wallet,
  TrendingUp,
  BarChart,
  PieChart,
  Calculator,
  Clipboard,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Video,
  Headphones,
  Gamepad2,
  Puzzle,
  Bike,
  Car,
  Plane,
  Anchor,
  Sun,
  Moon,
  Snowflake,
  Flame,
  Droplet,
  Leaf,
  TreePine,
  Coffee,
  Pizza,
  Utensils,
  Wrench,
  Hammer,
  Settings,
  Package,
  Key,
  Bell,
  Calendar,
  Clock,
  Award,
  Gift,
  Smile,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTaskStore, HierarchySpace, HierarchyFolder, HierarchyList, Task, TaskDoc } from '../store/useTaskStore';
import { getChildFolders, getListsIn, collectListIdsUnder } from '../lib/folderTree';
import { getSpaceDocsIn } from '../lib/docFolderTree';
import { activeGlowStyle } from '../lib/activeGlowStyle';

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

// Shared icon set for Folder/List/Space (see prisma/schema.prisma's icon fields) — expanded from
// the original 9 to give each one real personality/at-a-glance distinction, per user request.
// Flat array, not grouped into categories — the picker grid (app/page.tsx) just wraps it, which
// stays legible at this size without needing section headers.
export const FOLDER_ICON_CHOICES = [
  'star', 'rocket', 'briefcase', 'bookmark', 'flag', 'layers', 'target', 'heart', 'trophy',
  'zap', 'sparkles', 'lightbulb', 'gem', 'crown', 'shield', 'palette', 'music', 'camera', 'film',
  'book', 'graduation-cap', 'code', 'terminal', 'database', 'server', 'cloud', 'wifi', 'globe',
  'compass', 'map', 'home', 'building', 'shopping-cart', 'wallet', 'trending-up', 'bar-chart',
  'pie-chart', 'calculator', 'clipboard', 'inbox', 'mail', 'message-square', 'phone', 'video',
  'headphones', 'gamepad', 'puzzle', 'bike', 'car', 'plane', 'anchor', 'sun', 'moon', 'snowflake',
  'flame', 'droplet', 'leaf', 'tree-pine', 'coffee', 'pizza', 'utensils', 'wrench', 'hammer',
  'settings', 'package', 'key', 'bell', 'calendar', 'clock', 'award', 'gift', 'smile', 'users',
];

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
  zap: Zap,
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  gem: Gem,
  crown: Crown,
  shield: Shield,
  palette: Palette,
  music: Music,
  camera: Camera,
  film: Film,
  book: Book,
  'graduation-cap': GraduationCap,
  code: Code,
  terminal: Terminal,
  database: Database,
  server: Server,
  cloud: Cloud,
  wifi: Wifi,
  globe: Globe,
  compass: Compass,
  map: Map,
  home: Home,
  building: Building,
  'shopping-cart': ShoppingCart,
  wallet: Wallet,
  'trending-up': TrendingUp,
  'bar-chart': BarChart,
  'pie-chart': PieChart,
  calculator: Calculator,
  clipboard: Clipboard,
  inbox: Inbox,
  mail: Mail,
  'message-square': MessageSquare,
  phone: Phone,
  video: Video,
  headphones: Headphones,
  gamepad: Gamepad2,
  puzzle: Puzzle,
  bike: Bike,
  car: Car,
  plane: Plane,
  anchor: Anchor,
  sun: Sun,
  moon: Moon,
  snowflake: Snowflake,
  flame: Flame,
  droplet: Droplet,
  leaf: Leaf,
  'tree-pine': TreePine,
  coffee: Coffee,
  pizza: Pizza,
  utensils: Utensils,
  wrench: Wrench,
  hammer: Hammer,
  settings: Settings,
  package: Package,
  key: Key,
  bell: Bell,
  calendar: Calendar,
  clock: Clock,
  award: Award,
  gift: Gift,
  smile: Smile,
  users: Users,
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
  // Docs as a sidebar-native sibling of List/Folder — additive to the separate Docs-tab nav
  // (DocFolderTree.tsx), which keeps working exactly as before. activeStandaloneDocId highlights
  // a Doc row when it's open, regardless of which activeView is currently selected (see
  // app/page.tsx's hoisted doc-editor render).
  activeStandaloneDocId: string | null;
  onOpenDoc: (docId: string) => void;
  onDeleteDocRequest: (doc: TaskDoc) => void;
  onDocContextMenu: (e: React.MouseEvent, doc: TaskDoc) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
  listDropIndicator: { targetId: string; position: 'above' | 'below' } | null;
};

export default function FolderTree(props: FolderTreeProps) {
  return <FolderLevel {...props} parentId={null} depth={0} />;
}

function FolderLevel(props: FolderTreeProps & { parentId: string | null; depth: number }) {
  const { space, tasks, activeView, activeListIds, calendarVisibleListIds, onNavigateList, toggleCalendarList, parentId, depth } = props;
  const { createList, createFolder, createSpaceDoc, renameList } = useTaskStore();
  const [addMode, setAddMode] = useState<'list' | 'folder' | 'doc' | null>(null);
  const [draft, setDraft] = useState('');

  const folders = getChildFolders(space, parentId);
  const lists = getListsIn(space, parentId);
  const docs = getSpaceDocsIn(space, parentId);

  const commitAdd = async () => {
    const trimmed = draft.trim();
    if (trimmed) {
      if (addMode === 'list') createList(space.id, trimmed, parentId);
      else if (addMode === 'folder') createFolder(space.id, trimmed, parentId);
      // Doesn't navigate into the new doc — matches ClickUp's own "keep stubbing out pages while
      // staying put" behavior, same as the book panel's own "Add page" button.
      else if (addMode === 'doc') await createSpaceDoc(space.id, parentId, { title: trimmed });
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

      {/* Lists and top-level Docs (parentId/folderId both null) render as one combined,
          order-sorted sequence rather than two separate blocks — otherwise a Doc could never
          land anywhere but after every List, no matter what order.field it actually had.
          Planner's sidebar is a Lists/Folders filter, not a navigation tree — Docs have no
          calendar-filter meaning there (clicking one did nothing), so they're excluded from the
          merge entirely in that mode, same as before. */}
      {(() => {
        type SidebarItem = { key: string; order: number; render: () => React.ReactNode };
        const listItems: SidebarItem[] = lists.map((list) => {
          const isActive = activeView === 'board' && activeListIds.has(list.id);
          const count = tasks.filter((t) => t.listId === list.id && t.parentId === null && !t.archived).length;
          return {
            key: list.id,
            order: list.order,
            render: () => (
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
                listDropIndicator={props.listDropIndicator}
              />
            ),
          };
        });
        const docItems: SidebarItem[] =
          activeView === 'calendar'
            ? []
            : docs.map((doc) => ({
                key: doc.id,
                order: doc.order,
                render: () => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    isActive={props.activeStandaloneDocId === doc.id}
                    onOpen={() => props.onOpenDoc(doc.id)}
                    onDeleteRequest={() => props.onDeleteDocRequest(doc)}
                    onContextMenu={(e) => props.onDocContextMenu(e, doc)}
                    renameDocId={props.renameDocId}
                    onRenameDocHandled={props.onRenameDocHandled}
                    listDropIndicator={props.listDropIndicator}
                  />
                ),
              }));
        return [...listItems, ...docItems]
          .sort((a, b) => a.order - b.order)
          .map((item) => item.render());
      })()}

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
          placeholder={addMode === 'list' ? 'List name...' : addMode === 'doc' ? 'Doc title...' : 'Folder name...'}
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
          {activeView !== 'calendar' && (
            <button
              onClick={() => {
                setDraft('');
                setAddMode('doc');
              }}
              title="New doc"
              className="px-1.5 py-1 rounded text-[11px] text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/30 cursor-pointer"
            >
              <FileText className="w-3 h-3" />
            </button>
          )}
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

function DocRow({
  doc,
  isActive,
  onOpen,
  onDeleteRequest,
  onContextMenu,
  renameDocId,
  onRenameDocHandled,
  listDropIndicator,
}: {
  doc: TaskDoc;
  isActive: boolean;
  onOpen: () => void;
  onDeleteRequest: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
  listDropIndicator: { targetId: string; position: 'above' | 'below' } | null;
}) {
  const { updateSpaceDoc } = useTaskStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.title);

  // This DocRow (Tasks-tab sidebar, Docs shown alongside Lists) never had any drag-and-drop at
  // all — genuinely missing, not a regression (unlike DocFolderTree.tsx's own DocRow and
  // DocSubpagesPanel.tsx's PageRow, both of which already had or since gained it). Confirmed
  // directly: dragging a List here already worked, dragging a Doc did nothing, no console error —
  // consistent with a draggable that was simply never wired up, not a broken one. Same
  // `spacedoc-drag:`/`spacedoc:` ids DocFolderTree.tsx's DocRow uses — safe to reuse here since
  // this component and that one are mutually exclusive (`activeView === 'docs' ? DocFolderTree :
  // FolderTree`), never mounted at the same time.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `spacedoc-drag:${doc.id}` });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `spacedoc:${doc.id}` });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  // Triggered by the "Rename" item in the doc's right-click context menu (page.tsx), same
  // pattern as ListRow's equivalent effect.
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
      {listDropIndicator?.targetId === doc.id && listDropIndicator.position === 'above' && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
      )}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={onOpen}
        onContextMenu={onContextMenu}
        className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer ${
          isActive ? 'bg-neutral-800 font-medium' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
        } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
          <FileText className="w-3 h-3 shrink-0" style={{ color: doc.color || undefined }} />
          <span className="truncate" style={isActive ? activeGlowStyle(doc.color) : { color: doc.color || undefined }}>
            {doc.title || 'Untitled'}
          </span>
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
      {listDropIndicator?.targetId === doc.id && listDropIndicator.position === 'below' && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
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
        className={`group w-full text-left px-2 py-1 rounded text-[11px] transition flex items-center justify-between cursor-pointer text-neutral-300 hover:text-neutral-200 hover:bg-neutral-800/30 ${
          isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''
        } ${isDragging ? 'opacity-40' : ''}`}
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
          {/* Own color always, independent of checked state — same convention List/Space rows
              already use (only the checkbox itself indicates "checked"). This span had no color
              override before, so it silently inherited the row wrapper's text-blue-400 whenever
              checked, unlike List/Space which already got an explicit style here. */}
          <span className="truncate" style={{ color: folder.color || undefined }}>{folder.name}</span>
          {folder.isPrivate && <Lock className="w-2.5 h-2.5 text-neutral-500 shrink-0" />}
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
  listDropIndicator,
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
  listDropIndicator: { targetId: string; position: 'above' | 'below' } | null;
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
    <>
      {listDropIndicator?.targetId === list.id && listDropIndicator.position === 'above' && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
      )}
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
        isActive ? 'bg-neutral-800 font-medium' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
      } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="truncate flex items-center gap-1.5 min-w-0">
        {filterMode && (
          <span
            className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 transition ${
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
        {/* Own color always — only the checkbox indicates "checked" (Google Calendar's sidebar
            convention); when active/open, the name glows a bright version of that same color
            instead of switching to blue. */}
        <span className="truncate" style={isActive ? activeGlowStyle(list.color) : { color: list.color || undefined }}>
          {list.name}
        </span>
        {list.isPrivate && <Lock className="w-2.5 h-2.5 text-neutral-500 shrink-0" />}
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
      {listDropIndicator?.targetId === list.id && listDropIndicator.position === 'below' && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
      )}
    </>
  );
}

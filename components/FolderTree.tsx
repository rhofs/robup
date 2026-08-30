'use client';

import { useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import FloatingPopover from './FloatingPopover';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Folder as FolderIconLucide,
  FolderOpen,
  List as ListIcon,
  FileText,
  Plus,
  MoreHorizontal,
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
import { getChildFolders, getListsIn, getBoardDocsIn, collectListIdsUnder } from '../lib/folderTree';
import { activeGlowStyle } from '../lib/activeGlowStyle';

const COLLAPSED_FOLDERS_STORAGE_KEY = 'siqt.collapsedFolders';

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
  activeView: 'board' | 'calendar' | 'docs' | 'office' | 'mytasks' | 'profile' | 'chat' | 'directMessages';
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
  // The existing per-Space "Archive"/"Viewing archive" toggle (previously task-table-only) now
  // also drives which Lists/Docs this tree shows — false (normal) hides archived ones, true shows
  // only the archived ones, mirroring how the task table already flips between the two sets.
  showArchived: boolean;
};

export default function FolderTree(props: FolderTreeProps) {
  return <FolderLevel {...props} parentId={null} depth={0} />;
}

function FolderLevel(props: FolderTreeProps & { parentId: string | null; depth: number }) {
  const { space, tasks, activeView, activeListIds, calendarVisibleListIds, onNavigateList, toggleCalendarList, parentId, depth, showArchived } = props;
  const { createList, createFolder, createSpaceDoc, renameList } = useTaskStore();
  const [addMode, setAddMode] = useState<'list' | 'folder' | 'doc' | null>(null);
  const [draft, setDraft] = useState('');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const folders = getChildFolders(space, parentId);
  const lists = getListsIn(space, parentId, showArchived);
  const docs = getBoardDocsIn(space, parentId, showArchived);

  const commitAdd = async () => {
    const trimmed = draft.trim();
    if (trimmed) {
      if (addMode === 'list') createList(space.id, trimmed, parentId);
      else if (addMode === 'folder') createFolder(space.id, trimmed, parentId);
      // Doesn't navigate into the new doc — matches ClickUp's own "keep stubbing out pages while
      // staying put" behavior, same as the book panel's own "Add page" button. `parentId` here is
      // a real Folder id (or null at a Space's own top level) — passed as boardFolderId, the axis
      // this sidebar actually reads; folderId (the separate DocFolder/Docs-tab axis) stays null.
      else if (addMode === 'doc') await createSpaceDoc(space.id, null, { title: trimmed, boardFolderId: parentId });
    }
    setDraft('');
    setAddMode(null);
  };

  return (
    // Bumped from ml-4 pl-2 — the previous per-level step was too subtle to read as "nested"
    // at a glance, especially two-plus levels deep. This is a flat increment that compounds
    // through natural DOM nesting (each recursive level adds another one on top), not a
    // depth-multiplied value — List rows inherit it automatically since they render in this
    // same wrapper. depth === 0 (a Space's own direct Lists/Docs, no Folder in between) gets a
    // smaller version of the same treatment rather than none at all — previously flush with the
    // Space header itself, which made it hard to tell where one Space's own content ended and
    // the next Space's began when scanning down a list of several Spaces in a row.
    <div className={depth === 0 ? 'ml-3 pl-2 border-l border-neutral-800/50 space-y-0.5' : 'ml-6 pl-3 border-l border-neutral-800 space-y-0.5'}>
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
          className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-app-strong focus:outline-none"
        />
      ) : (
        // ClickUp-style single "+" instead of three separate buttons — one anchor, a small
        // popover offering List/Folder/(Doc) picks `addMode` exactly like the three buttons
        // used to, so everything below (the inline name input, commitAdd) is unchanged.
        <FloatingPopover
          open={createMenuOpen}
          onClose={() => setCreateMenuOpen(false)}
          panelClassName="w-36 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
          anchor={
            <button
              onClick={() => setCreateMenuOpen((o) => !o)}
              title="New..."
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/30 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          }
        >
          <button
            onClick={() => {
              setDraft('');
              setAddMode('list');
              setCreateMenuOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
          >
            <ListIcon className="w-3 h-3" /> List
          </button>
          <button
            onClick={() => {
              setDraft('');
              setAddMode('folder');
              setCreateMenuOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
          >
            <FolderIconLucide className="w-3 h-3" /> Folder
          </button>
          {/* Available at every depth — a Doc created here gets `boardFolderId: parentId`, the
              Tasks-tab-sidebar folder axis, independent of the Docs tab's own `folderId`/DocFolder
              tree. Hidden in Planner (calendar) — Docs have no calendar-filter meaning there. */}
          {activeView !== 'calendar' && (
            <button
              onClick={() => {
                setDraft('');
                setAddMode('doc');
                setCreateMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <FileText className="w-3 h-3" /> Doc
            </button>
          )}
        </FloatingPopover>
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
        className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-app-strong focus:outline-none"
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
        } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''} ${
          doc.archived ? 'opacity-50' : ''
        }`}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
          <FileText className="w-3 h-3 shrink-0" style={{ color: doc.color || undefined }} />
          <span className="truncate" style={isActive ? activeGlowStyle(doc.textColor || doc.color) : { color: doc.textColor || doc.color || undefined }}>
            {doc.title || 'Untitled'}
          </span>
        </span>
        {/* Right-click still opens the same menu directly on the row; this button is just a
            click/tap-reachable trigger for it — same menu, same Rename/Delete/etc., not a
            separate rename/delete pair. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e);
          }}
          title="More"
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 cursor-pointer shrink-0"
        >
          <MoreHorizontal className="w-3 h-3" />
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
  const { renameFolder, createList, createFolder, createSpaceDoc } = useTaskStore();
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

  // A shortcut for creating directly inside this Folder without first expanding it and
  // scrolling to its own FolderLevel's "+" at the bottom (which could be far away in a Folder
  // with many children already). Deliberately separate from that "+"'s own addMode/draft state
  // (FolderLevel's), since this one always targets `folder.id` and must force the folder open so
  // the newly created child is immediately visible.
  const [childCreateMenuOpen, setChildCreateMenuOpen] = useState(false);
  const [childAddMode, setChildAddMode] = useState<'list' | 'folder' | 'doc' | null>(null);
  const [childDraft, setChildDraft] = useState('');
  const commitChildAdd = async () => {
    const trimmed = childDraft.trim();
    if (trimmed) {
      if (childAddMode === 'list') createList(space.id, trimmed, folder.id);
      else if (childAddMode === 'folder') createFolder(space.id, trimmed, folder.id);
      else if (childAddMode === 'doc') await createSpaceDoc(space.id, null, { title: trimmed, boardFolderId: folder.id });
    }
    setChildDraft('');
    setChildAddMode(null);
  };

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
        className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-app-strong focus:outline-none mb-0.5"
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
              className="relative w-3.5 h-3.5 shrink-0 flex items-center justify-center"
            >
              <span
                className="absolute w-2 h-2 rounded-full transition group-hover:opacity-0"
                style={{ backgroundColor: folder.color || '#6b7280', opacity: allChecked ? 1 : someChecked ? 0.6 : 0.25 }}
              />
              {allChecked ? (
                <Eye className="absolute w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition" />
              ) : (
                <EyeOff className="absolute w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 transition" />
              )}
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
          <span className="truncate" style={{ color: folder.textColor || folder.color || undefined }}>{folder.name}</span>
          {folder.isPrivate && <Lock className="w-2.5 h-2.5 text-neutral-500 shrink-0" />}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {activeView === 'board' && <span className="text-[10px] text-neutral-500 font-mono">{folderTaskCount}</span>}
          {/* Shortcut to create directly inside this Folder — same List/Folder/Doc picker
              FolderLevel's own "+" opens, just scoped here and forcing the folder open so the
              new child is immediately visible instead of created "into the void" while
              collapsed. */}
          <FloatingPopover
            open={childCreateMenuOpen}
            onClose={() => setChildCreateMenuOpen(false)}
            panelClassName="w-36 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
            anchor={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setChildCreateMenuOpen((o) => !o);
                }}
                title="New inside this folder"
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-blue-400 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
            }
          >
            <button
              onClick={() => {
                setExpanded(true);
                setChildDraft('');
                setChildAddMode('list');
                setChildCreateMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <ListIcon className="w-3 h-3" /> List
            </button>
            <button
              onClick={() => {
                setExpanded(true);
                setChildDraft('');
                setChildAddMode('folder');
                setChildCreateMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <FolderIconLucide className="w-3 h-3" /> Folder
            </button>
            {activeView !== 'calendar' && (
              <button
                onClick={() => {
                  setExpanded(true);
                  setChildDraft('');
                  setChildAddMode('doc');
                  setChildCreateMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3 h-3" /> Doc
              </button>
            )}
          </FloatingPopover>
          {/* Right-click still opens the same menu directly on the row; this is just a
              click/tap-reachable trigger for it (Rename, Delete, appearance, etc. all live there
              already) instead of a separate rename button + delete button. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFolderContextMenu(e, folder);
            }}
            title="More"
            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 cursor-pointer"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        </span>
      </div>
      {childAddMode && (
        <input
          autoFocus
          value={childDraft}
          onChange={(e) => setChildDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitChildAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setChildDraft('');
              setChildAddMode(null);
            }
          }}
          placeholder={childAddMode === 'list' ? 'List name...' : childAddMode === 'doc' ? 'Doc title...' : 'Folder name...'}
          className="ml-6 w-[calc(100%-1.5rem)] bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-app-strong focus:outline-none"
        />
      )}
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
        className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-app-strong focus:outline-none"
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
      } ${isOver ? 'ring-1 ring-inset ring-neutral-500 bg-neutral-700/40' : ''} ${isDragging ? 'opacity-40' : ''} ${
        list.archived ? 'opacity-50' : ''
      }`}
    >
      <span className="truncate flex items-center gap-1.5 min-w-0">
        {filterMode && (
          // Colored dot (the list's own color, same as the icon beside it) instead of a plain
          // checkbox — reads as "this list's color is showing on the calendar" rather than a
          // generic form control. On hover it swaps for an explicit Eye/EyeOff toggle, same
          // "icon reveals its action on hover" convention this row's own "..." trigger just to
          // the right also uses.
          <span className="relative w-3.5 h-3.5 shrink-0 flex items-center justify-center">
            <span
              className="absolute w-2 h-2 rounded-full transition group-hover:opacity-0"
              style={{ backgroundColor: list.color || '#6b7280', opacity: checked ? 1 : 0.25 }}
            />
            {checked ? (
              <Eye className="absolute w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition" />
            ) : (
              <EyeOff className="absolute w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 transition" />
            )}
          </span>
        )}
        {/* Fixed-size, centered slot (matches the dot/eye slot's own w-3.5 h-3.5 just before it)
            — different chosen icons (camera, droplet, list-bullets, ...) don't all fill their own
            viewBox identically, so without a common bounding box to center inside, rows with
            different icons could drift a px or two off each other's vertical rhythm when
            scanning down a list. */}
        <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
          {(() => {
            const CustomIcon = list.icon ? FOLDER_ICON_MAP[list.icon] : null;
            const Icon = CustomIcon || ListIcon;
            return <Icon className="w-3 h-3" style={{ color: list.color || undefined }} />;
          })()}
        </span>
        {/* Own color always — only the checkbox indicates "checked" (Google Calendar's sidebar
            convention); when active/open, the name glows a bright version of that same color
            instead of switching to blue. */}
        <span className="truncate" style={isActive ? activeGlowStyle(list.textColor || list.color) : { color: list.textColor || list.color || undefined }}>
          {list.name}
        </span>
        {list.isPrivate && <Lock className="w-2.5 h-2.5 text-neutral-500 shrink-0" />}
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {!filterMode && <span className="text-[9px] text-neutral-500 font-mono">{count}</span>}
        {/* Right-click still opens the same menu directly on the row; this is just a
            click/tap-reachable trigger for it (Rename, Delete, appearance, etc. all live there
            already) instead of a separate rename button + delete button. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e);
          }}
          title="More"
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 cursor-pointer"
        >
          <MoreHorizontal className="w-3 h-3" />
        </button>
      </span>
      </div>
      {listDropIndicator?.targetId === list.id && listDropIndicator.position === 'below' && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-2" />
      )}
    </>
  );
}

import { create } from 'zustand';
import { Task as PrismaTask } from '@prisma/client';
import { collectFolderIdsUnder } from '../lib/folderTree';
import { collectDocFolderIdsUnder } from '../lib/docFolderTree';
import { startOfDay } from '../lib/calendarDates';
import { useHistoryStore } from './useHistoryStore';
import { useSessionStore } from './useSessionStore';

export type StatusDef = {
  id: string;
  name: string;
  color: string;
  order: number;
};

export type CustomFieldDef = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'dropdown';
  options: { id?: string; label: string; color: string }[];
};

export type AppUser = {
  id: string;
  name: string;
  initials: string;
  color: string;
  phone: string | null;
  title: string | null;
  status: string | null;
  roomId: string | null;
};

export type Task = PrismaTask & {
  assignees: AppUser[];
  _localId?: string;
};

export type TaskComment = {
  id: string;
  body: string;
  type: 'comment' | 'activity';
  activityKind: string | null;
  authorId: string | null;
  author: AppUser | null;
  createdAt: string;
};

// A Doc can be task-scoped (taskId set, today's behavior — the task modal's Documents tab),
// Space/DocFolder-scoped (spaceId set, the standalone Docs tab), or in principle both — the same
// underlying row shape either way, so one type covers both contexts.
export type TaskDoc = {
  id: string;
  title: string;
  content: string;
  order: number;
  taskId: string | null;
  spaceId: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HierarchyFolder = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  spaceId: string;
  parentId: string | null;
  order: number;
};

export type HierarchyDocFolder = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  spaceId: string;
  parentId: string | null;
  order: number;
};

export type HierarchyList = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  folderId: string | null;
  order: number;
};

export type HierarchySpace = {
  id: string;
  name: string;
  color: string;
  order: number;
  description: string | null;
  coverImageUrl: string | null;
  statuses: StatusDef[];
  customFields: CustomFieldDef[];
  folders: HierarchyFolder[];
  lists: HierarchyList[];
  docFolders: HierarchyDocFolder[];
  spaceDocs: TaskDoc[];
};

export type HierarchyRoom = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  workspaceId: string;
};

export type HierarchyWorkspace = {
  id: string;
  name: string;
  messageOfTheDay: string | null;
  spaces: HierarchySpace[];
  rooms: HierarchyRoom[];
};

// --- Snapshot shapes used by cascading-delete undo (Task/List/Folder/Space) ---
// Captured from live state right before a delete, walked bottom-up to build the JSON, then
// walked top-down (parent before child) to restore — see the `snapshot*`/`restore*` helpers
// inside the store body.
type TaskSnapshot = {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
  listId: string;
  parentId: string | null;
  assigneeIds: string[];
  customFieldValues: string;
  comments: { id: string; body: string; type: 'comment' | 'activity'; activityKind: string | null; authorId: string | null }[];
  docs: { id: string; title: string; content: string; order: number }[];
  subtasks: TaskSnapshot[];
};

type ListSnapshot = HierarchyList & { tasks: TaskSnapshot[] };

type FolderSnapshot = HierarchyFolder & { children: FolderSnapshot[]; lists: ListSnapshot[] };

type SpaceDocSnapshot = { id: string; title: string; content: string; order: number };

type DocFolderSnapshot = HierarchyDocFolder & { children: DocFolderSnapshot[]; docs: SpaceDocSnapshot[] };

type SpaceSnapshot = {
  id: string;
  name: string;
  color: string;
  order: number;
  description: string | null;
  coverImageUrl: string | null;
  statuses: StatusDef[];
  customFields: CustomFieldDef[];
  rootFolders: FolderSnapshot[];
  rootLists: ListSnapshot[];
  rootDocFolders: DocFolderSnapshot[];
  rootSpaceDocs: SpaceDocSnapshot[];
};

interface TaskStore {
  tasks: Task[];
  users: AppUser[];
  workspaces: HierarchyWorkspace[];
  comments: Record<string, TaskComment[]>;
  docs: Record<string, TaskDoc[]>;
  activeView: 'board' | 'calendar' | 'docs' | 'office';
  activeSpaceId: string | 'everything';
  activeListIds: Set<string>;
  // Planner's own position — lifted out of CalendarView.tsx's local state so back/forward can
  // round-trip drill-down (month -> week -> day) and next/prev navigation the same way Space/List
  // switches already do, per the user's explicit scoping call in the back/forward feature plan.
  calendarGranularity: 'month' | 'week' | 'day';
  calendarFocusDate: Date;
  // Docs tab's own position — which DocFolder is being browsed (null = space root) and which
  // standalone Doc is open in the full-page editor (null = folder-browse grid).
  activeDocFolderId: string | null;
  activeStandaloneDocId: string | null;
  // Office tab's own position — which team member's page is open (null = the team grid).
  activeOfficeUserId: string | null;
  isLoading: boolean;
  showArchived: boolean;

  fetchInitialData: () => Promise<void>;
  refetchWorkspaces: () => Promise<void>;
  refetchTasks: () => Promise<void>;
  setActiveView: (view: 'board' | 'calendar' | 'docs' | 'office') => void;
  setNavigation: (spaceId: string, listIds?: string[]) => void;
  setCalendarGranularity: (g: 'month' | 'week' | 'day') => void;
  setCalendarFocusDate: (d: Date) => void;
  setDocsNavigation: (docFolderId: string | null, docId: string | null) => void;
  setActiveOfficeUserId: (userId: string | null) => void;
  setShowArchived: (v: boolean) => void;

  optimisticMoveTask: (taskId: string, newStatus: string) => void;
  optimisticCreateTask: (
    title: string,
    listId: string,
    spaceId: string,
    parentId?: string | null,
    startDate?: string | null,
    dueDate?: string | null,
    id?: string,
    status?: string
  ) => Promise<void>;
  optimisticDeleteTask: (taskId: string) => Promise<void>;
  optimisticArchiveTask: (taskId: string, archived: boolean) => void;
  optimisticSetAssignees: (taskId: string, userIds: string[]) => void;
  optimisticSetCustomFieldValue: (taskId: string, fieldId: string, value: string) => void;
  optimisticSetDates: (taskId: string, startDate: string | null, dueDate: string | null) => void;
  optimisticSetList: (taskId: string, listId: string) => void;
  optimisticSetParent: (taskId: string, parentId: string | null) => void;
  optimisticSetTitle: (taskId: string, title: string) => void;

  createStatus: (spaceId: string, name: string, color: string, id?: string) => Promise<void>;
  updateStatus: (spaceId: string, statusId: string, patch: { name?: string; color?: string; order?: number }) => Promise<void>;
  deleteStatus: (spaceId: string, statusId: string) => Promise<void>;
  createCustomField: (
    spaceId: string,
    name: string,
    type: CustomFieldDef['type'],
    options?: { label: string; color: string }[],
    id?: string
  ) => Promise<void>;
  updateCustomField: (
    spaceId: string,
    fieldId: string,
    patch: { name?: string; options?: { id?: string; label: string; color: string }[] }
  ) => Promise<void>;
  deleteCustomField: (spaceId: string, fieldId: string) => Promise<void>;

  addUser: (name: string, initials: string, color: string, id?: string) => Promise<void>;
  updateUser: (
    userId: string,
    patch: { name?: string; initials?: string; color?: string; phone?: string | null; title?: string | null; status?: string | null; roomId?: string | null }
  ) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  // Office "rooms" — purely organizational/visual grouping of team members, unrelated to the
  // Space/Folder/List tree.
  createRoom: (workspaceId: string, name: string, id?: string) => Promise<void>;
  updateRoom: (roomId: string, patch: { name?: string; icon?: string | null; color?: string | null }) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  assignUserToRoom: (userId: string, roomId: string | null) => Promise<void>;
  updateWorkspaceMessage: (workspaceId: string, message: string | null) => Promise<void>;

  updateSpace: (
    spaceId: string,
    patch: { name?: string; color?: string; description?: string | null; coverImageUrl?: string | null }
  ) => Promise<void>;
  reorderSpace: (spaceId: string, order: number) => Promise<void>;
  createSpace: (workspaceId: string, name: string, id?: string) => Promise<void>;
  deleteSpace: (spaceId: string) => Promise<void>;

  createList: (spaceId: string, name: string, folderId?: string | null, id?: string) => Promise<void>;
  renameList: (spaceId: string, listId: string, name: string) => Promise<void>;
  updateList: (spaceId: string, listId: string, patch: { name?: string; color?: string | null; icon?: string | null }) => Promise<void>;
  // `targetSpaceId`, when given and different from `spaceId`, moves the list to a different
  // Space entirely (not just a different folder within the same one) — see the comment above
  // the implementation for why that needs a slower refetch-based path instead of a local patch.
  moveList: (spaceId: string, listId: string, folderId: string | null, targetSpaceId?: string) => Promise<void>;
  reorderList: (spaceId: string, listId: string, order: number) => Promise<void>;
  deleteList: (spaceId: string, listId: string) => Promise<void>;

  createFolder: (spaceId: string, name: string, parentId?: string | null, id?: string) => Promise<void>;
  renameFolder: (spaceId: string, folderId: string, name: string) => Promise<void>;
  updateFolder: (
    spaceId: string,
    folderId: string,
    patch: { name?: string; color?: string | null; icon?: string | null; order?: number }
  ) => Promise<void>;
  moveFolder: (spaceId: string, folderId: string, parentId: string | null, targetSpaceId?: string) => Promise<void>;
  deleteFolder: (spaceId: string, folderId: string) => Promise<void>;

  // Docs tab: a DocFolder tree per Space, parallel to Folder/List above.
  createDocFolder: (spaceId: string, name: string, parentId?: string | null, id?: string) => Promise<void>;
  updateDocFolder: (spaceId: string, folderId: string, patch: { name?: string; color?: string | null; icon?: string | null; order?: number }) => Promise<void>;
  moveDocFolder: (spaceId: string, folderId: string, parentId: string | null, targetSpaceId?: string) => Promise<void>;
  deleteDocFolder: (spaceId: string, folderId: string) => Promise<void>;
  createSpaceDoc: (
    spaceId: string,
    folderId: string | null,
    opts?: { id?: string; title?: string; content?: string; order?: number }
  ) => Promise<TaskDoc | null>;
  updateSpaceDoc: (docId: string, spaceId: string, patch: { title?: string; content?: string }) => void;
  moveSpaceDoc: (spaceId: string, docId: string, folderId: string | null, targetSpaceId?: string) => Promise<void>;
  reorderSpaceDoc: (spaceId: string, docId: string, order: number) => Promise<void>;
  deleteSpaceDoc: (docId: string, spaceId: string) => Promise<void>;
  // Attaches (taskId set) or detaches (taskId null) an existing doc to/from a task, without
  // touching its spaceId/folderId — the same doc can be task-scoped, Space/Folder-scoped, or both.
  setDocTaskLink: (docId: string, taskId: string | null) => Promise<void>;

  fetchComments: (taskId: string) => Promise<void>;
  addComment: (taskId: string, body: string, authorId?: string | null) => Promise<void>;
  deleteComment: (taskId: string, commentId: string) => Promise<void>;
  logActivity: (taskId: string, body: string, kind: string) => Promise<void>;

  fetchDocs: (taskId: string) => Promise<void>;
  createDoc: (taskId: string, opts?: { id?: string; title?: string; content?: string; order?: number }) => Promise<TaskDoc | null>;
  updateDoc: (docId: string, taskId: string, patch: { title?: string; content?: string }) => void;
  deleteDoc: (docId: string, taskId: string) => Promise<void>;
  reorderDocs: (taskId: string, orderedIds: string[]) => void;
}

export const useTaskStore = create<TaskStore>((set, get) => {
  // ---------------------------------------------------------------------------------------
  // Snapshot & restore helpers for cascading-delete undo (Task-with-subtasks, List, Folder,
  // Space). Snapshot walks bottom-up from live state (recursing into children); restore walks
  // the snapshot top-down, recreating every row via the SAME store actions used everywhere else
  // (each now accepting an optional explicit `id` so identity survives the round trip), so local
  // state stays correctly in sync without needing a full refetch for the common case — Folder/
  // Space restores still do one at the end as a safety net given how many chained async calls
  // are involved. Comments/Docs are restored via direct fetches (not through the store's
  // interactive `addComment`/`createDoc` optimistic-UI paths) since they aren't held in local
  // state until a task modal lazily fetches them — writing the server rows is all that's needed.
  const snapshotTask = async (task: Task): Promise<TaskSnapshot> => {
    const state = get();
    const comments =
      state.comments[task.id] ??
      (await fetch(`/api/tasks/${task.id}/comments`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []));
    const docs =
      state.docs[task.id] ??
      (await fetch(`/api/tasks/${task.id}/docs`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []));
    const subtasks = state.tasks.filter((t) => t.parentId === task.id);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      startDate: task.startDate ? new Date(task.startDate).toISOString() : null,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
      archived: task.archived,
      listId: task.listId,
      parentId: task.parentId,
      assigneeIds: task.assignees.map((a) => a.id),
      customFieldValues: task.customFieldValues,
      comments: (comments as TaskComment[]).map((c) => ({ id: c.id, body: c.body, type: c.type, activityKind: c.activityKind, authorId: c.authorId })),
      docs: (docs as TaskDoc[]).map((d) => ({ id: d.id, title: d.title, content: d.content, order: d.order })),
      subtasks: await Promise.all(subtasks.map(snapshotTask)),
    };
  };

  // Set for the duration of any restoreTask/restoreList/restoreFolderTree/restoreSpace call —
  // these reconstruct prior state by calling the same primitive actions (optimisticArchiveTask,
  // optimisticSetAssignees, ...) used for genuine interactive edits, but a restore already
  // replays the ORIGINAL activity comments verbatim from the snapshot, so those primitives must
  // skip generating a fresh (duplicate) activity-log entry while this is true. Undo/redo of a
  // plain field edit (not a snapshot restore) is NOT covered by this — those intentionally keep
  // logging symmetrically, since documenting "X was undone" is useful history, not noise.
  let isRestoringSnapshot = false;
  const runRestoring = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const prev = isRestoringSnapshot;
    isRestoringSnapshot = true;
    try {
      return await fn();
    } finally {
      isRestoringSnapshot = prev;
    }
  };

  const restoreTask = async (snap: TaskSnapshot) => {
    await get().optimisticCreateTask(snap.title, snap.listId, '', snap.parentId, snap.startDate, snap.dueDate, snap.id, snap.status);
    if (snap.archived) get().optimisticArchiveTask(snap.id, true);
    if (snap.assigneeIds.length > 0) get().optimisticSetAssignees(snap.id, snap.assigneeIds);
    const cfValues = JSON.parse(snap.customFieldValues || '{}');
    for (const [fieldId, value] of Object.entries(cfValues)) {
      get().optimisticSetCustomFieldValue(snap.id, fieldId, value as string);
    }
    for (const c of snap.comments) {
      await fetch(`/api/tasks/${snap.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, body: c.body, type: c.type, activityKind: c.activityKind, authorId: c.authorId }),
      });
    }
    for (const d of snap.docs) {
      await fetch(`/api/tasks/${snap.id}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, title: d.title, content: d.content, order: d.order }),
      });
    }
    for (const sub of snap.subtasks) await restoreTask(sub);
  };

  const snapshotList = async (list: HierarchyList): Promise<ListSnapshot> => {
    const tasks = get().tasks.filter((t) => t.listId === list.id && t.parentId === null);
    return { ...list, tasks: await Promise.all(tasks.map(snapshotTask)) };
  };

  const restoreList = async (spaceId: string, snap: ListSnapshot) => {
    await get().createList(spaceId, snap.name, snap.folderId, snap.id);
    await get().updateList(spaceId, snap.id, { color: snap.color, icon: snap.icon });
    if (snap.order !== 0) await get().reorderList(spaceId, snap.id, snap.order);
    for (const t of snap.tasks) await restoreTask(t);
  };

  const snapshotFolderTree = async (space: HierarchySpace, folderId: string): Promise<FolderSnapshot> => {
    const folder = space.folders.find((f) => f.id === folderId)!;
    const childFolders = space.folders.filter((f) => f.parentId === folderId);
    const lists = space.lists.filter((l) => l.folderId === folderId);
    return {
      ...folder,
      children: await Promise.all(childFolders.map((f) => snapshotFolderTree(space, f.id))),
      lists: await Promise.all(lists.map(snapshotList)),
    };
  };

  const restoreFolderTree = async (spaceId: string, snap: FolderSnapshot) => {
    await get().createFolder(spaceId, snap.name, snap.parentId, snap.id);
    await get().updateFolder(spaceId, snap.id, { color: snap.color, icon: snap.icon, order: snap.order });
    for (const l of snap.lists) await restoreList(spaceId, l);
    for (const c of snap.children) await restoreFolderTree(spaceId, c);
  };

  const snapshotSpaceDoc = (doc: TaskDoc): SpaceDocSnapshot => ({ id: doc.id, title: doc.title, content: doc.content, order: doc.order });

  const restoreSpaceDoc = async (spaceId: string, folderId: string | null, snap: SpaceDocSnapshot) => {
    await get().createSpaceDoc(spaceId, folderId, { id: snap.id, title: snap.title, content: snap.content, order: snap.order });
  };

  const snapshotDocFolderTree = async (space: HierarchySpace, folderId: string): Promise<DocFolderSnapshot> => {
    const folder = space.docFolders.find((f) => f.id === folderId)!;
    const childFolders = space.docFolders.filter((f) => f.parentId === folderId);
    const docs = space.spaceDocs.filter((d) => d.folderId === folderId);
    return {
      ...folder,
      children: await Promise.all(childFolders.map((f) => snapshotDocFolderTree(space, f.id))),
      docs: docs.map(snapshotSpaceDoc),
    };
  };

  const restoreDocFolderTree = async (spaceId: string, snap: DocFolderSnapshot) => {
    await get().createDocFolder(spaceId, snap.name, snap.parentId, snap.id);
    await get().updateDocFolder(spaceId, snap.id, { color: snap.color, icon: snap.icon });
    for (const d of snap.docs) await restoreSpaceDoc(spaceId, snap.id, d);
    for (const c of snap.children) await restoreDocFolderTree(spaceId, c);
  };

  const snapshotSpace = async (space: HierarchySpace): Promise<SpaceSnapshot> => {
    const rootFolders = space.folders.filter((f) => f.parentId === null);
    const rootLists = space.lists.filter((l) => l.folderId === null);
    const rootDocFolders = space.docFolders.filter((f) => f.parentId === null);
    const rootSpaceDocs = space.spaceDocs.filter((d) => d.folderId === null);
    return {
      id: space.id,
      name: space.name,
      color: space.color,
      order: space.order,
      description: space.description,
      coverImageUrl: space.coverImageUrl,
      statuses: space.statuses,
      customFields: space.customFields,
      rootFolders: await Promise.all(rootFolders.map((f) => snapshotFolderTree(space, f.id))),
      rootLists: await Promise.all(rootLists.map(snapshotList)),
      rootDocFolders: await Promise.all(rootDocFolders.map((f) => snapshotDocFolderTree(space, f.id))),
      rootSpaceDocs: rootSpaceDocs.map(snapshotSpaceDoc),
    };
  };

  const restoreSpace = async (workspaceId: string, snap: SpaceSnapshot) => {
    await get().createSpace(workspaceId, snap.name, snap.id);
    await get().updateSpace(snap.id, { color: snap.color, description: snap.description, coverImageUrl: snap.coverImageUrl });
    if (snap.order !== 0) await get().reorderSpace(snap.id, snap.order);
    for (const st of snap.statuses) {
      await get().createStatus(snap.id, st.name, st.color, st.id);
      await get().updateStatus(snap.id, st.id, { order: st.order });
    }
    for (const cf of snap.customFields) await get().createCustomField(snap.id, cf.name, cf.type, cf.options, cf.id);
    for (const l of snap.rootLists) await restoreList(snap.id, l);
    for (const f of snap.rootFolders) await restoreFolderTree(snap.id, f);
    for (const d of snap.rootSpaceDocs) await restoreSpaceDoc(snap.id, null, d);
    for (const f of snap.rootDocFolders) await restoreDocFolderTree(snap.id, f);
    await get().refetchWorkspaces();
    await get().refetchTasks();
  };

  return {
    tasks: [],
    users: [],
    workspaces: [],
    comments: {},
    docs: {},
    activeView: 'board',
    activeSpaceId: 'everything',
    activeListIds: new Set(),
    calendarGranularity: 'month',
    calendarFocusDate: startOfDay(new Date()),
    activeDocFolderId: null,
    activeStandaloneDocId: null,
    activeOfficeUserId: null,
    isLoading: true,
    showArchived: false,

    fetchInitialData: async () => {
      set({ isLoading: true });
      try {
        const [workspacesRes, tasksRes, usersRes] = await Promise.all([
          fetch('/api/workspaces'),
          fetch('/api/tasks'),
          fetch('/api/users'),
        ]);
        const workspaces = await workspacesRes.json();
        const tasks = await tasksRes.json();
        const users = await usersRes.json();

        const firstSpaceId = workspaces[0]?.spaces[0]?.id || 'everything';

        set({
          workspaces,
          tasks,
          users,
          activeSpaceId: firstSpaceId,
          isLoading: false,
        });
      } catch (error) {
        console.error('Error fetching data:', error);
        set({ isLoading: false });
      }
    },

    // Lighter than fetchInitialData: re-syncs just the Space/Folder/List tree, without touching
    // tasks, users, or navigation state. Used after a cross-Space folder/list move, where the
    // moved subtree's spaceId changes for a potentially-nested set of rows server-side — patching
    // that shape correctly across two different Space objects in local state isn't worth the
    // complexity next to a plain refetch. Also used as a post-restore safety net after undoing a
    // large cascading delete (Folder/Space).
    refetchWorkspaces: async () => {
      try {
        const res = await fetch('/api/workspaces');
        const workspaces = await res.json();
        set({ workspaces });
      } catch (error) {
        console.error('Error refetching workspaces:', error);
      }
    },

    // Same idea as refetchWorkspaces but for the flat `tasks` array — used after restoring a
    // deleted List/Folder/Space's tasks, as a safety net on top of the individual restore calls.
    refetchTasks: async () => {
      try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        set({ tasks });
      } catch (error) {
        console.error('Error refetching tasks:', error);
      }
    },

    setActiveView: (activeView) => set({ activeView }),

    setNavigation: (spaceId, listIds = []) =>
      set({
        activeSpaceId: spaceId,
        activeListIds: new Set(listIds),
      }),

    setCalendarGranularity: (calendarGranularity) => set({ calendarGranularity }),

    setCalendarFocusDate: (calendarFocusDate) => set({ calendarFocusDate }),

    setDocsNavigation: (activeDocFolderId, activeStandaloneDocId) => set({ activeDocFolderId, activeStandaloneDocId }),

    setActiveOfficeUserId: (activeOfficeUserId) => set({ activeOfficeUserId }),

    setShowArchived: (showArchived) => set({ showArchived }),

    optimisticMoveTask: (taskId, newStatus) => {
      const oldStatus = get().tasks.find((t) => t.id === taskId)?.status;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, authorId: useSessionStore.getState().currentUserId }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
      });
      if (oldStatus !== undefined && oldStatus !== newStatus) {
        useHistoryStore.getState().push({
          label: 'Change status',
          undo: () => get().optimisticMoveTask(taskId, oldStatus),
          redo: () => get().optimisticMoveTask(taskId, newStatus),
        });
      }
    },

    optimisticCreateTask: async (title, listId, spaceId, parentId = null, startDate = null, dueDate = null, explicitId, explicitStatus) => {
      const tempId = explicitId ?? `temp-${Date.now()}`;
      const space = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId);
      const defaultStatus = explicitStatus ?? space?.statuses?.[0]?.name ?? 'To Do';

      const tempTask: any = {
        id: tempId,
        _localId: tempId,
        title,
        status: defaultStatus,
        priority: 3,
        listId,
        parentId,
        assignees: [],
        customFieldValues: '{}',
        archived: false,
        archivedAt: null,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      set((state) => ({ tasks: [...state.tasks, tempTask] }));

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(explicitId ? { id: explicitId } : {}),
            title,
            listId,
            parentId,
            status: defaultStatus,
            startDate,
            dueDate,
            authorId: useSessionStore.getState().currentUserId,
          }),
        });
        const savedTask = await res.json();

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === tempId ? { ...savedTask, assignees: savedTask.assignees || [], _localId: tempId } : t
          ),
        }));

        // A fresh subtask create also logs on its immediate parent server-side — refresh the
        // parent's comments if they're already loaded (its modal open) so that shows up live.
        if (!explicitId && parentId && get().comments[parentId]) get().fetchComments(parentId);

        useHistoryStore.getState().push({
          label: `Create task "${title}"`,
          undo: () => get().optimisticDeleteTask(savedTask.id),
          redo: () => get().optimisticCreateTask(title, listId, spaceId, parentId, startDate, dueDate, savedTask.id, defaultStatus),
        });
      } catch (error) {
        console.error('Failed to save task:', error);
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== tempId) }));
      }
    },

    optimisticDeleteTask: async (taskId) => {
      const task = get().tasks.find((t) => t.id === taskId);
      const snap = task ? await snapshotTask(task) : null;
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }));
      // Awaited (and the history push deferred until after) so undo can't fire before the row is
      // actually gone server-side — pushing first race against the DELETE and a fast Ctrl+Z could
      // try to recreate a row with an id that (from the server's perspective) still exists.
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (task && snap) {
        useHistoryStore.getState().push({
          label: `Delete task "${task.title}"`,
          undo: () => runRestoring(() => restoreTask(snap)),
          redo: () => get().optimisticDeleteTask(taskId),
        });
      }
    },

    optimisticArchiveTask: (taskId, archived) => {
      const wasArchived = get().tasks.find((t) => t.id === taskId)?.archived;
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, archived, archivedAt: archived ? new Date() : null } : t
        ),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archived,
          authorId: useSessionStore.getState().currentUserId,
          ...(isRestoringSnapshot ? { skipActivityLog: true } : {}),
        }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
      });
      if (wasArchived !== undefined && wasArchived !== archived) {
        useHistoryStore.getState().push({
          label: archived ? 'Archive task' : 'Unarchive task',
          undo: () => get().optimisticArchiveTask(taskId, wasArchived),
          redo: () => get().optimisticArchiveTask(taskId, archived),
        });
      }
    },

    optimisticSetAssignees: (taskId, userIds) => {
      const oldIds = get().tasks.find((t) => t.id === taskId)?.assignees.map((a) => a.id) ?? [];
      const allUsers = get().users;
      const assignees = allUsers.filter((u) => userIds.includes(u.id));
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, assignees } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigneeIds: userIds,
          authorId: useSessionStore.getState().currentUserId,
          ...(isRestoringSnapshot ? { skipActivityLog: true } : {}),
        }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
      });
      useHistoryStore.getState().push({
        label: 'Change assignees',
        undo: () => get().optimisticSetAssignees(taskId, oldIds),
        redo: () => get().optimisticSetAssignees(taskId, userIds),
      });
    },

    optimisticSetCustomFieldValue: (taskId, fieldId, value) => {
      const task = get().tasks.find((t) => t.id === taskId);
      const oldValues = JSON.parse(task?.customFieldValues || '{}');
      const oldValue = oldValues[fieldId] ?? '';
      set((state) => ({
        tasks: state.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const current = JSON.parse(t.customFieldValues || '{}');
          current[fieldId] = value;
          return { ...t, customFieldValues: JSON.stringify(current) };
        }),
      }));
      const updated = get().tasks.find((t) => t.id === taskId);
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFieldValues: updated?.customFieldValues }),
      });
      if (oldValue !== value) {
        useHistoryStore.getState().push({
          label: 'Change field value',
          undo: () => get().optimisticSetCustomFieldValue(taskId, fieldId, oldValue),
          redo: () => get().optimisticSetCustomFieldValue(taskId, fieldId, value),
        });
      }
    },

    optimisticSetDates: (taskId, startDate, dueDate) => {
      const prev = get().tasks.find((t) => t.id === taskId);
      const oldStart = prev?.startDate ? new Date(prev.startDate).toISOString() : null;
      const oldDue = prev?.dueDate ? new Date(prev.dueDate).toISOString() : null;
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, startDate: startDate ? new Date(startDate) : null, dueDate: dueDate ? new Date(dueDate) : null }
            : t
        ),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, dueDate }),
      });
      useHistoryStore.getState().push({
        label: 'Change dates',
        undo: () => get().optimisticSetDates(taskId, oldStart, oldDue),
        redo: () => get().optimisticSetDates(taskId, startDate, dueDate),
      });
    },

    optimisticSetList: (taskId, listId) => {
      const oldListId = get().tasks.find((t) => t.id === taskId)?.listId;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, listId } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId, authorId: useSessionStore.getState().currentUserId }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
      });
      if (oldListId && oldListId !== listId) {
        useHistoryStore.getState().push({
          label: 'Move task',
          undo: () => get().optimisticSetList(taskId, oldListId),
          redo: () => get().optimisticSetList(taskId, listId),
        });
      }
    },

    optimisticSetTitle: (taskId, title) => {
      const oldTitle = get().tasks.find((t) => t.id === taskId)?.title;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, title } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, authorId: useSessionStore.getState().currentUserId }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
      });
      if (oldTitle !== undefined && oldTitle !== title) {
        useHistoryStore.getState().push({
          label: 'Rename task',
          undo: () => get().optimisticSetTitle(taskId, oldTitle),
          redo: () => get().optimisticSetTitle(taskId, title),
        });
      }
    },

    optimisticSetParent: (taskId, parentId) => {
      const oldParentId = get().tasks.find((t) => t.id === taskId)?.parentId ?? null;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, parentId } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, authorId: useSessionStore.getState().currentUserId }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
        // The server also logs "subtask added/removed" on whichever parent(s) this affected —
        // refresh those too if their comments are already loaded (their modal open).
        if (parentId && get().comments[parentId]) get().fetchComments(parentId);
        if (oldParentId && get().comments[oldParentId]) get().fetchComments(oldParentId);
      });
      if (oldParentId !== parentId) {
        useHistoryStore.getState().push({
          label: 'Change parent',
          undo: () => get().optimisticSetParent(taskId, oldParentId),
          redo: () => get().optimisticSetParent(taskId, parentId),
        });
      }
    },

    createStatus: async (spaceId, name, color, id) => {
      const res = await fetch('/api/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, spaceId, name, color }),
      });
      const newStatus = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, statuses: [...s.statuses, newStatus] } : s)),
        })),
      }));
      useHistoryStore.getState().push({
        label: `Create status "${name}"`,
        undo: () => get().deleteStatus(spaceId, newStatus.id),
        redo: () => get().createStatus(spaceId, name, color, newStatus.id),
      });
    },

    updateStatus: async (spaceId, statusId, patch) => {
      const oldStatus = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.statuses.find((s) => s.id === statusId);

      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId
              ? { ...s, statuses: s.statuses.map((st) => (st.id === statusId ? { ...st, ...patch } : st)) }
              : s
          ),
        })),
        tasks:
          patch.name !== undefined && oldStatus && patch.name !== oldStatus.name
            ? state.tasks.map((t) => (t.status === oldStatus.name ? { ...t, status: patch.name! } : t))
            : state.tasks,
      }));

      await fetch(`/api/statuses/${statusId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (oldStatus) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldStatus.name;
        if (patch.color !== undefined) oldPatch.color = oldStatus.color;
        if (patch.order !== undefined) oldPatch.order = oldStatus.order;
        useHistoryStore.getState().push({
          label: 'Update status',
          undo: () => get().updateStatus(spaceId, statusId, oldPatch),
          redo: () => get().updateStatus(spaceId, statusId, patch),
        });
      }
    },

    deleteStatus: async (spaceId, statusId) => {
      const status = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.statuses.find((s) => s.id === statusId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, statuses: s.statuses.filter((st) => st.id !== statusId) } : s)),
        })),
      }));
      await fetch(`/api/statuses/${statusId}`, { method: 'DELETE' });
      if (status) {
        useHistoryStore.getState().push({
          label: `Delete status "${status.name}"`,
          undo: async () => {
            await get().createStatus(spaceId, status.name, status.color, status.id);
            await get().updateStatus(spaceId, status.id, { order: status.order });
          },
          redo: () => get().deleteStatus(spaceId, statusId),
        });
      }
    },

    createCustomField: async (spaceId, name, type, options = [], id) => {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, spaceId, name, type, options }),
      });
      const newField = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, customFields: [...s.customFields, newField] } : s)),
        })),
      }));
      useHistoryStore.getState().push({
        label: `Create field "${name}"`,
        undo: () => get().deleteCustomField(spaceId, newField.id),
        redo: () => get().createCustomField(spaceId, name, type, options, newField.id),
      });
    },

    updateCustomField: async (spaceId, fieldId, patch) => {
      const oldField = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.customFields.find((f) => f.id === fieldId);

      const renamedPairs: { from: string; to: string }[] = [];
      if (patch.options && oldField) {
        for (const newOpt of patch.options) {
          if (!newOpt.id) continue;
          const oldOpt = oldField.options.find((o) => o.id === newOpt.id);
          if (oldOpt && oldOpt.label !== newOpt.label) renamedPairs.push({ from: oldOpt.label, to: newOpt.label });
        }
      }

      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId
              ? { ...s, customFields: s.customFields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
              : s
          ),
        })),
        tasks:
          renamedPairs.length > 0
            ? state.tasks.map((t) => {
                const values = JSON.parse(t.customFieldValues || '{}');
                const match = renamedPairs.find((p) => p.from === values[fieldId]);
                if (!match) return t;
                values[fieldId] = match.to;
                return { ...t, customFieldValues: JSON.stringify(values) };
              })
            : state.tasks,
      }));

      await fetch(`/api/custom-fields/${fieldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (oldField) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldField.name;
        if (patch.options !== undefined) oldPatch.options = oldField.options;
        useHistoryStore.getState().push({
          label: 'Update field',
          undo: () => get().updateCustomField(spaceId, fieldId, oldPatch),
          redo: () => get().updateCustomField(spaceId, fieldId, patch),
        });
      }
    },

    deleteCustomField: async (spaceId, fieldId) => {
      const field = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.customFields.find((f) => f.id === fieldId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, customFields: s.customFields.filter((f) => f.id !== fieldId) } : s
          ),
        })),
      }));
      await fetch(`/api/custom-fields/${fieldId}`, { method: 'DELETE' });
      if (field) {
        useHistoryStore.getState().push({
          label: `Delete field "${field.name}"`,
          undo: () => get().createCustomField(spaceId, field.name, field.type, field.options, field.id),
          redo: () => get().deleteCustomField(spaceId, fieldId),
        });
      }
    },

    addUser: async (name, initials, color, id) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, initials, color }),
      });
      const newUser = await res.json();
      set((state) => ({ users: [...state.users, newUser] }));
      useHistoryStore.getState().push({
        label: `Add user "${name}"`,
        undo: () => get().deleteUser(newUser.id),
        redo: () => get().addUser(name, initials, color, newUser.id),
      });
    },

    updateUser: async (userId, patch) => {
      const oldUser = get().users.find((u) => u.id === userId);
      set((state) => ({ users: state.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)) }));
      await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldUser) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldUser.name;
        if (patch.initials !== undefined) oldPatch.initials = oldUser.initials;
        if (patch.color !== undefined) oldPatch.color = oldUser.color;
        if (patch.phone !== undefined) oldPatch.phone = oldUser.phone;
        if (patch.title !== undefined) oldPatch.title = oldUser.title;
        if (patch.status !== undefined) oldPatch.status = oldUser.status;
        if (patch.roomId !== undefined) oldPatch.roomId = oldUser.roomId;
        useHistoryStore.getState().push({
          label: 'Update team member',
          undo: () => get().updateUser(userId, oldPatch),
          redo: () => get().updateUser(userId, patch),
        });
      }
    },

    deleteUser: async (userId) => {
      const user = get().users.find((u) => u.id === userId);
      const affectedTaskIds = get()
        .tasks.filter((t) => t.assignees.some((a) => a.id === userId))
        .map((t) => t.id);
      set((state) => ({
        users: state.users.filter((u) => u.id !== userId),
        tasks: state.tasks.map((t) => ({ ...t, assignees: t.assignees.filter((a) => a.id !== userId) })),
      }));
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (user) {
        useHistoryStore.getState().push({
          label: `Delete user "${user.name}"`,
          undo: async () => {
            await get().addUser(user.name, user.initials, user.color, user.id);
            for (const taskId of affectedTaskIds) {
              const task = get().tasks.find((t) => t.id === taskId);
              if (task) get().optimisticSetAssignees(taskId, [...task.assignees.map((a) => a.id), userId]);
            }
          },
          redo: () => get().deleteUser(userId),
        });
      }
    },

    createRoom: async (workspaceId, name, id) => {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId, name }),
      });
      const newRoom = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, rooms: [...ws.rooms, newRoom] } : ws)),
      }));
      useHistoryStore.getState().push({
        label: `Create room "${name}"`,
        undo: () => get().deleteRoom(newRoom.id),
        redo: () => get().createRoom(workspaceId, name, newRoom.id),
      });
    },

    updateRoom: async (roomId, patch) => {
      const oldRoom = get()
        .workspaces.flatMap((w) => w.rooms)
        .find((r) => r.id === roomId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          rooms: ws.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
        })),
      }));
      await fetch(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldRoom) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldRoom.name;
        if (patch.icon !== undefined) oldPatch.icon = oldRoom.icon;
        if (patch.color !== undefined) oldPatch.color = oldRoom.color;
        useHistoryStore.getState().push({
          label: 'Update room',
          undo: () => get().updateRoom(roomId, oldPatch),
          redo: () => get().updateRoom(roomId, patch),
        });
      }
    },

    // Room.members has onDelete: SetNull, so the actual delete un-assigns rather than deletes
    // people — undo needs to remember who was in it and put them back, same shape as the
    // cascading-delete snapshot/restore pattern elsewhere, just flat (rooms don't nest).
    deleteRoom: async (roomId) => {
      const workspace = get().workspaces.find((w) => w.rooms.some((r) => r.id === roomId));
      const room = workspace?.rooms.find((r) => r.id === roomId);
      const memberIds = get()
        .users.filter((u) => u.roomId === roomId)
        .map((u) => u.id);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({ ...ws, rooms: ws.rooms.filter((r) => r.id !== roomId) })),
        users: state.users.map((u) => (u.roomId === roomId ? { ...u, roomId: null } : u)),
      }));
      await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
      if (room && workspace) {
        useHistoryStore.getState().push({
          label: `Delete room "${room.name}"`,
          undo: async () => {
            await get().createRoom(workspace.id, room.name, room.id);
            await get().updateRoom(room.id, { icon: room.icon, color: room.color });
            for (const uid of memberIds) await get().assignUserToRoom(uid, room.id);
          },
          redo: () => get().deleteRoom(roomId),
        });
      }
    },

    assignUserToRoom: async (userId, roomId) => {
      const oldRoomId = get().users.find((u) => u.id === userId)?.roomId ?? null;
      set((state) => ({ users: state.users.map((u) => (u.id === userId ? { ...u, roomId } : u)) }));
      await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (oldRoomId !== roomId) {
        useHistoryStore.getState().push({
          label: 'Move team member',
          undo: () => get().assignUserToRoom(userId, oldRoomId),
          redo: () => get().assignUserToRoom(userId, roomId),
        });
      }
    },

    updateWorkspaceMessage: async (workspaceId, message) => {
      const oldMessage = get().workspaces.find((w) => w.id === workspaceId)?.messageOfTheDay ?? null;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, messageOfTheDay: message } : ws)),
      }));
      await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageOfTheDay: message }),
      });
      if (oldMessage !== message) {
        useHistoryStore.getState().push({
          label: 'Update message of the day',
          undo: () => get().updateWorkspaceMessage(workspaceId, oldMessage),
          redo: () => get().updateWorkspaceMessage(workspaceId, message),
        });
      }
    },

    updateSpace: async (spaceId, patch) => {
      const oldSpace = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId);

      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, ...patch } : s)),
        })),
      }));
      await fetch(`/api/spaces/${spaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (oldSpace) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldSpace.name;
        if (patch.color !== undefined) oldPatch.color = oldSpace.color;
        if (patch.description !== undefined) oldPatch.description = oldSpace.description;
        if (patch.coverImageUrl !== undefined) oldPatch.coverImageUrl = oldSpace.coverImageUrl;
        useHistoryStore.getState().push({
          label: 'Update space',
          undo: () => get().updateSpace(spaceId, oldPatch),
          redo: () => get().updateSpace(spaceId, patch),
        });
      }
    },

    reorderSpace: async (spaceId, order) => {
      const oldOrder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)?.order;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, order } : s)),
        })),
      }));
      await fetch(`/api/spaces/${spaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (oldOrder !== undefined && oldOrder !== order) {
        useHistoryStore.getState().push({
          label: 'Reorder space',
          undo: () => get().reorderSpace(spaceId, oldOrder),
          redo: () => get().reorderSpace(spaceId, order),
        });
      }
    },

    createSpace: async (workspaceId, name, id) => {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId, name }),
      });
      const newSpace = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, spaces: [...ws.spaces, newSpace] } : ws)),
      }));
      useHistoryStore.getState().push({
        label: `Create space "${name}"`,
        undo: () => get().deleteSpace(newSpace.id),
        redo: () => get().createSpace(workspaceId, name, newSpace.id),
      });
    },

    deleteSpace: async (spaceId) => {
      const workspace = get().workspaces.find((w) => w.spaces.some((s) => s.id === spaceId));
      const space = workspace?.spaces.find((s) => s.id === spaceId);
      const snap = workspace && space ? await snapshotSpace(space) : null;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.filter((s) => s.id !== spaceId),
        })),
      }));
      // See optimisticDeleteTask's comment: push only after the delete has actually committed
      // server-side, so undo can't race a not-yet-completed delete into a unique-constraint error
      // when it tries to recreate a row with the same id.
      await fetch(`/api/spaces/${spaceId}`, { method: 'DELETE' });
      if (workspace && space && snap) {
        useHistoryStore.getState().push({
          label: `Delete space "${space.name}"`,
          undo: () => runRestoring(() => restoreSpace(workspace.id, snap)),
          redo: () => get().deleteSpace(spaceId),
        });
      }
    },

    createList: async (spaceId, name, folderId = null, id) => {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, spaceId, name, folderId }),
      });
      const newList = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, lists: [...s.lists, newList] } : s)),
        })),
      }));
      useHistoryStore.getState().push({
        label: `Create list "${name}"`,
        undo: () => get().deleteList(spaceId, newList.id),
        redo: () => get().createList(spaceId, name, folderId, newList.id),
      });
    },

    renameList: async (spaceId, listId, name) => {
      const oldName = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.lists.find((l) => l.id === listId)?.name;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, name } : l)) } : s
          ),
        })),
      }));
      await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (oldName !== undefined && oldName !== name) {
        useHistoryStore.getState().push({
          label: 'Rename list',
          undo: () => get().renameList(spaceId, listId, oldName),
          redo: () => get().renameList(spaceId, listId, name),
        });
      }
    },

    updateList: async (spaceId, listId, patch) => {
      const oldList = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.lists.find((l) => l.id === listId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, ...patch } : l)) } : s
          ),
        })),
      }));
      await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldList) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldList.name;
        if (patch.color !== undefined) oldPatch.color = oldList.color;
        if (patch.icon !== undefined) oldPatch.icon = oldList.icon;
        useHistoryStore.getState().push({
          label: 'Update list',
          undo: () => get().updateList(spaceId, listId, oldPatch),
          redo: () => get().updateList(spaceId, listId, patch),
        });
      }
    },

    moveList: async (spaceId, listId, folderId, targetSpaceId) => {
      const oldList = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.lists.find((l) => l.id === listId);
      const oldFolderId = oldList?.folderId ?? null;

      if (targetSpaceId && targetSpaceId !== spaceId) {
        await fetch(`/api/lists/${listId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId, spaceId: targetSpaceId }),
        });
        await get().refetchWorkspaces();
      } else {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            spaces: ws.spaces.map((s) =>
              s.id === spaceId ? { ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, folderId } : l)) } : s
            ),
          })),
        }));
        await fetch(`/api/lists/${listId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId }),
        });
      }

      useHistoryStore.getState().push({
        label: 'Move list',
        undo: () => get().moveList(targetSpaceId ?? spaceId, listId, oldFolderId, spaceId),
        redo: () => get().moveList(spaceId, listId, folderId, targetSpaceId),
      });
    },

    reorderList: async (spaceId, listId, order) => {
      const oldOrder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.lists.find((l) => l.id === listId)?.order;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, order } : l)) } : s
          ),
        })),
      }));
      await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (oldOrder !== undefined && oldOrder !== order) {
        useHistoryStore.getState().push({
          label: 'Reorder list',
          undo: () => get().reorderList(spaceId, listId, oldOrder),
          redo: () => get().reorderList(spaceId, listId, order),
        });
      }
    },

    deleteList: async (spaceId, listId) => {
      const list = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.lists.find((l) => l.id === listId);
      const snap = list ? await snapshotList(list) : null;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, lists: s.lists.filter((l) => l.id !== listId) } : s)),
        })),
      }));
      // See optimisticDeleteTask's comment: push only after the delete has actually committed.
      await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
      if (list && snap) {
        useHistoryStore.getState().push({
          label: `Delete list "${list.name}"`,
          undo: () =>
            runRestoring(async () => {
              await restoreList(spaceId, snap);
              await get().refetchTasks();
            }),
          redo: () => get().deleteList(spaceId, listId),
        });
      }
    },

    createFolder: async (spaceId, name, parentId = null, id) => {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, spaceId, name, parentId }),
      });
      const newFolder = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, folders: [...s.folders, newFolder] } : s)),
        })),
      }));
      useHistoryStore.getState().push({
        label: `Create folder "${name}"`,
        undo: () => get().deleteFolder(spaceId, newFolder.id),
        redo: () => get().createFolder(spaceId, name, parentId, newFolder.id),
      });
    },

    renameFolder: async (spaceId, folderId, name) => {
      const oldName = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.folders.find((f) => f.id === folderId)?.name;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, folders: s.folders.map((f) => (f.id === folderId ? { ...f, name } : f)) } : s
          ),
        })),
      }));
      await fetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (oldName !== undefined && oldName !== name) {
        useHistoryStore.getState().push({
          label: 'Rename folder',
          undo: () => get().renameFolder(spaceId, folderId, oldName),
          redo: () => get().renameFolder(spaceId, folderId, name),
        });
      }
    },

    updateFolder: async (spaceId, folderId, patch) => {
      const oldFolder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.folders.find((f) => f.id === folderId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, folders: s.folders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)) } : s
          ),
        })),
      }));
      await fetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldFolder) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldFolder.name;
        if (patch.color !== undefined) oldPatch.color = oldFolder.color;
        if (patch.icon !== undefined) oldPatch.icon = oldFolder.icon;
        if (patch.order !== undefined) oldPatch.order = oldFolder.order;
        useHistoryStore.getState().push({
          label: 'Update folder',
          undo: () => get().updateFolder(spaceId, folderId, oldPatch),
          redo: () => get().updateFolder(spaceId, folderId, patch),
        });
      }
    },

    moveFolder: async (spaceId, folderId, parentId, targetSpaceId) => {
      const oldFolder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.folders.find((f) => f.id === folderId);
      const oldParentId = oldFolder?.parentId ?? null;

      if (targetSpaceId && targetSpaceId !== spaceId) {
        await fetch(`/api/folders/${folderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId, spaceId: targetSpaceId }),
        });
        await get().refetchWorkspaces();
      } else {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            spaces: ws.spaces.map((s) =>
              s.id === spaceId ? { ...s, folders: s.folders.map((f) => (f.id === folderId ? { ...f, parentId } : f)) } : s
            ),
          })),
        }));
        await fetch(`/api/folders/${folderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId }),
        });
      }

      useHistoryStore.getState().push({
        label: 'Move folder',
        undo: () => get().moveFolder(targetSpaceId ?? spaceId, folderId, oldParentId, spaceId),
        redo: () => get().moveFolder(spaceId, folderId, parentId, targetSpaceId),
      });
    },

    deleteFolder: async (spaceId, folderId) => {
      const space = get().workspaces.flatMap((w) => w.spaces).find((s) => s.id === spaceId);
      const snap = space && space.folders.some((f) => f.id === folderId) ? await snapshotFolderTree(space, folderId) : null;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => {
            if (s.id !== spaceId) return s;
            const removedFolderIds = new Set([folderId, ...collectFolderIdsUnder(s, folderId)]);
            return {
              ...s,
              folders: s.folders.filter((f) => !removedFolderIds.has(f.id)),
              lists: s.lists.filter((l) => !l.folderId || !removedFolderIds.has(l.folderId)),
            };
          }),
        })),
      }));
      // See optimisticDeleteTask's comment: push only after the delete has actually committed.
      await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      if (snap) {
        useHistoryStore.getState().push({
          label: `Delete folder "${snap.name}"`,
          undo: () =>
            runRestoring(async () => {
              await restoreFolderTree(spaceId, snap);
              await get().refetchTasks();
            }),
          redo: () => get().deleteFolder(spaceId, folderId),
        });
      }
    },

    createDocFolder: async (spaceId, name, parentId = null, id) => {
      const res = await fetch('/api/doc-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, spaceId, name, parentId }),
      });
      const newFolder = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, docFolders: [...s.docFolders, newFolder] } : s)),
        })),
      }));
      useHistoryStore.getState().push({
        label: `Create doc folder "${name}"`,
        undo: () => get().deleteDocFolder(spaceId, newFolder.id),
        redo: () => get().createDocFolder(spaceId, name, parentId, newFolder.id),
      });
    },

    updateDocFolder: async (spaceId, folderId, patch) => {
      const oldFolder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.docFolders.find((f) => f.id === folderId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, docFolders: s.docFolders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)) } : s
          ),
        })),
      }));
      await fetch(`/api/doc-folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldFolder) {
        const oldPatch: typeof patch = {};
        if (patch.name !== undefined) oldPatch.name = oldFolder.name;
        if (patch.color !== undefined) oldPatch.color = oldFolder.color;
        if (patch.icon !== undefined) oldPatch.icon = oldFolder.icon;
        if (patch.order !== undefined) oldPatch.order = oldFolder.order;
        useHistoryStore.getState().push({
          label: 'Update doc folder',
          undo: () => get().updateDocFolder(spaceId, folderId, oldPatch),
          redo: () => get().updateDocFolder(spaceId, folderId, patch),
        });
      }
    },

    moveDocFolder: async (spaceId, folderId, parentId, targetSpaceId) => {
      const oldFolder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.docFolders.find((f) => f.id === folderId);
      const oldParentId = oldFolder?.parentId ?? null;

      if (targetSpaceId && targetSpaceId !== spaceId) {
        await fetch(`/api/doc-folders/${folderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId, spaceId: targetSpaceId }),
        });
        await get().refetchWorkspaces();
      } else {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            spaces: ws.spaces.map((s) =>
              s.id === spaceId ? { ...s, docFolders: s.docFolders.map((f) => (f.id === folderId ? { ...f, parentId } : f)) } : s
            ),
          })),
        }));
        await fetch(`/api/doc-folders/${folderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId }),
        });
      }

      useHistoryStore.getState().push({
        label: 'Move doc folder',
        undo: () => get().moveDocFolder(targetSpaceId ?? spaceId, folderId, oldParentId, spaceId),
        redo: () => get().moveDocFolder(spaceId, folderId, parentId, targetSpaceId),
      });
    },

    deleteDocFolder: async (spaceId, folderId) => {
      const space = get().workspaces.flatMap((w) => w.spaces).find((s) => s.id === spaceId);
      const snap = space && space.docFolders.some((f) => f.id === folderId) ? await snapshotDocFolderTree(space, folderId) : null;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => {
            if (s.id !== spaceId) return s;
            const removedFolderIds = new Set([folderId, ...collectDocFolderIdsUnder(s, folderId)]);
            return {
              ...s,
              docFolders: s.docFolders.filter((f) => !removedFolderIds.has(f.id)),
              spaceDocs: s.spaceDocs.filter((d) => !d.folderId || !removedFolderIds.has(d.folderId)),
            };
          }),
        })),
      }));
      await fetch(`/api/doc-folders/${folderId}`, { method: 'DELETE' });
      if (snap) {
        useHistoryStore.getState().push({
          label: `Delete doc folder "${snap.name}"`,
          undo: () => runRestoring(() => restoreDocFolderTree(spaceId, snap)),
          redo: () => get().deleteDocFolder(spaceId, folderId),
        });
      }
    },

    createSpaceDoc: async (spaceId, folderId, opts) => {
      try {
        const res = await fetch(`/api/spaces/${spaceId}/docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: opts?.id,
            folderId,
            title: opts?.title ?? 'Untitled',
            content: opts?.content ?? '',
            order: opts?.order,
          }),
        });
        if (!res.ok) return null;
        const doc = await res.json();
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, spaceDocs: [...s.spaceDocs, doc] } : s)),
          })),
        }));
        if (!opts?.id) {
          useHistoryStore.getState().push({
            label: 'Create document',
            undo: () => get().deleteSpaceDoc(doc.id, spaceId),
            redo: async () => {
              await get().createSpaceDoc(spaceId, folderId, { id: doc.id, title: doc.title, content: doc.content, order: doc.order });
            },
          });
        }
        return doc;
      } catch (error) {
        console.error('Failed to create document:', error);
        return null;
      }
    },

    // Autosave, same coalesced-undo shape as updateDoc (task-scoped docs) — see its comment.
    updateSpaceDoc: (docId, spaceId, patch) => {
      const oldDoc = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.spaceDocs.find((d) => d.id === docId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.map((d) => (d.id === docId ? { ...d, ...patch } : d)) } : s
          ),
        })),
      }));
      fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldDoc) {
        const oldPatch: typeof patch = {};
        if (patch.title !== undefined) oldPatch.title = oldDoc.title;
        if (patch.content !== undefined) oldPatch.content = oldDoc.content;
        useHistoryStore.getState().pushCoalesced(`doc-${docId}`, {
          label: 'Edit document',
          undo: () => get().updateSpaceDoc(docId, spaceId, oldPatch),
          redo: () => get().updateSpaceDoc(docId, spaceId, patch),
        });
      }
    },

    moveSpaceDoc: async (spaceId, docId, folderId, targetSpaceId) => {
      const oldDoc = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.spaceDocs.find((d) => d.id === docId);
      const oldFolderId = oldDoc?.folderId ?? null;

      if (targetSpaceId && targetSpaceId !== spaceId) {
        await fetch(`/api/docs/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId, spaceId: targetSpaceId }),
        });
        await get().refetchWorkspaces();
      } else {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            spaces: ws.spaces.map((s) =>
              s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.map((d) => (d.id === docId ? { ...d, folderId } : d)) } : s
            ),
          })),
        }));
        await fetch(`/api/docs/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId }),
        });
      }

      useHistoryStore.getState().push({
        label: 'Move document',
        undo: () => get().moveSpaceDoc(targetSpaceId ?? spaceId, docId, oldFolderId, spaceId),
        redo: () => get().moveSpaceDoc(spaceId, docId, folderId, targetSpaceId),
      });
    },

    reorderSpaceDoc: async (spaceId, docId, order) => {
      const oldOrder = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.spaceDocs.find((d) => d.id === docId)?.order;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.map((d) => (d.id === docId ? { ...d, order } : d)) } : s
          ),
        })),
      }));
      await fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (oldOrder !== undefined && oldOrder !== order) {
        useHistoryStore.getState().push({
          label: 'Reorder document',
          undo: () => get().reorderSpaceDoc(spaceId, docId, oldOrder),
          redo: () => get().reorderSpaceDoc(spaceId, docId, order),
        });
      }
    },

    deleteSpaceDoc: async (docId, spaceId) => {
      const space = get().workspaces.flatMap((w) => w.spaces).find((s) => s.id === spaceId);
      const doc = space?.spaceDocs.find((d) => d.id === docId);
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.filter((d) => d.id !== docId) } : s)),
        })),
      }));
      await fetch(`/api/docs/${docId}`, { method: 'DELETE' });
      if (doc) {
        useHistoryStore.getState().push({
          label: `Delete document "${doc.title}"`,
          undo: async () => {
            await get().createSpaceDoc(spaceId, doc.folderId, { id: doc.id, title: doc.title, content: doc.content, order: doc.order });
          },
          redo: () => get().deleteSpaceDoc(docId, spaceId),
        });
      }
    },

    setDocTaskLink: async (docId, taskId) => {
      // A doc lives in two different caches depending on how it's reachable (docs[taskId] for the
      // task modal, space.spaceDocs for the Docs tab) — check both to find its current taskId.
      const fromTaskDocs = Object.values(get().docs).flat().find((d) => d.id === docId);
      const fromSpaceDocs = get()
        .workspaces.flatMap((w) => w.spaces)
        .flatMap((s) => s.spaceDocs)
        .find((d) => d.id === docId);
      const doc = fromTaskDocs ?? fromSpaceDocs;
      const oldTaskId = doc?.taskId ?? null;

      await fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (oldTaskId) await get().fetchDocs(oldTaskId);
      if (taskId) await get().fetchDocs(taskId);
      await get().refetchWorkspaces();

      if (doc && oldTaskId !== taskId) {
        useHistoryStore.getState().push({
          label: taskId ? `Link document "${doc.title}" to task` : `Unlink document "${doc.title}" from task`,
          undo: () => get().setDocTaskLink(docId, oldTaskId),
          redo: () => get().setDocTaskLink(docId, taskId),
        });
      }
    },

    fetchComments: async (taskId) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`);
        if (!res.ok) return;
        const comments = await res.json();
        set((state) => ({ comments: { ...state.comments, [taskId]: comments } }));
      } catch (error) {
        console.error('Failed to fetch comments:', error);
      }
    },

    addComment: async (taskId, body, authorId = null) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, authorId }),
        });
        if (!res.ok) {
          console.error('Comment API returned an error:', res.status);
          return;
        }
        const comment = await res.json();
        set((state) => ({
          comments: { ...state.comments, [taskId]: [...(state.comments[taskId] || []), comment] },
        }));
        useHistoryStore.getState().push({
          label: 'Add comment',
          undo: () => get().deleteComment(taskId, comment.id),
          redo: async () => {
            await fetch(`/api/tasks/${taskId}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: comment.id, body, authorId, type: comment.type }),
            });
            set((state) => ({
              comments: { ...state.comments, [taskId]: [...(state.comments[taskId] || []), comment] },
            }));
          },
        });
      } catch (error) {
        console.error('Failed to send comment:', error);
      }
    },

    deleteComment: async (taskId, commentId) => {
      set((state) => ({
        comments: { ...state.comments, [taskId]: (state.comments[taskId] || []).filter((c) => c.id !== commentId) },
      }));
      await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
    },

    // For activity that the client itself decides is log-worthy (currently: one entry per doc
    // edit *session*, fired on blur — not per autosave tick, see the blur handlers in page.tsx)
    // rather than something a specific API route already logs as a side effect of its own write.
    logActivity: async (taskId, body, kind) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, type: 'activity', activityKind: kind, authorId: useSessionStore.getState().currentUserId }),
        });
        if (!res.ok) return;
        const comment = await res.json();
        set((state) => ({
          comments: { ...state.comments, [taskId]: [...(state.comments[taskId] || []), comment] },
        }));
      } catch (error) {
        console.error('Failed to log activity:', error);
      }
    },

    fetchDocs: async (taskId) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/docs`);
        if (!res.ok) return;
        const docs = await res.json();
        set((state) => ({ docs: { ...state.docs, [taskId]: docs } }));
      } catch (error) {
        console.error('Failed to fetch documents:', error);
      }
    },

    createDoc: async (taskId, opts) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: opts?.id,
            title: opts?.title ?? 'Untitled',
            content: opts?.content ?? '',
            order: opts?.order,
            authorId: useSessionStore.getState().currentUserId,
          }),
        });
        if (!res.ok) return null;
        const doc = await res.json();
        set((state) => ({ docs: { ...state.docs, [taskId]: [...(state.docs[taskId] || []), doc] } }));
        if (!opts?.id && get().comments[taskId]) get().fetchComments(taskId);
        if (!opts?.id) {
          // Only the interactive "+ New Doc" path (no explicit id) is undo-worthy — restores
          // performed via snapshot/restore already happen inside another action's own undo entry.
          useHistoryStore.getState().push({
            label: 'Create document',
            undo: () => get().deleteDoc(doc.id, taskId),
            redo: async () => {
              await get().createDoc(taskId, { id: doc.id, title: doc.title, content: doc.content, order: doc.order });
            },
          });
        }
        return doc;
      } catch (error) {
        console.error('Failed to create document:', error);
        return null;
      }
    },

    // Autosave: updates locally right away, fires a PATCH in the background (debouncing is
    // handled by the UI layer). Coalesced into the history stack via `pushCoalesced` — see
    // `useHistoryStore` — so a burst of keystrokes collapses into one undo step per edit session
    // rather than one per keystroke.
    updateDoc: (docId, taskId, patch) => {
      const oldDoc = (get().docs[taskId] || []).find((d) => d.id === docId);
      set((state) => ({
        docs: {
          ...state.docs,
          [taskId]: (state.docs[taskId] || []).map((d) => (d.id === docId ? { ...d, ...patch } : d)),
        },
      }));
      fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldDoc) {
        const oldPatch: typeof patch = {};
        if (patch.title !== undefined) oldPatch.title = oldDoc.title;
        if (patch.content !== undefined) oldPatch.content = oldDoc.content;
        useHistoryStore.getState().pushCoalesced(`doc-${docId}`, {
          label: 'Edit document',
          undo: () => get().updateDoc(docId, taskId, oldPatch),
          redo: () => get().updateDoc(docId, taskId, patch),
        });
      }
    },

    deleteDoc: async (docId, taskId) => {
      const doc = (get().docs[taskId] || []).find((d) => d.id === docId);
      set((state) => ({
        docs: { ...state.docs, [taskId]: (state.docs[taskId] || []).filter((d) => d.id !== docId) },
      }));
      const authorId = useSessionStore.getState().currentUserId;
      await fetch(`/api/docs/${docId}${authorId ? `?authorId=${authorId}` : ''}`, { method: 'DELETE' });
      if (get().comments[taskId]) get().fetchComments(taskId);
      if (doc) {
        useHistoryStore.getState().push({
          label: `Delete document "${doc.title}"`,
          undo: async () => {
            await get().createDoc(taskId, { id: doc.id, title: doc.title, content: doc.content, order: doc.order });
          },
          redo: () => get().deleteDoc(docId, taskId),
        });
      }
    },

    reorderDocs: (taskId, orderedIds) => {
      const oldOrderedIds = (get().docs[taskId] || []).slice().sort((a, b) => a.order - b.order).map((d) => d.id);
      set((state) => {
        const byId = new Map((state.docs[taskId] || []).map((d) => [d.id, d]));
        const reordered = orderedIds
          .map((id, index) => {
            const doc = byId.get(id);
            return doc ? { ...doc, order: index } : null;
          })
          .filter((d): d is TaskDoc => !!d);
        return { docs: { ...state.docs, [taskId]: reordered } };
      });
      orderedIds.forEach((id, index) => {
        fetch(`/api/docs/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: index }),
        });
      });
      useHistoryStore.getState().push({
        label: 'Reorder documents',
        undo: () => get().reorderDocs(taskId, oldOrderedIds),
        redo: () => get().reorderDocs(taskId, orderedIds),
      });
    },
  };
});

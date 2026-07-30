import { create } from 'zustand';
import { Task as PrismaTask } from '@prisma/client';
import { collectFolderIdsUnder } from '../lib/folderTree';

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
};

export type Task = PrismaTask & {
  assignees: AppUser[];
  _localId?: string;
};

export type TaskComment = {
  id: string;
  body: string;
  type: 'comment' | 'activity';
  authorId: string | null;
  author: AppUser | null;
  createdAt: string;
};

export type TaskDoc = {
  id: string;
  title: string;
  content: string;
  order: number;
  taskId: string;
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
  statuses: StatusDef[];
  customFields: CustomFieldDef[];
  folders: HierarchyFolder[];
  lists: HierarchyList[];
};

export type HierarchyWorkspace = {
  id: string;
  name: string;
  spaces: HierarchySpace[];
};

interface TaskStore {
  tasks: Task[];
  users: AppUser[];
  workspaces: HierarchyWorkspace[];
  comments: Record<string, TaskComment[]>;
  docs: Record<string, TaskDoc[]>;
  activeView: 'board' | 'calendar';
  activeSpaceId: string | 'everything';
  activeListId: string | null;
  isLoading: boolean;
  showArchived: boolean;

  fetchInitialData: () => Promise<void>;
  refetchWorkspaces: () => Promise<void>;
  setActiveView: (view: 'board' | 'calendar') => void;
  setNavigation: (spaceId: string, listId?: string | null) => void;
  setShowArchived: (v: boolean) => void;

  optimisticMoveTask: (taskId: string, newStatus: string) => void;
  optimisticCreateTask: (
    title: string,
    listId: string,
    spaceId: string,
    parentId?: string | null,
    startDate?: string | null,
    dueDate?: string | null
  ) => Promise<void>;
  optimisticDeleteTask: (taskId: string) => void;
  optimisticArchiveTask: (taskId: string, archived: boolean) => void;
  optimisticSetAssignees: (taskId: string, userIds: string[]) => void;
  optimisticSetCustomFieldValue: (taskId: string, fieldId: string, value: string) => void;
  optimisticSetDates: (taskId: string, startDate: string | null, dueDate: string | null) => void;
  optimisticSetList: (taskId: string, listId: string) => void;
  optimisticSetParent: (taskId: string, parentId: string | null) => void;
  optimisticSetTitle: (taskId: string, title: string) => void;

  createStatus: (spaceId: string, name: string, color: string) => Promise<void>;
  updateStatus: (spaceId: string, statusId: string, patch: { name?: string; color?: string; order?: number }) => Promise<void>;
  deleteStatus: (spaceId: string, statusId: string) => Promise<void>;
  createCustomField: (
    spaceId: string,
    name: string,
    type: CustomFieldDef['type'],
    options?: { label: string; color: string }[]
  ) => Promise<void>;
  updateCustomField: (
    spaceId: string,
    fieldId: string,
    patch: { name?: string; options?: { id?: string; label: string; color: string }[] }
  ) => Promise<void>;
  deleteCustomField: (spaceId: string, fieldId: string) => Promise<void>;

  addUser: (name: string, initials: string, color: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  updateSpace: (spaceId: string, patch: { name?: string; color?: string }) => Promise<void>;
  reorderSpace: (spaceId: string, order: number) => Promise<void>;

  createList: (spaceId: string, name: string, folderId?: string | null) => Promise<void>;
  renameList: (spaceId: string, listId: string, name: string) => Promise<void>;
  updateList: (spaceId: string, listId: string, patch: { name?: string; color?: string | null; icon?: string | null }) => Promise<void>;
  // `targetSpaceId`, when given and different from `spaceId`, moves the list to a different
  // Space entirely (not just a different folder within the same one) — see the comment above
  // the implementation for why that needs a slower refetch-based path instead of a local patch.
  moveList: (spaceId: string, listId: string, folderId: string | null, targetSpaceId?: string) => Promise<void>;
  reorderList: (spaceId: string, listId: string, order: number) => Promise<void>;

  createFolder: (spaceId: string, name: string, parentId?: string | null) => Promise<void>;
  renameFolder: (spaceId: string, folderId: string, name: string) => Promise<void>;
  updateFolder: (
    spaceId: string,
    folderId: string,
    patch: { name?: string; color?: string | null; icon?: string | null; order?: number }
  ) => Promise<void>;
  moveFolder: (spaceId: string, folderId: string, parentId: string | null, targetSpaceId?: string) => Promise<void>;
  deleteFolder: (spaceId: string, folderId: string) => Promise<void>;

  fetchComments: (taskId: string) => Promise<void>;
  addComment: (taskId: string, body: string, authorId?: string | null) => Promise<void>;

  fetchDocs: (taskId: string) => Promise<void>;
  createDoc: (taskId: string) => Promise<TaskDoc | null>;
  updateDoc: (docId: string, taskId: string, patch: { title?: string; content?: string }) => void;
  deleteDoc: (docId: string, taskId: string) => Promise<void>;
  reorderDocs: (taskId: string, orderedIds: string[]) => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  users: [],
  workspaces: [],
  comments: {},
  docs: {},
  activeView: 'board',
  activeSpaceId: 'everything',
  activeListId: null,
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
  // complexity next to a plain refetch.
  refetchWorkspaces: async () => {
    try {
      const res = await fetch('/api/workspaces');
      const workspaces = await res.json();
      set({ workspaces });
    } catch (error) {
      console.error('Error refetching workspaces:', error);
    }
  },

  setActiveView: (activeView) => set({ activeView }),

  setNavigation: (spaceId, listId = null) =>
    set({
      activeSpaceId: spaceId,
      activeListId: listId,
    }),

  setShowArchived: (showArchived) => set({ showArchived }),

  optimisticMoveTask: (taskId, newStatus) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    }));
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(() => {
      if (get().comments[taskId]) get().fetchComments(taskId);
    });
  },

  optimisticCreateTask: async (title, listId, spaceId, parentId = null, startDate = null, dueDate = null) => {
    const tempId = `temp-${Date.now()}`;
    const space = get()
      .workspaces.flatMap((w) => w.spaces)
      .find((s) => s.id === spaceId);
    const defaultStatus = space?.statuses?.[0]?.name || 'To Do';

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
        body: JSON.stringify({ title, listId, parentId, status: defaultStatus, startDate, dueDate }),
      });
      const savedTask = await res.json();

      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === tempId ? { ...savedTask, assignees: savedTask.assignees || [], _localId: tempId } : t
        ),
      }));
    } catch (error) {
      console.error('Failed to save task:', error);
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== tempId) }));
    }
  },

  optimisticDeleteTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
    fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  },

  optimisticArchiveTask: (taskId, archived) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, archived, archivedAt: archived ? new Date() : null } : t
      ),
    }));
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    }).then(() => {
      if (get().comments[taskId]) get().fetchComments(taskId);
    });
  },

  optimisticSetAssignees: (taskId, userIds) => {
    const allUsers = get().users;
    const assignees = allUsers.filter((u) => userIds.includes(u.id));
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, assignees } : t)),
    }));
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeIds: userIds }),
    });
  },

  optimisticSetCustomFieldValue: (taskId, fieldId, value) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const current = JSON.parse(t.customFieldValues || '{}');
        current[fieldId] = value;
        return { ...t, customFieldValues: JSON.stringify(current) };
      }),
    }));
    const task = get().tasks.find((t) => t.id === taskId);
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFieldValues: task?.customFieldValues }),
    });
  },

  optimisticSetDates: (taskId, startDate, dueDate) => {
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
  },

  optimisticSetList: (taskId, listId) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, listId } : t)),
    }));
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId }),
    }).then(() => {
      if (get().comments[taskId]) get().fetchComments(taskId);
    });
  },

  optimisticSetTitle: (taskId, title) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, title } : t)),
    }));
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  },

  optimisticSetParent: (taskId, parentId) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, parentId } : t)),
    }));
    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId }),
    }).then(() => {
      if (get().comments[taskId]) get().fetchComments(taskId);
    });
  },

  createStatus: async (spaceId, name, color) => {
    const res = await fetch('/api/statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, name, color }),
    });
    const newStatus = await res.json();
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, statuses: [...s.statuses, newStatus] } : s)),
      })),
    }));
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
  },

  deleteStatus: async (spaceId, statusId) => {
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, statuses: s.statuses.filter((st) => st.id !== statusId) } : s)),
      })),
    }));
    await fetch(`/api/statuses/${statusId}`, { method: 'DELETE' });
  },

  createCustomField: async (spaceId, name, type, options = []) => {
    const res = await fetch('/api/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, name, type, options }),
    });
    const newField = await res.json();
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, customFields: [...s.customFields, newField] } : s)),
      })),
    }));
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
  },

  deleteCustomField: async (spaceId, fieldId) => {
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        spaces: ws.spaces.map((s) =>
          s.id === spaceId ? { ...s, customFields: s.customFields.filter((f) => f.id !== fieldId) } : s
        ),
      })),
    }));
    await fetch(`/api/custom-fields/${fieldId}`, { method: 'DELETE' });
  },

  addUser: async (name, initials, color) => {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, initials, color }),
    });
    const newUser = await res.json();
    set((state) => ({ users: [...state.users, newUser] }));
  },

  deleteUser: async (userId) => {
    set((state) => ({
      users: state.users.filter((u) => u.id !== userId),
      tasks: state.tasks.map((t) => ({ ...t, assignees: t.assignees.filter((a) => a.id !== userId) })),
    }));
    await fetch(`/api/users/${userId}`, { method: 'DELETE' });
  },

  updateSpace: async (spaceId, patch) => {
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
  },

  reorderSpace: async (spaceId, order) => {
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
  },

  createList: async (spaceId, name, folderId = null) => {
    const res = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, name, folderId }),
    });
    const newList = await res.json();
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, lists: [...s.lists, newList] } : s)),
      })),
    }));
  },

  renameList: async (spaceId, listId, name) => {
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
  },

  updateList: async (spaceId, listId, patch) => {
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
  },

  moveList: async (spaceId, listId, folderId, targetSpaceId) => {
    if (targetSpaceId && targetSpaceId !== spaceId) {
      await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, spaceId: targetSpaceId }),
      });
      await get().refetchWorkspaces();
      return;
    }
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
  },

  reorderList: async (spaceId, listId, order) => {
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
  },

  createFolder: async (spaceId, name, parentId = null) => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, name, parentId }),
    });
    const newFolder = await res.json();
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, folders: [...s.folders, newFolder] } : s)),
      })),
    }));
  },

  renameFolder: async (spaceId, folderId, name) => {
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
  },

  updateFolder: async (spaceId, folderId, patch) => {
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
  },

  moveFolder: async (spaceId, folderId, parentId, targetSpaceId) => {
    if (targetSpaceId && targetSpaceId !== spaceId) {
      await fetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, spaceId: targetSpaceId }),
      });
      await get().refetchWorkspaces();
      return;
    }
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
  },

  deleteFolder: async (spaceId, folderId) => {
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
    await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
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
    } catch (error) {
      console.error('Failed to send comment:', error);
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

  createDoc: async (taskId) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled' }),
      });
      if (!res.ok) return null;
      const doc = await res.json();
      set((state) => ({ docs: { ...state.docs, [taskId]: [...(state.docs[taskId] || []), doc] } }));
      return doc;
    } catch (error) {
      console.error('Failed to create document:', error);
      return null;
    }
  },

  // Autosave: updates locally right away, fires a PATCH in the background (debouncing is handled by the UI layer)
  updateDoc: (docId, taskId, patch) => {
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
  },

  deleteDoc: async (docId, taskId) => {
    set((state) => ({
      docs: { ...state.docs, [taskId]: (state.docs[taskId] || []).filter((d) => d.id !== docId) },
    }));
    await fetch(`/api/docs/${docId}`, { method: 'DELETE' });
  },

  reorderDocs: (taskId, orderedIds) => {
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
  },
}));
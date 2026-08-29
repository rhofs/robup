import { create } from 'zustand';
import { Task as PrismaTask, Event as PrismaEvent } from '@prisma/client';
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
  // Null = Space-wide (every field created before this existed, and any created with no single
  // List active). Set = only that List's own task table shows this column.
  listId: string | null;
};

export type AppUser = {
  id: string;
  name: string;
  username: string | null;
  initials: string;
  color: string;
  phone: string | null;
  title: string | null;
  status: string | null;
  isDnd: boolean;
  roomId: string | null;
  googleEmail: string | null;
  avatarUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  // Only ever populated on the entry matching the signed-in caller (see GET /api/users) — used by
  // ProfilePage's account-deletion confirmation to decide between "confirm your password" and
  // "type your email to confirm" (Google-only accounts have no password). Undefined for every
  // other user's AppUser object, never leaked.
  email?: string | null;
  hasPassword?: boolean;
};

export type Task = PrismaTask & {
  assignees: AppUser[];
  _localId?: string;
};

// A Planner Event — happens on a given day, clickable for details, but deliberately never
// creates a Task row (no required Space/Folder/List). See prisma/schema.prisma's own comment on
// why this is a standalone model rather than a Task variant.
export type Event = PrismaEvent & {
  assignees: AppUser[];
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

// Selection-anchored comment on a Doc's own content (lib/collab/commentMark.ts anchors the text
// itself via the shared markId). Flat, one level of replies via parentId — thread root has
// parentId: null and is the only row where `resolved` is meaningful.
export type DocComment = {
  id: string;
  body: string;
  docId: string;
  markId: string;
  parentId: string | null;
  quotedText: string | null;
  resolved: boolean;
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
  color: string | null;
  // Independent from `color` — colors the sidebar/name text specifically; falls back to `color`
  // when null.
  textColor: string | null;
  order: number;
  // Non-destructive "get this out of the way," independent of Trash — cascades to every subpage
  // in this doc's own subtree. See lib/archiveCascade.ts.
  archived: boolean;
  taskId: string | null;
  spaceId: string | null;
  folderId: string | null;
  // Independent from folderId above — which real Folder (the same one Lists use) this doc sits
  // under in the Tasks-tab sidebar. See lib/folderTree.ts's getBoardDocsIn.
  boardFolderId: string | null;
  // Subpages — a doc nested under another doc, independent of folderId (see PLANNING.md). A
  // subpage's own folderId is always null; it's reached only through its parent's Subpages table
  // or the sidebar's own expand-in-place.
  parentId: string | null;
  ownerId: string | null;
  contributorIds: string[];
  // Page-level presentation settings (ClickUp's "Page Styles" panel) — only ever rendered/edited
  // at the standalone Docs/Tasks-tab doc header, never the embedded task-modal editor.
  // coverImageUrl/subtitle are presence-based (null = not shown), same as Space.coverImageUrl.
  coverImageUrl: string | null;
  subtitle: string | null;
  pageWidth: 'normal' | 'full';
  showLastModified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HierarchyFolder = {
  id: string;
  name: string;
  color: string | null;
  textColor: string | null;
  icon: string | null;
  spaceId: string;
  parentId: string | null;
  order: number;
  isPrivate: boolean;
  accessJson: string;
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
  textColor: string | null;
  icon: string | null;
  folderId: string | null;
  order: number;
  archived: boolean;
  isPrivate: boolean;
  accessJson: string;
};

export type HierarchySpace = {
  id: string;
  name: string;
  color: string;
  textColor: string | null;
  icon: string | null;
  order: number;
  description: string | null;
  coverImageUrl: string | null;
  statuses: StatusDef[];
  customFields: CustomFieldDef[];
  folders: HierarchyFolder[];
  lists: HierarchyList[];
  docFolders: HierarchyDocFolder[];
  spaceDocs: TaskDoc[];
  isPrivate: boolean;
  accessJson: string;
};

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type HierarchyRole = {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
};

export type HierarchyRoom = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  textColor: string | null;
  order: number;
  isDnd: boolean;
  workspaceId: string;
};

// A pending, targeted "invite THIS person to this workspace" (backlog #8) — the recipient's own
// view of one, always includes which workspace + who sent it (GET /api/workspace-member-invites'
// own shape).
export type WorkspaceMemberInvite = {
  id: string;
  role: 'admin' | 'member';
  createdAt: string;
  workspace: { id: string; name: string };
  invitedBy: AppUser;
};

export type HierarchyWorkspace = {
  id: string;
  name: string;
  messageOfTheDay: string | null;
  // A more "official" creation step (backlog #2) — plain metadata, never verified (no
  // email-sending infrastructure in this app). Null on every workspace created before this.
  orgType: 'company' | 'personal_project' | null;
  workEmail: string | null;
  spaces: HierarchySpace[];
  rooms: HierarchyRoom[];
  // Each member's own tier (owner/admin/member) is attached directly onto their entry rather
  // than a parallel lookup structure — see app/api/workspaces/route.ts's mapping.
  members: (AppUser & { workspaceRole: WorkspaceRole })[];
  roles: HierarchyRole[];
  // The one auto-created workspace behind the sidebar's "My tasks" Me-zone button — excluded
  // from the workspace switcher and from fetchInitialData's own auto-selection on page load, but
  // (since the 2026-08-17 personal-workspace rework) DOES become the real activeWorkspaceId/
  // currentWorkspace when "My tasks" is clicked, reusing the entire normal Board/Spaces/Lists UI.
  isPersonal: boolean;
};

// --- Snapshot shapes used by cascading-delete undo (Task/List/Folder/Space) ---
// Captured from live state right before a delete, walked bottom-up to build the JSON, then
// walked top-down (parent before child) to restore — see the `snapshot*`/`restore*` helpers
// inside the store body.
interface TaskStore {
  tasks: Task[];
  events: Event[];
  users: AppUser[];
  workspaces: HierarchyWorkspace[];
  comments: Record<string, TaskComment[]>;
  // Same shape/API pattern as `comments` above, keyed by eventId instead of taskId (backlog #12
  // — Event gained its own Activity & Comments the same session Comment.eventId was added).
  eventComments: Record<string, TaskComment[]>;
  docComments: Record<string, DocComment[]>;
  docs: Record<string, TaskDoc[]>;
  activeView: 'board' | 'calendar' | 'docs' | 'office' | 'mytasks' | 'profile' | 'chat' | 'directMessages';
  // Which Workspace the sidebar/nav is currently scoped to — null only until the first
  // fetchInitialData() resolves (or if the current identity has no workspaces at all).
  activeWorkspaceId: string | null;
  // The most recent *real* (non-personal) workspace actually selected — kept separately from
  // activeWorkspaceId because that field legitimately becomes the personal workspace's id too
  // (e.g. via "My Tasks"). Every "come back to a real workspace" fallback (the desktop rail's
  // Tasks/Spaces icon, the mobile bottom nav's Spaces button) used to just grab
  // `workspaces.find(w => !w.isPersonal)` — the first non-personal workspace in fetch order,
  // which silently landed on the *wrong* workspace for anyone who's a member of more than one
  // (reported live: New Game Media -> My Tasks -> Spaces landed on CRRM Media instead of back on
  // New Game Media). This field is what those fallbacks should actually target.
  lastRealWorkspaceId: string | null;
  // Each workspace's own last-visited Space/List, keyed by workspaceId — consulted by
  // setActiveWorkspaceId below so switching *back* to a workspace (e.g. My Tasks -> Spaces, or
  // Spaces -> My Tasks -> Spaces) restores exactly where that workspace was left, instead of
  // always resetting to its first Space. Updated by setNavigation itself, so every path that ever
  // selects a Space/List keeps this current automatically — no separate tracking effect needed
  // per screen. This replaced two parallel, React-local (app/page.tsx `useState`) mechanisms doing
  // the same job for "Spaces" and "My Tasks" independently (`lastRealNav`/`lastPersonalNav`),
  // which could drift out of sync with each other and with this store's own state — reported live
  // as the memory "sometimes working, sometimes not" depending on exactly which of several nearly-
  // identical code paths a given navigation happened to go through.
  lastPositionByWorkspaceId: Record<string, { spaceId: string; listIds: string[] }>;
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
  // Office tab's own position — which team member's page is open, or which room's detail view
  // is open (null for both = the HQ Building overview). A person page takes priority if somehow
  // both are set at once — mirrors how every other "most specific wins" nav field already resolves.
  activeOfficeUserId: string | null;
  activeOfficeRoomId: string | null;
  isLoading: boolean;
  showArchived: boolean;

  fetchInitialData: () => Promise<void>;
  refetchWorkspaces: () => Promise<void>;
  refetchTasks: () => Promise<void>;
  refetchEvents: () => Promise<void>;
  setActiveView: (view: 'board' | 'calendar' | 'docs' | 'office' | 'mytasks' | 'profile' | 'chat' | 'directMessages') => void;
  setActiveWorkspaceId: (id: string) => void;
  setNavigation: (spaceId: string, listIds?: string[]) => void;
  setCalendarGranularity: (g: 'month' | 'week' | 'day') => void;
  setCalendarFocusDate: (d: Date) => void;
  setDocsNavigation: (docFolderId: string | null, docId: string | null) => void;
  setActiveOfficeUserId: (userId: string | null) => void;
  setActiveOfficeRoomId: (roomId: string | null) => void;
  setShowArchived: (v: boolean) => void;

  // Same optimistic-update-then-fetch + undo/redo shape every other action in this store already
  // uses — no new pattern invented for Events.
  optimisticCreateEvent: (params: {
    title: string;
    startDate: string;
    endDate: string;
    allDay?: boolean;
    spaceId?: string | null;
    color?: string | null;
    workspaceId: string;
    assigneeIds?: string[];
    location?: string | null;
    id?: string;
  }) => Promise<Event | null>;
  updateEvent: (
    eventId: string,
    patch: {
      title?: string;
      description?: string | null;
      location?: string | null;
      startDate?: string;
      endDate?: string;
      allDay?: boolean;
      color?: string | null;
      spaceId?: string | null;
    }
  ) => Promise<void>;
  optimisticSetEventAssignees: (eventId: string, assigneeIds: string[]) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;

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
  optimisticSetCalendarLane: (taskId: string, lane: number | null) => void;
  optimisticSetList: (taskId: string, listId: string) => void;
  setTaskPrivacy: (taskId: string, isPrivate: boolean, accessJson: string) => void;
  optimisticSetParent: (taskId: string, parentId: string | null) => void;
  optimisticSetTitle: (taskId: string, title: string) => void;
  optimisticSetDescription: (taskId: string, description: string | null) => void;

  createStatus: (spaceId: string, name: string, color: string, id?: string) => Promise<void>;
  updateStatus: (spaceId: string, statusId: string, patch: { name?: string; color?: string; order?: number }) => Promise<void>;
  deleteStatus: (spaceId: string, statusId: string) => Promise<void>;
  createCustomField: (
    spaceId: string,
    name: string,
    type: CustomFieldDef['type'],
    options?: { label: string; color: string }[],
    id?: string,
    listId?: string | null
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
    patch: {
      name?: string;
      initials?: string;
      color?: string;
      phone?: string | null;
      title?: string | null;
      status?: string | null;
      isDnd?: boolean;
      roomId?: string | null;
      avatarUrl?: string | null;
      bio?: string | null;
      linkedinUrl?: string | null;
      websiteUrl?: string | null;
    }
  ) => Promise<void>;
  // Deliberately separate from updateUser above, not folded into its patch shape — every other
  // field there is silently-optimistic (apply locally, fire the PATCH, never check the response),
  // which is fine for a phone number or a bio but wrong here: a taken/invalid username is a real,
  // expected outcome the caller needs to actually see, not something to paper over. Self-only,
  // enforced again server-side (PATCH /api/users/[id]) — never call this with anyone but the
  // signed-in caller's own id.
  setUsername: (userId: string, username: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteUser: (userId: string) => Promise<void>;

  // Office "rooms" — purely organizational/visual grouping of team members, unrelated to the
  // Space/Folder/List tree.
  createRoom: (workspaceId: string, name: string, id?: string) => Promise<void>;
  updateRoom: (
    roomId: string,
    patch: { name?: string; icon?: string | null; color?: string | null; textColor?: string | null; order?: number; isDnd?: boolean }
  ) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  assignUserToRoom: (userId: string, roomId: string | null) => Promise<void>;
  updateWorkspaceMessage: (workspaceId: string, message: string | null) => Promise<void>;
  createWorkspace: (
    name: string,
    userId: string,
    opts?: { orgType?: 'company' | 'personal_project'; workEmail?: string | null }
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateWorkspaceDetails: (
    workspaceId: string,
    patch: { name?: string; orgType?: 'company' | 'personal_project'; workEmail?: string | null }
  ) => Promise<void>;
  addWorkspaceMember: (workspaceId: string, userId: string) => Promise<void>;
  removeWorkspaceMember: (workspaceId: string, userId: string) => Promise<void>;
  // Targeted, in-app workspace invites via Network (backlog #8) — memberInvitesIncoming is mine,
  // across every workspace (shown in the workspace switcher); sendWorkspaceMemberInvite is the
  // Owner/Admin side, scoped to one workspace, used from Settings' Invite tab.
  memberInvitesIncoming: WorkspaceMemberInvite[];
  fetchMemberInvites: () => Promise<void>;
  acceptMemberInvite: (id: string) => Promise<void>;
  declineMemberInvite: (id: string) => Promise<void>;
  sendWorkspaceMemberInvite: (
    workspaceId: string,
    toUserId: string,
    role: 'admin' | 'member'
  ) => Promise<{ ok: boolean; error?: string }>;
  // Owner/Admin only server-side (see app/api/workspaces/[id]/members/[userId]/route.ts PATCH) —
  // promote a 'member' to 'admin' or demote back, never targets/produces 'owner'.
  changeWorkspaceMemberRole: (workspaceId: string, userId: string, role: 'admin' | 'member') => Promise<void>;
  // Owner only server-side. No undo — a destroyed workspace's full nested tree isn't something
  // this app's undo model attempts to resurrect (unlike the Trash/cascade-delete undo for
  // Space/Folder/List/Task, which restores from a captured snapshot; nothing captures a whole
  // workspace's snapshot today).
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  createRole: (workspaceId: string, name: string, color: string) => Promise<void>;
  updateRole: (workspaceId: string, roleId: string, patch: { name?: string; color?: string }) => Promise<void>;
  deleteRole: (workspaceId: string, roleId: string) => Promise<void>;
  assignRole: (workspaceId: string, roleId: string, userId: string) => Promise<void>;
  unassignRole: (workspaceId: string, roleId: string, userId: string) => Promise<void>;
  ensurePersonalWorkspace: (userId: string) => Promise<{ workspaceId: string; spaceId: string; listId: string }>;

  updateSpace: (
    spaceId: string,
    patch: {
      name?: string;
      color?: string;
      textColor?: string | null;
      icon?: string | null;
      description?: string | null;
      coverImageUrl?: string | null;
      isPrivate?: boolean;
      accessJson?: string;
    }
  ) => Promise<void>;
  reorderSpace: (spaceId: string, order: number) => Promise<void>;
  createSpace: (workspaceId: string, name: string, id?: string) => Promise<void>;
  deleteSpace: (spaceId: string) => Promise<void>;

  createList: (spaceId: string, name: string, folderId?: string | null, id?: string) => Promise<void>;
  renameList: (spaceId: string, listId: string, name: string) => Promise<void>;
  updateList: (
    spaceId: string,
    listId: string,
    patch: { name?: string; color?: string | null; textColor?: string | null; icon?: string | null; isPrivate?: boolean; accessJson?: string }
  ) => Promise<void>;
  // `targetSpaceId`, when given and different from `spaceId`, moves the list to a different
  // Space entirely (not just a different folder within the same one) — see the comment above
  // the implementation for why that needs a slower refetch-based path instead of a local patch.
  moveList: (spaceId: string, listId: string, folderId: string | null, targetSpaceId?: string) => Promise<void>;
  reorderList: (spaceId: string, listId: string, order: number) => Promise<void>;
  deleteList: (spaceId: string, listId: string) => Promise<void>;
  // Non-destructive, independent of deleteList/Trash — cascades to every Task inside (see
  // lib/archiveCascade.ts). `archived: false` restores.
  archiveList: (spaceId: string, listId: string, archived: boolean) => Promise<void>;

  createFolder: (spaceId: string, name: string, parentId?: string | null, id?: string) => Promise<void>;
  renameFolder: (spaceId: string, folderId: string, name: string) => Promise<void>;
  updateFolder: (
    spaceId: string,
    folderId: string,
    patch: {
      name?: string;
      color?: string | null;
      textColor?: string | null;
      icon?: string | null;
      order?: number;
      isPrivate?: boolean;
      accessJson?: string;
    }
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
    opts?: { id?: string; title?: string; content?: string; order?: number; parentId?: string | null; boardFolderId?: string | null }
  ) => Promise<TaskDoc | null>;
  updateSpaceDoc: (
    docId: string,
    spaceId: string,
    patch: {
      title?: string;
      color?: string | null;
      textColor?: string | null;
      ownerId?: string | null;
      contributorIds?: string[];
      coverImageUrl?: string | null;
      subtitle?: string | null;
      pageWidth?: 'normal' | 'full';
      showLastModified?: boolean;
    }
  ) => void;
  moveSpaceDoc: (spaceId: string, docId: string, folderId: string | null, targetSpaceId?: string) => Promise<void>;
  // Non-destructive, independent of deleteSpaceDoc/Trash — cascades to every subpage in this
  // doc's own subtree (see lib/archiveCascade.ts). `archived: false` restores.
  archiveSpaceDoc: (spaceId: string, docId: string, archived: boolean) => Promise<void>;
  // Independent from moveSpaceDoc above (which moves between DocFolders) — moves a Doc between
  // real Folders in the Tasks-tab sidebar, mirroring moveList's exact shape.
  moveDocToBoardFolder: (spaceId: string, docId: string, boardFolderId: string | null, targetSpaceId?: string) => Promise<void>;
  // Reparents a doc under another doc (a "subpage"), or back to null (top-level) — folderId is
  // left untouched here; a doc created as a subpage already gets folderId: null server-side.
  moveDocParent: (spaceId: string, docId: string, parentId: string | null) => Promise<void>;
  reorderSpaceDoc: (spaceId: string, docId: string, order: number) => Promise<void>;
  deleteSpaceDoc: (docId: string, spaceId: string) => Promise<void>;
  // Attaches (taskId set) or detaches (taskId null) an existing doc to/from a task, without
  // touching its spaceId/folderId — the same doc can be task-scoped, Space/Folder-scoped, or both.
  setDocTaskLink: (docId: string, taskId: string | null) => Promise<void>;

  fetchComments: (taskId: string) => Promise<void>;
  addComment: (taskId: string, body: string) => Promise<void>;
  deleteComment: (taskId: string, commentId: string) => Promise<void>;
  logActivity: (taskId: string, body: string, kind: string) => Promise<void>;
  fetchEventComments: (eventId: string) => Promise<void>;
  addEventComment: (eventId: string, body: string) => Promise<void>;
  deleteEventComment: (eventId: string, commentId: string) => Promise<void>;

  fetchDocComments: (docId: string) => Promise<void>;
  addDocComment: (docId: string, opts: { id?: string; body: string; markId: string; parentId?: string | null; quotedText?: string | null }) => Promise<DocComment | null>;
  resolveDocComment: (docId: string, commentId: string, resolved: boolean) => Promise<void>;
  deleteDocComment: (docId: string, commentId: string) => Promise<void>;

  fetchDocs: (taskId: string) => Promise<void>;
  createDoc: (taskId: string, opts?: { id?: string; title?: string; content?: string; order?: number }) => Promise<TaskDoc | null>;
  updateDoc: (docId: string, taskId: string, patch: { title?: string }) => void;
  deleteDoc: (docId: string, taskId: string) => Promise<void>;
  reorderDocs: (taskId: string, orderedIds: string[]) => void;

  // Trash panel: restore or permanently purge a soft-deleted item of any kind by its API path
  // segment (mirrors the route names, not the display label — 'doc-folders', not 'docFolder').
  restoreFromTrash: (kind: 'spaces' | 'folders' | 'lists' | 'tasks' | 'doc-folders' | 'docs' | 'events', id: string) => Promise<void>;
  permanentlyDeleteFromTrash: (kind: 'spaces' | 'folders' | 'lists' | 'tasks' | 'doc-folders' | 'docs' | 'events', id: string) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => {
  // Delete/restore for Space, Folder, List, Task, DocFolder, and Doc all go through the
  // server's soft-delete (`deletedAt`) + cascade instead of a real destructive delete — see
  // lib/trashCascade.ts. That means undo for any of them is just "PATCH { restore: true }"
  // (clearing deletedAt back down the same subtree it was stamped on), not a client-side
  // snapshot-and-recreate: the row never actually left the database, so recreating it with the
  // same id would hit a unique-constraint conflict instead of bringing it back.
  const restoreEntity = async (kind: 'spaces' | 'folders' | 'lists' | 'tasks' | 'doc-folders' | 'docs' | 'events', id: string) => {
    await fetch(`/api/${kind}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restore: true }),
    });
    await Promise.all([get().refetchWorkspaces(), get().refetchTasks(), get().refetchEvents()]);
  };

  return {
    tasks: [],
    events: [],
    users: [],
    workspaces: [],
    memberInvitesIncoming: [],
    comments: {},
    eventComments: {},
    docComments: {},
    docs: {},
    activeView: 'board',
    activeWorkspaceId: null,
    lastRealWorkspaceId: null,
    lastPositionByWorkspaceId: {},
    activeSpaceId: 'everything',
    activeListIds: new Set(),
    calendarGranularity: 'month',
    calendarFocusDate: startOfDay(new Date()),
    activeDocFolderId: null,
    activeStandaloneDocId: null,
    activeOfficeUserId: null,
    activeOfficeRoomId: null,
    isLoading: true,
    showArchived: false,

    fetchInitialData: async () => {
      set({ isLoading: true });
      try {
        // Workspace-scoped endpoints need to know who's asking — "You are: (none)" deliberately
        // sees zero workspaces (see PLANNING.md), so this can genuinely come back empty.
        const userId = useSessionStore.getState().currentUserId ?? '';
        const [workspacesRes, tasksRes, usersRes, taskDocsRes, eventsRes] = await Promise.all([
          fetch(`/api/workspaces?userId=${userId}`),
          fetch(`/api/tasks?userId=${userId}`),
          fetch('/api/users'),
          fetch(`/api/task-docs?userId=${userId}`),
          fetch(`/api/events?userId=${userId}`),
        ]);
        const workspaces = await workspacesRes.json();
        const tasks = await tasksRes.json();
        const users = await usersRes.json();
        const taskDocs = await taskDocsRes.json();
        const events = await eventsRes.json();

        // Keep the current workspace selection if the newly-fetched list still contains it (e.g.
        // a plain refetch, or an identity switch to someone who's also a member of the same
        // workspace) — including a personal workspace: since the 2026-08-17 rework, "My tasks" is
        // a real activeWorkspaceId like any other, so a refresh while inside it should land back
        // there, not silently bounce out to some other team workspace (the old `!w.isPersonal`
        // exclusion here predates that rework and was never updated). Only the *fallback* — no
        // previous selection at all, e.g. very first login — defaults to a real team workspace,
        // never auto-picking the personal one as a first landing spot.
        const previousWorkspaceId = get().activeWorkspaceId;
        const previousLastRealWorkspaceId = get().lastRealWorkspaceId;
        const activeWorkspaceId = workspaces.some((w: HierarchyWorkspace) => w.id === previousWorkspaceId)
          ? previousWorkspaceId
          : // Prefer the last *real* workspace actually selected (survives a refetch even when
            // the previous activeWorkspaceId itself no longer matches, e.g. it was the personal
            // one) over just grabbing the first non-personal workspace in fetch order — same fix
            // as setActiveWorkspaceId's own comment above.
            (workspaces.find((w: HierarchyWorkspace) => w.id === previousLastRealWorkspaceId)?.id ??
              workspaces.find((w: HierarchyWorkspace) => !w.isPersonal)?.id ??
              null);
        const activeWorkspace = workspaces.find((w: HierarchyWorkspace) => w.id === activeWorkspaceId);
        const firstSpaceId = activeWorkspace?.spaces[0]?.id || 'everything';
        const lastRealWorkspaceId = activeWorkspace && !activeWorkspace.isPersonal ? activeWorkspace.id : previousLastRealWorkspaceId;

        // Same "keep it if it's still valid" rule as activeWorkspaceId just above, extended to
        // Space/List — this used to unconditionally reset to firstSpaceId (and silently drop
        // activeListIds' actual content) on *every* call, not just a genuine workspace switch.
        // fetchInitialData runs on every mount/identity-change/reconnect, not only on first login —
        // a mobile browser discarding and reloading a backgrounded tab (very common on phones)
        // re-ran this and snapped straight back to the first Space every time, no matter which real
        // Space/List had actually been open, since nothing here ever looked at the previous value.
        // Reported live as "uansett hvor jeg er, havner jeg alltid tilbake i [the first Space]."
        const previousActiveSpaceId = get().activeSpaceId;
        const previousActiveListIds = get().activeListIds;
        const previousSpaceStillValid =
          previousActiveSpaceId === 'everything' ||
          !!activeWorkspace?.spaces.some((s: HierarchySpace) => s.id === previousActiveSpaceId);
        const activeSpaceId = previousSpaceStillValid ? previousActiveSpaceId : firstSpaceId;
        const activeSpace = activeWorkspace?.spaces.find((s: HierarchySpace) => s.id === activeSpaceId);
        const activeListIds = previousSpaceStillValid
          ? new Set([...previousActiveListIds].filter((id) => activeSpace?.lists.some((l: HierarchyList) => l.id === id)))
          : new Set<string>();

        // Seeds `docs` (normally populated lazily per-task via fetchDocs on modal-open) with
        // every task-scoped doc up front, purely so it's searchable app-wide — fetchDocs still
        // re-fetches its own task's slice on modal-open as the freshness safety net it always was.
        const docsByTask: Record<string, TaskDoc[]> = {};
        for (const doc of taskDocs as TaskDoc[]) {
          if (!doc.taskId) continue;
          (docsByTask[doc.taskId] ??= []).push(doc);
        }

        set((state) => ({
          workspaces,
          tasks,
          users,
          docs: docsByTask,
          events,
          activeWorkspaceId,
          lastRealWorkspaceId,
          activeSpaceId,
          activeListIds,
          isLoading: false,
          // Seeds setActiveWorkspaceId's own restore map with wherever this call resolved to, so
          // a later switch away and back (e.g. to My Tasks and back) has a record even right after
          // a reload, before setNavigation would otherwise get a chance to record one itself.
          lastPositionByWorkspaceId:
            activeWorkspaceId && activeSpaceId !== 'everything'
              ? { ...state.lastPositionByWorkspaceId, [activeWorkspaceId]: { spaceId: activeSpaceId, listIds: [...activeListIds] } }
              : state.lastPositionByWorkspaceId,
        }));
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
        const userId = useSessionStore.getState().currentUserId ?? '';
        const res = await fetch(`/api/workspaces?userId=${userId}`);
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
        const userId = useSessionStore.getState().currentUserId ?? '';
        const res = await fetch(`/api/tasks?userId=${userId}`);
        const tasks = await res.json();
        set({ tasks });
      } catch (error) {
        console.error('Error refetching tasks:', error);
      }
    },

    refetchEvents: async () => {
      try {
        const userId = useSessionStore.getState().currentUserId ?? '';
        const res = await fetch(`/api/events?userId=${userId}`);
        const events = await res.json();
        set({ events });
      } catch (error) {
        console.error('Error refetching events:', error);
      }
    },

    setActiveView: (activeView) => set({ activeView }),

    // Switching workspace is a nav-context change, same shape as switching Space — but restores
    // that workspace's own last-visited Space/List (lastPositionByWorkspaceId, kept current by
    // setNavigation below) if it still exists, rather than always resetting to its first Space.
    // Every caller of this action — the mobile Spaces/My Tasks handlers, the desktop workspace
    // switcher, URL-hydration on load — gets this restore for free, instead of each needing its
    // own separate "remember where I was" bookkeeping.
    setActiveWorkspaceId: (id) => {
      const workspace = get().workspaces.find((w) => w.id === id);
      const remembered = get().lastPositionByWorkspaceId[id];
      const rememberedSpace = remembered && workspace?.spaces.find((s) => s.id === remembered.spaceId);
      const activeSpaceId = rememberedSpace ? remembered.spaceId : workspace?.spaces[0]?.id || 'everything';
      const activeListIds = rememberedSpace
        ? new Set(remembered!.listIds.filter((lid) => rememberedSpace.lists.some((l) => l.id === lid)))
        : new Set<string>();
      set({
        activeWorkspaceId: id,
        activeSpaceId,
        activeListIds,
        ...(workspace && !workspace.isPersonal ? { lastRealWorkspaceId: id } : {}),
      });
    },

    // Clears any open standalone doc too — since the doc-editor view was hoisted to render
    // regardless of activeView (so a Doc opened from the main board sidebar doesn't force a tab
    // switch), a List/Space selection made *while* a doc was still open would otherwise leave
    // that stale activeStandaloneDocId in place forever, permanently blocking the task list
    // behind it. The few call sites that open a Doc (DocFolderTree's onOpenDoc etc.) always call
    // setDocsNavigation *after* this, so they still work — this only clears it when nothing reopens
    // it right after.
    //
    // Also bounces activeView back to 'board' when leaving one of the Space/List-agnostic screens
    // (My Tasks, Profile, Office, Chat, Direct Messages) — those screens ignore
    // activeSpaceId/activeListIds entirely, so a sidebar List/Doc click made from one of them
    // would otherwise update the nav state with no visible effect, stranding the user on the same
    // screen. 'board'/'docs'/'calendar' already handle List/Doc navigation contextually and are
    // left alone. "My tasks" (the personal Workspace) is deliberately NOT in this list — it's a
    // real activeView === 'board' + activeWorkspaceId combo now, not its own agnostic screen, so
    // a Space/List click while viewing it should behave exactly like it does for any other
    // workspace (switch the selection, stay on 'board').
    setNavigation: (spaceId, listIds = []) =>
      set((state) => ({
        activeSpaceId: spaceId,
        activeListIds: new Set(listIds),
        activeDocFolderId: null,
        activeStandaloneDocId: null,
        activeView: (['mytasks', 'profile', 'office', 'chat', 'directMessages'] as TaskStore['activeView'][]).includes(
          state.activeView
        )
          ? 'board'
          : state.activeView,
        // Keeps lastPositionByWorkspaceId current for setActiveWorkspaceId's own restore logic
        // above — 'everything' is a workspace-wide view, not a specific place to remember.
        lastPositionByWorkspaceId:
          state.activeWorkspaceId && spaceId !== 'everything'
            ? { ...state.lastPositionByWorkspaceId, [state.activeWorkspaceId]: { spaceId, listIds } }
            : state.lastPositionByWorkspaceId,
      })),

    setCalendarGranularity: (calendarGranularity) => set({ calendarGranularity }),

    setCalendarFocusDate: (calendarFocusDate) => set({ calendarFocusDate }),

    setDocsNavigation: (activeDocFolderId, activeStandaloneDocId) => set({ activeDocFolderId, activeStandaloneDocId }),

    setActiveOfficeUserId: (activeOfficeUserId) => set({ activeOfficeUserId }),
    setActiveOfficeRoomId: (activeOfficeRoomId) => set({ activeOfficeRoomId }),

    setShowArchived: (showArchived) => set({ showArchived }),

    optimisticCreateEvent: async (params) => {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return null;
      const event: Event = await res.json();
      set((state) => ({ events: [...state.events, event] }));
      if (!params.id) {
        useHistoryStore.getState().push({
          label: 'Create event',
          undo: () => get().deleteEvent(event.id),
          redo: async () => {
            await get().optimisticCreateEvent({ ...params, id: event.id });
          },
        });
      }
      return event;
    },

    updateEvent: async (eventId, patch) => {
      const oldEvent = get().events.find((e) => e.id === eventId);
      set((state) => ({
        events: state.events.map((e) =>
          e.id === eventId
            ? {
                ...e,
                ...patch,
                startDate: patch.startDate ? new Date(patch.startDate) : e.startDate,
                endDate: patch.endDate ? new Date(patch.endDate) : e.endDate,
              }
            : e
        ),
      }));
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (oldEvent) {
        const oldPatch: typeof patch = {};
        if (patch.title !== undefined) oldPatch.title = oldEvent.title;
        if (patch.description !== undefined) oldPatch.description = oldEvent.description;
        if (patch.location !== undefined) oldPatch.location = oldEvent.location;
        if (patch.startDate !== undefined) oldPatch.startDate = new Date(oldEvent.startDate).toISOString();
        if (patch.endDate !== undefined) oldPatch.endDate = new Date(oldEvent.endDate).toISOString();
        if (patch.allDay !== undefined) oldPatch.allDay = oldEvent.allDay;
        if (patch.color !== undefined) oldPatch.color = oldEvent.color;
        if (patch.spaceId !== undefined) oldPatch.spaceId = oldEvent.spaceId;
        useHistoryStore.getState().pushCoalesced(`event-${eventId}`, {
          label: 'Edit event',
          undo: () => get().updateEvent(eventId, oldPatch),
          redo: () => get().updateEvent(eventId, patch),
        });
      }
    },

    optimisticSetEventAssignees: async (eventId, assigneeIds) => {
      const oldIds = get().events.find((e) => e.id === eventId)?.assignees.map((a) => a.id) ?? [];
      const assignees = get().users.filter((u) => assigneeIds.includes(u.id));
      set((state) => ({
        events: state.events.map((e) => (e.id === eventId ? { ...e, assignees } : e)),
      }));
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeIds }),
      });
      useHistoryStore.getState().push({
        label: 'Change event attendees',
        undo: () => get().optimisticSetEventAssignees(eventId, oldIds),
        redo: () => get().optimisticSetEventAssignees(eventId, assigneeIds),
      });
    },

    deleteEvent: async (eventId) => {
      const event = get().events.find((e) => e.id === eventId);
      set((state) => ({ events: state.events.filter((e) => e.id !== eventId) }));
      const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        // Same "don't silently lose data on a failed optimistic mutation" rule every delete
        // action in this store already follows — resync from the server and surface it.
        await get().refetchEvents();
        alert('Failed to delete event. Please try again.');
        return;
      }
      if (event) {
        useHistoryStore.getState().push({
          label: 'Delete event',
          undo: () => restoreEntity('events', eventId),
          redo: () => get().deleteEvent(eventId),
        });
      }
    },

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
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }));
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        // The optimistic removal above already hid it from the UI — if the request never actually
        // landed (dropped connection, server restart mid-request, etc.) it would otherwise look
        // deleted forever without ever reaching the trash. Resync from the server to undo the
        // illusion rather than leaving a phantom gap.
        await get().refetchTasks();
        alert('Kunne ikke slette oppgaven — prøv igjen.');
        return;
      }
      if (task) {
        useHistoryStore.getState().push({
          label: `Delete task "${task.title}"`,
          undo: () => restoreEntity('tasks', taskId),
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

    // Server-side rejects this (403) unless the caller is the workspace's Owner/Admin — see
    // app/api/tasks/[id]/route.ts. Same shape as Space/Folder/List's own privacy toggle (each
    // independent, see PLANNING.md), just Task's own dedicated action since (unlike those three)
    // Task fields already each have their own separate optimisticSetX action rather than one
    // generic patch entry point.
    setTaskPrivacy: (taskId, isPrivate, accessJson) => {
      const oldTask = get().tasks.find((t) => t.id === taskId);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, isPrivate, accessJson } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrivate, accessJson }),
      });
      if (oldTask) {
        useHistoryStore.getState().push({
          label: 'Change task access',
          undo: () => get().setTaskPrivacy(taskId, oldTask.isPrivate, oldTask.accessJson),
          redo: () => get().setTaskPrivacy(taskId, isPrivate, accessJson),
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

    // Manual Planner lane pin (see lib/ganttLayout.ts's assignLanes) — same "trivial field,
    // optimistic set + PATCH + undo/redo" shape as optimisticSetDates just above.
    optimisticSetCalendarLane: (taskId, lane) => {
      const oldLane = get().tasks.find((t) => t.id === taskId)?.calendarLane ?? null;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, calendarLane: lane } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarLane: lane }),
      });
      useHistoryStore.getState().push({
        label: 'Change Planner lane',
        undo: () => get().optimisticSetCalendarLane(taskId, oldLane),
        redo: () => get().optimisticSetCalendarLane(taskId, lane),
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

    optimisticSetDescription: (taskId, description) => {
      const oldDescription = get().tasks.find((t) => t.id === taskId)?.description ?? null;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, description } : t)),
      }));
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, authorId: useSessionStore.getState().currentUserId }),
      }).then(() => {
        if (get().comments[taskId]) get().fetchComments(taskId);
      });
      if (oldDescription !== description) {
        useHistoryStore.getState().push({
          label: 'Edit description',
          undo: () => get().optimisticSetDescription(taskId, oldDescription),
          redo: () => get().optimisticSetDescription(taskId, description),
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

    createCustomField: async (spaceId, name, type, options = [], id, listId = null) => {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, spaceId, name, type, options, listId }),
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
        redo: () => get().createCustomField(spaceId, name, type, options, newField.id, listId),
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
        if (patch.isDnd !== undefined) oldPatch.isDnd = oldUser.isDnd;
        if (patch.roomId !== undefined) oldPatch.roomId = oldUser.roomId;
        if (patch.avatarUrl !== undefined) oldPatch.avatarUrl = oldUser.avatarUrl;
        if (patch.bio !== undefined) oldPatch.bio = oldUser.bio;
        if (patch.linkedinUrl !== undefined) oldPatch.linkedinUrl = oldUser.linkedinUrl;
        if (patch.websiteUrl !== undefined) oldPatch.websiteUrl = oldUser.websiteUrl;
        useHistoryStore.getState().push({
          label: 'Update team member',
          undo: () => get().updateUser(userId, oldPatch),
          redo: () => get().updateUser(userId, patch),
        });
      }
    },

    setUsername: async (userId, username) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: data?.error || 'Could not update username' };
      }
      const user = await res.json();
      set((state) => ({ users: state.users.map((u) => (u.id === userId ? { ...u, username: user.username } : u)) }));
      return { ok: true };
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
        if (patch.textColor !== undefined) oldPatch.textColor = oldRoom.textColor;
        if (patch.order !== undefined) oldPatch.order = oldRoom.order;
        if (patch.isDnd !== undefined) oldPatch.isDnd = oldRoom.isDnd;
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
            await get().updateRoom(room.id, { order: room.order, icon: room.icon, color: room.color, isDnd: room.isDnd });
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

    // No undo/redo here (unlike createSpace/createRoom) — there's no delete-workspace route yet,
    // out of scope for the multi-workspace feature this session. Refetches rather than hand-
    // splicing a new workspace into local state, since the fully-shaped nested include (spaces,
    // rooms, members) is nontrivial to fake locally and this is a rare, deliberate action.
    createWorkspace: async (name, userId, opts) => {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userId, orgType: opts?.orgType, workEmail: opts?.workEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: data?.error || `Could not create workspace (${res.status})` };
      }
      const created = await res.json();
      await get().refetchWorkspaces();
      get().setActiveWorkspaceId(created.id);
      return { ok: true };
    },

    // Editing the workspace-identity fields set at creation (backlog #2) — Owner/Admin-gated
    // server-side (see PATCH /api/workspaces/[id]/route.ts), same tier every other
    // workspace-identity change already requires.
    updateWorkspaceDetails: async (workspaceId, patch) => {
      set((state) => ({
        workspaces: state.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, ...patch } : ws)),
      }));
      await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    },

    fetchMemberInvites: async () => {
      try {
        const res = await fetch('/api/workspace-member-invites');
        if (!res.ok) return;
        set({ memberInvitesIncoming: await res.json() });
      } catch (error) {
        console.error('Failed to fetch workspace member invites:', error);
      }
    },

    acceptMemberInvite: async (id) => {
      const res = await fetch(`/api/workspace-member-invites/${id}/accept`, { method: 'POST' });
      if (!res.ok) return;
      set((state) => ({ memberInvitesIncoming: state.memberInvitesIncoming.filter((i) => i.id !== id) }));
      const { workspaceId } = await res.json();
      await get().refetchWorkspaces();
      if (workspaceId) get().setActiveWorkspaceId(workspaceId);
    },

    declineMemberInvite: async (id) => {
      set((state) => ({ memberInvitesIncoming: state.memberInvitesIncoming.filter((i) => i.id !== id) }));
      await fetch(`/api/workspace-member-invites/${id}`, { method: 'DELETE' });
    },

    sendWorkspaceMemberInvite: async (workspaceId, toUserId, role) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/member-invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: data?.error || 'Could not send invite' };
      }
      return { ok: true };
    },

    addWorkspaceMember: async (workspaceId, userId) => {
      const user = get().users.find((u) => u.id === userId);
      if (!user) return;
      // Always added as 'member' — matches the server (app/api/workspaces/[id]/members/route.ts
      // always creates the row that way too; promoting to Admin is always a separate action).
      set((state) => ({
        workspaces: state.workspaces.map((ws) =>
          ws.id === workspaceId ? { ...ws, members: [...ws.members, { ...user, workspaceRole: 'member' as const }] } : ws
        ),
      }));
      await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      useHistoryStore.getState().push({
        label: `Add ${user.name} to workspace`,
        undo: () => get().removeWorkspaceMember(workspaceId, userId),
        redo: () => get().addWorkspaceMember(workspaceId, userId),
      });
    },

    removeWorkspaceMember: async (workspaceId, userId) => {
      set((state) => ({
        workspaces: state.workspaces.map((ws) =>
          ws.id === workspaceId ? { ...ws, members: ws.members.filter((m) => m.id !== userId) } : ws
        ),
      }));
      await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
      useHistoryStore.getState().push({
        label: 'Remove workspace member',
        undo: () => get().addWorkspaceMember(workspaceId, userId),
        redo: () => get().removeWorkspaceMember(workspaceId, userId),
      });
    },

    changeWorkspaceMemberRole: async (workspaceId, userId, role) => {
      const oldRole = get()
        .workspaces.find((w) => w.id === workspaceId)
        ?.members.find((m) => m.id === userId)?.workspaceRole;
      set((state) => ({
        workspaces: state.workspaces.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, members: ws.members.map((m) => (m.id === userId ? { ...m, workspaceRole: role } : m)) }
            : ws
        ),
      }));
      await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (oldRole && oldRole !== 'owner' && oldRole !== role) {
        useHistoryStore.getState().push({
          label: `Change member role to ${role}`,
          undo: () => get().changeWorkspaceMemberRole(workspaceId, userId, oldRole),
          redo: () => get().changeWorkspaceMemberRole(workspaceId, userId, role),
        });
      }
    },

    // No optimistic local removal — the caller is about to lose access to this workspace
    // entirely, and refetchWorkspaces() (which the UI calls right after) naturally drops it once
    // the server confirms it's gone.
    deleteWorkspace: async (workspaceId) => {
      await fetch(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
    },

    createRole: async (workspaceId, name, color) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const created = await res.json();
      set((state) => ({
        workspaces: state.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, roles: [...ws.roles, created] } : ws)),
      }));
    },

    updateRole: async (workspaceId, roleId, patch) => {
      set((state) => ({
        workspaces: state.workspaces.map((ws) =>
          ws.id === workspaceId ? { ...ws, roles: ws.roles.map((r) => (r.id === roleId ? { ...r, ...patch } : r)) } : ws
        ),
      }));
      await fetch(`/api/workspaces/${workspaceId}/roles/${roleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    },

    deleteRole: async (workspaceId, roleId) => {
      set((state) => ({
        workspaces: state.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, roles: ws.roles.filter((r) => r.id !== roleId) } : ws)),
      }));
      await fetch(`/api/workspaces/${workspaceId}/roles/${roleId}`, { method: 'DELETE' });
    },

    assignRole: async (workspaceId, roleId, userId) => {
      set((state) => ({
        workspaces: state.workspaces.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, roles: ws.roles.map((r) => (r.id === roleId ? { ...r, memberIds: [...r.memberIds, userId] } : r)) }
            : ws
        ),
      }));
      await fetch(`/api/workspaces/${workspaceId}/roles/${roleId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    },

    unassignRole: async (workspaceId, roleId, userId) => {
      set((state) => ({
        workspaces: state.workspaces.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, roles: ws.roles.map((r) => (r.id === roleId ? { ...r, memberIds: r.memberIds.filter((id) => id !== userId) } : r)) }
            : ws
        ),
      }));
      await fetch(`/api/workspaces/${workspaceId}/roles/${roleId}/members/${userId}`, { method: 'DELETE' });
    },

    // Find-or-create the caller's personal workspace/Space/List behind the sidebar's private "My
    // tasks" — called lazily on first use, not eagerly at startup. No undo/redo (there's nothing
    // meaningful to undo — creating it is idempotent from the caller's perspective either way).
    // Refetches `workspaces` local state if it doesn't already contain this id — required since
    // "My tasks" now switches into this workspace via setActiveWorkspaceId right after calling
    // this (the personal-workspace rework's whole point). On the very first-ever call in a
    // session the workspace was just created server-side and isn't in the client's already-loaded
    // `workspaces` array yet — without this, setActiveWorkspaceId's own `workspaces.find(...)`
    // silently misses it and falls back to a different (real team) workspace instead, which is
    // what caused "must refresh before new tasks under My tasks show up": every subsequent action
    // (task creation, list selection) was actually operating on the wrong workspace's data until a
    // full page reload re-ran fetchInitialData and picked up the real one.
    ensurePersonalWorkspace: async (userId) => {
      const res = await fetch('/api/workspaces/personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const result = await res.json();
      if (!get().workspaces.some((w) => w.id === result.workspaceId)) {
        await get().refetchWorkspaces();
      }
      return result;
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
        if (patch.textColor !== undefined) oldPatch.textColor = oldSpace.textColor;
        if (patch.icon !== undefined) oldPatch.icon = oldSpace.icon;
        if (patch.description !== undefined) oldPatch.description = oldSpace.description;
        if (patch.coverImageUrl !== undefined) oldPatch.coverImageUrl = oldSpace.coverImageUrl;
        if (patch.isPrivate !== undefined) oldPatch.isPrivate = oldSpace.isPrivate;
        if (patch.accessJson !== undefined) oldPatch.accessJson = oldSpace.accessJson;
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
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.filter((s) => s.id !== spaceId),
        })),
      }));
      const res = await fetch(`/api/spaces/${spaceId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        await get().refetchWorkspaces();
        alert('Kunne ikke slette space — prøv igjen.');
        return;
      }
      if (space) {
        useHistoryStore.getState().push({
          label: `Delete space "${space.name}"`,
          undo: () => restoreEntity('spaces', spaceId),
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
        if (patch.textColor !== undefined) oldPatch.textColor = oldList.textColor;
        if (patch.icon !== undefined) oldPatch.icon = oldList.icon;
        if (patch.isPrivate !== undefined) oldPatch.isPrivate = oldList.isPrivate;
        if (patch.accessJson !== undefined) oldPatch.accessJson = oldList.accessJson;
        useHistoryStore.getState().push({
          label: 'Update list',
          undo: () => get().updateList(spaceId, listId, oldPatch),
          redo: () => get().updateList(spaceId, listId, patch),
        });
      }
    },

    archiveList: async (spaceId, listId, archived) => {
      // Optimistically flips both the List's own flag and every Task inside it, so the sidebar
      // tree and task table both reflect the cascade immediately without waiting on a refetch.
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, archived } : l)) } : s
          ),
        })),
        tasks: state.tasks.map((t) => (t.listId === listId ? { ...t, archived } : t)),
      }));
      await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      useHistoryStore.getState().push({
        label: archived ? 'Archive list' : 'Restore list',
        undo: () => get().archiveList(spaceId, listId, !archived),
        redo: () => get().archiveList(spaceId, listId, archived),
      });
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
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, lists: s.lists.filter((l) => l.id !== listId) } : s)),
        })),
      }));
      const res = await fetch(`/api/lists/${listId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        await get().refetchWorkspaces();
        alert('Kunne ikke slette listen — prøv igjen.');
        return;
      }
      if (list) {
        useHistoryStore.getState().push({
          label: `Delete list "${list.name}"`,
          undo: () => restoreEntity('lists', listId),
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
        if (patch.textColor !== undefined) oldPatch.textColor = oldFolder.textColor;
        if (patch.icon !== undefined) oldPatch.icon = oldFolder.icon;
        if (patch.order !== undefined) oldPatch.order = oldFolder.order;
        if (patch.isPrivate !== undefined) oldPatch.isPrivate = oldFolder.isPrivate;
        if (patch.accessJson !== undefined) oldPatch.accessJson = oldFolder.accessJson;
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
      const folder = space?.folders.find((f) => f.id === folderId);
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
      const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        await get().refetchWorkspaces();
        alert('Kunne ikke slette mappen — prøv igjen.');
        return;
      }
      if (folder) {
        useHistoryStore.getState().push({
          label: `Delete folder "${folder.name}"`,
          undo: () => restoreEntity('folders', folderId),
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
      const folder = space?.docFolders.find((f) => f.id === folderId);
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
      const res = await fetch(`/api/doc-folders/${folderId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        await get().refetchWorkspaces();
        alert('Kunne ikke slette dokumentmappen — prøv igjen.');
        return;
      }
      if (folder) {
        useHistoryStore.getState().push({
          label: `Delete doc folder "${folder.name}"`,
          undo: () => restoreEntity('doc-folders', folderId),
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
            boardFolderId: opts?.boardFolderId,
            parentId: opts?.parentId,
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
            spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, spaceDocs: [...s.spaceDocs, { ...doc, contributorIds: [] }] } : s)),
          })),
        }));
        if (!opts?.id) {
          useHistoryStore.getState().push({
            label: 'Create document',
            undo: () => get().deleteSpaceDoc(doc.id, spaceId),
            redo: async () => {
              await get().createSpaceDoc(spaceId, folderId, {
                id: doc.id,
                title: doc.title,
                content: doc.content,
                order: doc.order,
                parentId: doc.parentId,
                boardFolderId: doc.boardFolderId,
              });
            },
          });
        }
        return doc;
      } catch (error) {
        console.error('Failed to create document:', error);
        return null;
      }
    },

    moveDocParent: async (spaceId, docId, parentId) => {
      const oldDoc = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.spaceDocs.find((d) => d.id === docId);
      const oldParentId = oldDoc?.parentId ?? null;
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) =>
            s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.map((d) => (d.id === docId ? { ...d, parentId } : d)) } : s
          ),
        })),
      }));
      await fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      useHistoryStore.getState().push({
        label: 'Move page',
        undo: () => get().moveDocParent(spaceId, docId, oldParentId),
        redo: () => get().moveDocParent(spaceId, docId, parentId),
      });
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
        if (patch.color !== undefined) oldPatch.color = oldDoc.color;
        if (patch.textColor !== undefined) oldPatch.textColor = oldDoc.textColor;
        if (patch.ownerId !== undefined) oldPatch.ownerId = oldDoc.ownerId;
        if (patch.contributorIds !== undefined) oldPatch.contributorIds = oldDoc.contributorIds;
        if (patch.coverImageUrl !== undefined) oldPatch.coverImageUrl = oldDoc.coverImageUrl;
        if (patch.subtitle !== undefined) oldPatch.subtitle = oldDoc.subtitle;
        if (patch.pageWidth !== undefined) oldPatch.pageWidth = oldDoc.pageWidth;
        if (patch.showLastModified !== undefined) oldPatch.showLastModified = oldDoc.showLastModified;
        useHistoryStore.getState().pushCoalesced(`doc-${docId}`, {
          label: 'Edit document',
          undo: () => get().updateSpaceDoc(docId, spaceId, oldPatch),
          redo: () => get().updateSpaceDoc(docId, spaceId, patch),
        });
      }
    },

    // Cascades to the doc's own subpage subtree server-side (lib/archiveCascade.ts) — a plain
    // local patch can't express that recursion, so this refetches afterward rather than trying to
    // hand-walk the subtree client-side too (mirrors how cross-Space moves elsewhere already
    // prefer a refetch over an elaborate local patch for the same reason).
    archiveSpaceDoc: async (spaceId, docId, archived) => {
      await fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      await get().refetchWorkspaces();
      useHistoryStore.getState().push({
        label: archived ? 'Archive document' : 'Restore document',
        undo: () => get().archiveSpaceDoc(spaceId, docId, !archived),
        redo: () => get().archiveSpaceDoc(spaceId, docId, archived),
      });
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

    // Independent from moveSpaceDoc above (that one moves between DocFolders, the Docs tab's own
    // tree) — this moves a Doc between real Folders in the Tasks-tab sidebar. Exact mirror of
    // moveList's shape, just targeting Doc's boardFolderId instead of List's folderId.
    moveDocToBoardFolder: async (spaceId, docId, boardFolderId, targetSpaceId) => {
      const oldDoc = get()
        .workspaces.flatMap((w) => w.spaces)
        .find((s) => s.id === spaceId)
        ?.spaceDocs.find((d) => d.id === docId);
      const oldBoardFolderId = oldDoc?.boardFolderId ?? null;

      if (targetSpaceId && targetSpaceId !== spaceId) {
        await fetch(`/api/docs/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardFolderId, spaceId: targetSpaceId }),
        });
        await get().refetchWorkspaces();
      } else {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            spaces: ws.spaces.map((s) =>
              s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.map((d) => (d.id === docId ? { ...d, boardFolderId } : d)) } : s
            ),
          })),
        }));
        await fetch(`/api/docs/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardFolderId }),
        });
      }

      useHistoryStore.getState().push({
        label: 'Move document',
        undo: () => get().moveDocToBoardFolder(targetSpaceId ?? spaceId, docId, oldBoardFolderId, spaceId),
        redo: () => get().moveDocToBoardFolder(spaceId, docId, boardFolderId, targetSpaceId),
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
      // Subpages have no folderId of their own, only a parentId chain — collect the full subtree
      // locally (server-side cascadeDoc already removes it in the DB) so optimistic state matches.
      const removedIds = new Set([docId]);
      if (space) {
        let frontier = [docId];
        while (frontier.length > 0) {
          const children = space.spaceDocs.filter((d) => d.parentId && frontier.includes(d.parentId));
          frontier = children.map((d) => d.id);
          frontier.forEach((id) => removedIds.add(id));
        }
      }
      set((state) => ({
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          spaces: ws.spaces.map((s) => (s.id === spaceId ? { ...s, spaceDocs: s.spaceDocs.filter((d) => !removedIds.has(d.id)) } : s)),
        })),
      }));
      const res = await fetch(`/api/docs/${docId}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        await get().refetchWorkspaces();
        alert('Kunne ikke slette dokumentet — prøv igjen.');
        return;
      }
      if (doc) {
        useHistoryStore.getState().push({
          label: `Delete document "${doc.title}"`,
          undo: () => restoreEntity('docs', docId),
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

    addComment: async (taskId, body) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
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
              body: JSON.stringify({ id: comment.id, body, type: comment.type }),
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

    // Same fetch-replaces-wholesale / append-after-server-response shape as fetchComments/
    // addComment/deleteComment above, keyed by eventId — no authorId param (unlike addComment's
    // legacy one) since the route always uses the real signed-in caller now regardless of what's
    // sent (see POST /api/events/[id]/comments/route.ts).
    fetchEventComments: async (eventId) => {
      try {
        const res = await fetch(`/api/events/${eventId}/comments`);
        if (!res.ok) return;
        const comments = await res.json();
        set((state) => ({ eventComments: { ...state.eventComments, [eventId]: comments } }));
      } catch (error) {
        console.error('Failed to fetch event comments:', error);
      }
    },

    addEventComment: async (eventId, body) => {
      try {
        const res = await fetch(`/api/events/${eventId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) {
          console.error('Event comment API returned an error:', res.status);
          return;
        }
        const comment = await res.json();
        set((state) => ({
          eventComments: { ...state.eventComments, [eventId]: [...(state.eventComments[eventId] || []), comment] },
        }));
      } catch (error) {
        console.error('Failed to send event comment:', error);
      }
    },

    deleteEventComment: async (eventId, commentId) => {
      set((state) => ({
        eventComments: { ...state.eventComments, [eventId]: (state.eventComments[eventId] || []).filter((c) => c.id !== commentId) },
      }));
      await fetch(`/api/events/${eventId}/comments/${commentId}`, { method: 'DELETE' });
    },

    // Same fetch-replaces-wholesale / append-after-server-response / optimistic-delete shape as
    // fetchComments/addComment/deleteComment above — authorId comes straight from the real signed-
    // in identity (useSessionStore), not a "comment as ..." picker (that's a pre-auth artifact on
    // the task panel, not worth replicating for a new feature).
    fetchDocComments: async (docId) => {
      try {
        const res = await fetch(`/api/docs/${docId}/comments`);
        if (!res.ok) return;
        const docComments = await res.json();
        set((state) => ({ docComments: { ...state.docComments, [docId]: docComments } }));
      } catch (error) {
        console.error('Failed to fetch doc comments:', error);
      }
    },

    addDocComment: async (docId, opts) => {
      try {
        const authorId = useSessionStore.getState().currentUserId;
        const res = await fetch(`/api/docs/${docId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...opts, authorId }),
        });
        if (!res.ok) {
          console.error('Doc comment API returned an error:', res.status);
          return null;
        }
        const comment = await res.json();
        set((state) => ({
          docComments: { ...state.docComments, [docId]: [...(state.docComments[docId] || []), comment] },
        }));
        useHistoryStore.getState().push({
          label: 'Add comment',
          undo: () => get().deleteDocComment(docId, comment.id),
          redo: async () => {
            await get().addDocComment(docId, { ...opts, id: comment.id });
          },
        });
        return comment;
      } catch (error) {
        console.error('Failed to send doc comment:', error);
        return null;
      }
    },

    resolveDocComment: async (docId, commentId, resolved) => {
      set((state) => ({
        docComments: {
          ...state.docComments,
          [docId]: (state.docComments[docId] || []).map((c) => (c.id === commentId ? { ...c, resolved } : c)),
        },
      }));
      await fetch(`/api/docs/${docId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      });
    },

    deleteDocComment: async (docId, commentId) => {
      set((state) => ({
        docComments: {
          ...state.docComments,
          [docId]: (state.docComments[docId] || []).filter((c) => c.id !== commentId && c.parentId !== commentId),
        },
      }));
      await fetch(`/api/docs/${docId}/comments/${commentId}`, { method: 'DELETE' });
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
      const res = await fetch(`/api/docs/${docId}${authorId ? `?authorId=${authorId}` : ''}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        await get().fetchDocs(taskId);
        alert('Kunne ikke slette dokumentet — prøv igjen.');
        return;
      }
      if (get().comments[taskId]) get().fetchComments(taskId);
      if (doc) {
        useHistoryStore.getState().push({
          label: `Delete document "${doc.title}"`,
          // Task-scoped docs live in the store's lazily-loaded `docs[taskId]` cache, not in
          // `workspaces`/`tasks` — restoreEntity's blanket refetch wouldn't touch it, so refresh
          // that cache directly instead.
          undo: async () => {
            await fetch(`/api/docs/${docId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ restore: true }),
            });
            await get().fetchDocs(taskId);
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

    restoreFromTrash: async (kind, id) => {
      await restoreEntity(kind, id);
    },

    // Not undoable — this is the one truly destructive action in the app (real cascade delete
    // via Prisma's onDelete: Cascade FKs), reachable only from inside the Trash panel on an
    // already soft-deleted item.
    permanentlyDeleteFromTrash: async (kind, id) => {
      await fetch(`/api/${kind}/${id}?permanent=true`, { method: 'DELETE' });
    },
  };
});

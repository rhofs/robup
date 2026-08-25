'use client';

import { useMemo, useState } from 'react';
import { Phone, Pencil, ArrowLeft, Briefcase, Smile, DoorOpen } from 'lucide-react';
import { HierarchyWorkspace, HierarchyRoom, AppUser, Task, StatusDef } from '../store/useTaskStore';
import OfficeRooms from './OfficeRooms';
import RoomDetail from './RoomDetail';

// Huly-style "office" — the HQ Building floor plan of the team (OfficeRooms.tsx), a room's own
// detail view (RoomDetail.tsx) once one is stepped into, and (once a person is picked) their own
// page: contact info + every task assigned to them across every Space. A person page takes
// priority if somehow both a user and a room are selected — mirrors how every other "most
// specific wins" nav field elsewhere in the app already resolves. No Space/Folder concept for
// people themselves, so this stays flatter than FolderTree.
type OfficePageProps = {
  users: AppUser[];
  activeUserId: string | null;
  activeRoomId: string | null;
  // The workspace Office is actually scoped to right now — previously this component grabbed
  // `workspaces[0]` internally (whichever real workspace happened to fetch first), completely
  // ignoring which one was actually active. For anyone in more than one real workspace, that meant
  // Office silently kept showing the same one workspace's rooms/roster no matter which was
  // switched to — reported live as a phantom team member who "isn't me" and can't be clicked into
  // (almost certainly someone from the *other* workspace, wrongly folded into this one's Lobby),
  // and the Lobby's "Alle har et kontor" empty-state firing when it clearly shouldn't have (same
  // wrong-membership-set cause). `workspaces` (plural, unchanged) is still needed separately below
  // — a team member's own Tasks list can include tasks from *any* workspace they and the viewer
  // both belong to, not just this one.
  workspace: HierarchyWorkspace | null;
  workspaces: HierarchyWorkspace[];
  currentUserId: string | null;
  canManage: boolean;
  tasks: Task[];
  statuses: StatusDef[];
  onSelectUser: (userId: string | null) => void;
  onSelectRoom: (roomId: string | null) => void;
  onOpenTask: (taskId: string) => void;
  onUpdatePhone: (userId: string, phone: string | null) => void;
  onUpdateUserField: (userId: string, field: 'title' | 'status', value: string | null) => void;
  onDeleteRoomRequest: (room: HierarchyRoom) => void;
  onRequestRemoveMember: (user: AppUser) => void;
  onStartDM: (userId: string) => void;
  onOpenInviteSettings: () => void;
};

export default function OfficePage({
  users,
  activeUserId,
  activeRoomId,
  workspace,
  workspaces,
  currentUserId,
  canManage,
  tasks,
  statuses,
  onSelectUser,
  onSelectRoom,
  onOpenTask,
  onUpdatePhone,
  onUpdateUserField,
  onDeleteRoomRequest,
  onRequestRemoveMember,
  onStartDM,
  onOpenInviteSettings,
}: OfficePageProps) {
  // taskId's List/Space aren't embedded on Task itself — build the lookup once from the tree,
  // same shape as the cross-Space breadcrumbs elsewhere in the app (e.g. QuickCreatePopover).
  const listSpaceById = useMemo(() => {
    const map = new Map<string, { spaceName: string; listName: string }>();
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        for (const list of space.lists) {
          map.set(list.id, { spaceName: space.name, listName: list.name });
        }
      }
    }
    return map;
  }, [workspaces]);

  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  // `users` is the app-wide registered-user list (used elsewhere for task-assignee pickers etc.)
  // — Office needs to show only THIS workspace's members, otherwise someone just removed via the
  // manage popover (or who simply isn't in this workspace at all) would still linger in the
  // Lobby/rooms forever, since roomId placement is a plain field on User with no workspace scoping
  // of its own. Scoping here, once, keeps every Office view (rooms, Lobby, profile lookup)
  // consistent without touching the global `users` list's other, unrelated uses.
  const officeUsers = useMemo(
    () => (workspace ? users.filter((u) => workspace.members.some((m) => m.id === u.id)) : []),
    [users, workspace]
  );

  const activeUser = officeUsers.find((u) => u.id === activeUserId) ?? null;
  const activeRoom = !activeUser ? (workspaces.flatMap((w) => w.rooms).find((r) => r.id === activeRoomId) ?? null) : null;

  if (activeRoom && workspace) {
    return (
      <RoomDetail
        room={activeRoom}
        members={officeUsers.filter((u) => u.roomId === activeRoom.id)}
        workspace={workspace}
        currentUserId={currentUserId}
        canManage={canManage}
        onBack={() => onSelectRoom(null)}
        onSelectUser={onSelectUser}
        onRequestRemoveMember={onRequestRemoveMember}
        onStartDM={onStartDM}
      />
    );
  }

  if (!activeUser) {
    if (!workspace) return null;
    return (
      <OfficeRooms
        workspace={workspace}
        currentUserId={currentUserId}
        canManage={canManage}
        users={officeUsers}
        allUsers={users}
        tasks={tasks}
        onSelectUser={(id) => onSelectUser(id)}
        onSelectRoom={(id) => onSelectRoom(id)}
        onDeleteRoomRequest={onDeleteRoomRequest}
        onRequestRemoveMember={onRequestRemoveMember}
        onStartDM={onStartDM}
        onOpenInviteSettings={onOpenInviteSettings}
      />
    );
  }

  const myTasks = tasks
    .filter((t) => !t.archived && t.assignees.some((a) => a.id === activeUser.id))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));

  // Which room this person sits in, if any — otherwise unresolvable from this page alone (the
  // floor plan is the only other place it's shown), so surface it here too.
  const activeUserRoom = activeUser.roomId ? (workspace?.rooms.find((r) => r.id === activeUser.roomId) ?? null) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button
        onClick={() => {
          // "Back to team" always means the top-level HQ Building, even if this person's page was
          // reached from inside a room's own detail view (RoomDetail's member list) — clearing
          // both keeps the button's label honest regardless of entry path.
          onSelectUser(null);
          onSelectRoom(null);
        }}
        className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer flex items-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" /> Back to team
      </button>

      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded p-5 flex items-center gap-4">
        <span
          className="w-16 h-16 rounded-full text-lg font-bold flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: activeUser.color }}
        >
          {activeUser.initials}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white">{activeUser.name}</span>
            {activeUser.status && <span className="text-xs">{activeUser.status}</span>}
          </div>
          <EditableField
            icon={Briefcase}
            value={activeUser.title}
            placeholder="Legg til tittel..."
            onCommit={(v) => onUpdateUserField(activeUser.id, 'title', v)}
          />
          <EditableField
            icon={Smile}
            value={activeUser.status}
            placeholder="Sett status (f.eks. ☕ På pause)..."
            onCommit={(v) => onUpdateUserField(activeUser.id, 'status', v)}
          />
          <EditableField icon={Phone} value={activeUser.phone} placeholder="Add phone number..." onCommit={(v) => onUpdatePhone(activeUser.id, v)} />
          <button
            onClick={() => {
              // Jump to the floor plan — clearing activeUser is what makes OfficePage render
              // OfficeRooms again; a room's own "step inside" view still starts from there.
              onSelectUser(null);
              onSelectRoom(null);
            }}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer"
          >
            <DoorOpen className="w-3 h-3 shrink-0" />
            {activeUserRoom ? (
              <>Sits in <span className="text-neutral-300">{activeUserRoom.icon || '🏠'} {activeUserRoom.name}</span></>
            ) : (
              <span className="italic">Not assigned to a room — Lobby</span>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Tasks ({myTasks.length})</h3>
        {myTasks.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
            No assigned tasks.
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
            {myTasks.map((t) => {
              const loc = listSpaceById.get(t.listId);
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-neutral-800/30 transition cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-200 truncate">{t.title}</div>
                    {loc && (
                      <div className="text-[10px] text-neutral-500 truncate">
                        {loc.spaceName} / {loc.listName}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded border shrink-0"
                    style={{ color: statusColorOf(t.status), borderColor: statusColorOf(t.status) + '55', backgroundColor: statusColorOf(t.status) + '20' }}
                  >
                    {t.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function EditableField({
  icon: Icon,
  value,
  placeholder,
  onCommit,
}: {
  icon: typeof Phone;
  value: string | null;
  placeholder: string;
  onCommit: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value || '');
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="group flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer">
      <Icon className="w-3 h-3 shrink-0" />
      {value || <span className="italic text-neutral-500">{placeholder}</span>}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 shrink-0" />
    </button>
  );
}

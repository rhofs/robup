'use client';

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Megaphone, Pencil, Plus, Trash2, Users as UsersIcon, DoorOpen, DoorClosed, Maximize2, UserPlus, Link2 } from 'lucide-react';
import { useTaskStore, type HierarchyWorkspace, type HierarchyRoom, type AppUser, type Task } from '../store/useTaskStore';
import ManageableAvatar from './ManageableAvatar';
import FloatingPopover from './FloatingPopover';

// The "HQ Building" Office home view — a message-of-the-day banner plus a top-down floor plan:
// Rooms render as boxes in a grid (auto-placed by `order`, left-to-right/top-to-bottom — no free
// x/y positioning, see PLANNING.md), a Lobby box for unassigned people. Reuses the app's single
// shared DndContext (page.tsx) via id-prefix dispatch (`person-drag:`/`room-drag:`/`room-drop:`)
// rather than a nested context — same mechanics as the old vertical "building floors" version,
// just laid out as a grid instead of a stack; reordering itself (app/page.tsx's
// reorderRoomSiblings) is purely order-value swapping and doesn't care which axis rooms render on.
// Decorating a room (icon/color) and its own detail view live in RoomDetail.tsx, reached via each
// box's expand button. Avatars are ManageableAvatar (not the old DraggableAvatar) — Office is now
// also where Owner/Admins manage who's on the team (promote/demote, assign Roles, remove).
type OfficeRoomsProps = {
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean;
  users: AppUser[];
  // The app-wide registered-user directory (unfiltered) — needed for the "+ Invite" picker's
  // quick-add list (existing users not yet a member here), distinct from `users` above which is
  // already scoped down to this workspace's own roster.
  allUsers: AppUser[];
  tasks: Task[];
  onSelectUser: (userId: string) => void;
  onSelectRoom: (roomId: string) => void;
  onDeleteRoomRequest: (room: HierarchyRoom) => void;
  onRequestRemoveMember: (user: AppUser) => void;
  onStartDM: (userId: string) => void;
  // Opens the full invite flow (link generation, targeted Connection invites) — reuses
  // SettingsPanel's existing 'invite' tab rather than rebuilding that flow a second time here.
  onOpenInviteSettings: () => void;
};

export default function OfficeRooms({
  workspace,
  currentUserId,
  canManage,
  users,
  allUsers,
  tasks,
  onSelectUser,
  onSelectRoom,
  onDeleteRoomRequest,
  onRequestRemoveMember,
  onStartDM,
  onOpenInviteSettings,
}: OfficeRoomsProps) {
  // sendWorkspaceMemberInvite, NOT addWorkspaceMember: this button is labelled "Invite" and used
  // to call the latter, which writes a WorkspaceMembership row directly — the person was simply
  // in the workspace, with no request and nothing to accept or decline. Reported live: "jeg adda
  // Yang som connection, og når jeg invita henne til Workspacen ble hun bare lagt til, ingenting
  // å bekrefte/avslå." That contradicted both the label and WorkspaceMemberInvite's own stated
  // design ("a real accept step ... not an instant membership"), and it matters beyond wording:
  // joining a workspace exposes all of its content to you and makes you assignable in it, so it
  // is not something anyone should be able to do to someone else unilaterally. Settings' own
  // Invite tab already used the invite route; this surface was the odd one out.
  const { createRoom, sendWorkspaceMemberInvite } = useTaskStore();
  // Per-user feedback inside the popover — an invite that vanishes silently is indistinguishable
  // from a tap that did nothing, which is exactly what the old direct-add never had to solve
  // because the person appeared in the room immediately.
  const [inviteResult, setInviteResult] = useState<{ userId: string; text: string; ok: boolean } | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomDraft, setNewRoomDraft] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const nonMemberUsers = allUsers.filter((u) => !users.some((m) => m.id === u.id));

  const unassigned = users.filter((u) => u.roomId === null);
  const taskCountFor = (userIds: string[]) =>
    tasks.filter((t) => !t.archived && t.assignees.some((a) => userIds.includes(a.id))).length;

  const commitNewRoom = () => {
    const trimmed = newRoomDraft.trim();
    if (trimmed) createRoom(workspace.id, trimmed);
    setNewRoomDraft('');
    setCreatingRoom(false);
  };

  // Grid reads left-to-right, top-to-bottom in ascending `order` — same field the old vertical
  // stack sorted descending (newest on top); a grid has no "top of the stack," so ascending here
  // just means "most recently added room ends up last," the more natural grid reading order.
  const rooms = [...workspace.rooms].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <FloatingPopover
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            align="right"
            panelClassName="w-64 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1.5"
            anchor={
              <button
                onClick={() => setInviteOpen((o) => !o)}
                className="text-[11px] font-medium px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" /> Invite
              </button>
            }
          >
            {nonMemberUsers.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-3 py-1">Invite to workspace</div>
                <div className="max-h-40 overflow-y-auto">
                  {nonMemberUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={async () => {
                        setInviteResult({ userId: u.id, text: 'Sending…', ok: true });
                        const res = await sendWorkspaceMemberInvite(workspace.id, u.id, 'member');
                        // Deliberately does not close the popover on success: the person does not
                        // appear anywhere until they accept, so closing immediately would leave no
                        // evidence the invite was sent at all.
                        setInviteResult({
                          userId: u.id,
                          text: res.ok ? 'Invite sent — waiting for them to accept' : res.error || 'Could not send invite',
                          ok: res.ok,
                        });
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
                    >
                      <span className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0" style={{ backgroundColor: u.color }}>
                        {u.initials}
                      </span>
                      <span className="truncate flex-1">{u.name}</span>
                      {inviteResult?.userId === u.id && (
                        <span className={`text-[9px] shrink-0 ${inviteResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                          {inviteResult.text}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-t border-neutral-800 my-1" />
              </>
            )}
            <button
              onClick={() => {
                setInviteOpen(false);
                onOpenInviteSettings();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" /> Invite by link or search…
            </button>
          </FloatingPopover>
        </div>
      )}
      <MessageBanner workspaceId={workspace.id} value={workspace.messageOfTheDay} />

      {/* Subtle graph-paper floor texture sells the "seen from above" read — a grid of rooms on a
          floor, not a list of cards. */}
      <div
        className="rounded border-4 border-neutral-800 p-3 grid grid-cols-2 sm:grid-cols-3 gap-3"
        style={{
          backgroundColor: 'rgba(23,23,23,0.4)',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        <LobbyBox users={unassigned} workspace={workspace} currentUserId={currentUserId} canManage={canManage} onSelectUser={onSelectUser} onRequestRemoveMember={onRequestRemoveMember} onStartDM={onStartDM} />

        {rooms.map((room) => {
          const members = users.filter((u) => u.roomId === room.id);
          return (
            <RoomBox
              key={room.id}
              room={room}
              members={members}
              workspace={workspace}
              currentUserId={currentUserId}
              canManage={canManage}
              taskCount={taskCountFor(members.map((m) => m.id))}
              onSelectUser={onSelectUser}
              onSelectRoom={() => onSelectRoom(room.id)}
              onDeleteRequest={() => onDeleteRoomRequest(room)}
              onRequestRemoveMember={onRequestRemoveMember}
              onStartDM={onStartDM}
            />
          );
        })}

        {creatingRoom ? (
          <div className="border-2 border-dashed border-blue-500 rounded p-3 flex items-center bg-neutral-900/60 min-h-[104px]">
            <input
              autoFocus
              value={newRoomDraft}
              onChange={(e) => setNewRoomDraft(e.target.value)}
              onBlur={commitNewRoom}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setNewRoomDraft('');
                  setCreatingRoom(false);
                }
              }}
              placeholder="Room name..."
              className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1.5 text-xs text-app-strong focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => setCreatingRoom(true)}
            className="border-2 border-dashed border-neutral-700 hover:border-blue-500/60 rounded p-3 min-h-[104px] flex flex-col items-center justify-center gap-1.5 text-neutral-500 hover:text-blue-400 cursor-pointer transition"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[11px]">Add a new room</span>
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBanner({ workspaceId, value }: { workspaceId: string; value: string | null }) {
  const { updateWorkspaceMessage } = useTaskStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    updateWorkspaceMessage(workspaceId, trimmed || null);
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
        rows={2}
        placeholder="Message of the day..."
        className="w-full bg-amber-500/10 border border-amber-500/40 rounded px-4 py-3 text-sm text-amber-100 focus:outline-none resize-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group w-full text-left bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/50 rounded px-4 py-3 flex items-start gap-2.5 cursor-text transition"
    >
      <Megaphone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      {value ? (
        <p className="text-sm text-amber-100 whitespace-pre-wrap flex-1">{value}</p>
      ) : (
        <p className="text-sm text-amber-200/50 italic flex-1">Legg til en melding for dagen...</p>
      )}
      <Pencil className="w-3 h-3 text-amber-400/60 opacity-0 group-hover:opacity-100 shrink-0 mt-1" />
    </button>
  );
}

type RoomBoxProps = {
  room: HierarchyRoom;
  members: AppUser[];
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean;
  taskCount: number;
  onSelectUser: (userId: string) => void;
  onSelectRoom: () => void;
  onDeleteRequest: () => void;
  onRequestRemoveMember: (user: AppUser) => void;
  onStartDM: (userId: string) => void;
};

// A top-down room: bordered rectangle (the walls), a small header strip (name/icon/controls), a
// "floor" area holding desks (member avatars), and a decorative door notch on the bottom wall —
// replaces the old FloorRoom's horizontal name-bar-plus-avatar-row look.
function RoomBox({ room, members, workspace, currentUserId, canManage, taskCount, onSelectUser, onSelectRoom, onDeleteRequest, onRequestRemoveMember, onStartDM }: RoomBoxProps) {
  const { updateRoom } = useTaskStore();
  // Combined drag+drop, same trick as before: setNodeRef covers the whole room box (both for
  // drag-rect measurement and as the drop target people are dragged onto), {...attributes}/
  // {...listeners} — the actual pointer handlers — go on just the header row, not the box root, so
  // they don't shadow each avatar's own useDraggable in the desk area underneath.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `room-drag:${room.id}` });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `room-drop:${room.id}` });
  const setNodeRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.name);

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== room.name) updateRoom(room.id, { name: trimmed });
    else setNameDraft(room.name);
  };

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded border-2 transition overflow-hidden ${
        room.isDnd
          ? 'border-red-500/40 bg-red-950/10 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.15)]'
          : isOver
            ? 'border-blue-500/60 bg-blue-500/5'
            : 'border-neutral-700 bg-neutral-900/70'
      } ${isDragging ? 'opacity-40' : ''}`}
      style={room.color && !room.isDnd ? { borderColor: room.color + '55' } : undefined}
    >
      <div {...attributes} {...listeners} className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-neutral-800/80 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">{room.icon || '🏠'}</span>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  setNameDraft(room.name);
                  setEditingName(false);
                }
              }}
              className="bg-neutral-950 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-app-strong focus:outline-none min-w-0"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-xs font-semibold text-neutral-200 truncate cursor-text text-left"
              style={{ color: room.textColor || undefined }}
            >
              {room.name}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-neutral-500 font-mono">{taskCount}</span>
          <button
            onClick={() => updateRoom(room.id, { isDnd: !room.isDnd })}
            title={room.isDnd ? 'Room is Do Not Disturb — click to clear' : 'Mark room Do Not Disturb'}
            className={`cursor-pointer transition ${room.isDnd ? 'text-red-400' : 'text-neutral-600 hover:text-neutral-300'}`}
          >
            {room.isDnd ? <DoorClosed className="w-3 h-3" /> : <DoorOpen className="w-3 h-3" />}
          </button>
          <button onClick={onSelectRoom} title="Step inside" className="text-neutral-600 hover:text-blue-400 cursor-pointer">
            <Maximize2 className="w-3 h-3" />
          </button>
          <button onClick={onDeleteRequest} title="Delete room" className="text-neutral-600 hover:text-red-400 cursor-pointer">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-1.5 min-h-[56px] p-2.5">
        {members.length === 0 && <span className="text-[10px] text-neutral-600 italic">Dra noen hit...</span>}
        {members.map((u) => (
          <DraggablePersonAvatar
            key={u.id}
            user={u}
            workspace={workspace}
            currentUserId={currentUserId}
            canManage={canManage}
            onRequestRemoveMember={onRequestRemoveMember}
            onStartDM={onStartDM}
            size="sm"
            onSelectUser={onSelectUser}
          />
        ))}
      </div>

      {/* Decorative door notch on the bottom wall — purely visual, sells the top-down floor-plan
          read; the actual open/DND toggle stays the labeled button above. */}
      <div className="absolute -bottom-[2px] left-1/2 -translate-x-1/2 w-6 h-[3px] bg-neutral-900" />
    </div>
  );
}

function LobbyBox({
  users,
  workspace,
  currentUserId,
  canManage,
  onSelectUser,
  onRequestRemoveMember,
  onStartDM,
}: {
  users: AppUser[];
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean;
  onSelectUser: (userId: string) => void;
  onRequestRemoveMember: (user: AppUser) => void;
  onStartDM: (userId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'room-drop:unassigned' });
  return (
    <div
      ref={setNodeRef}
      className={`rounded border-2 transition overflow-hidden ${isOver ? 'border-blue-500/60 bg-blue-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-amber-500/20 text-[10px] font-bold text-amber-200/70 uppercase tracking-wider">
        <UsersIcon className="w-3 h-3" /> Lobby
      </div>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[56px] p-2.5">
        {users.length === 0 && <span className="text-[10px] text-neutral-600 italic">Alle har et kontor 🎉</span>}
        {users.map((u) => (
          <DraggablePersonAvatar
            key={u.id}
            user={u}
            workspace={workspace}
            currentUserId={currentUserId}
            canManage={canManage}
            onRequestRemoveMember={onRequestRemoveMember}
            onStartDM={onStartDM}
            size="md"
            onSelectUser={onSelectUser}
          />
        ))}
      </div>
    </div>
  );
}

// Overlapping "collaborating" cluster look (negative margin + separation ring), individually
// draggable per person — the DnD wiring lives here (same as the old DraggableAvatar), composed
// with ManageableAvatar's manage-badge/popover rather than PersonAvatar directly.
function DraggablePersonAvatar({
  user,
  workspace,
  currentUserId,
  canManage,
  onRequestRemoveMember,
  onStartDM,
  onSelectUser,
  size,
}: {
  user: AppUser;
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean;
  onRequestRemoveMember: (user: AppUser) => void;
  onStartDM: (userId: string) => void;
  onSelectUser: (userId: string) => void;
  size: 'sm' | 'md';
}) {
  const { updateUser } = useTaskStore();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `person-drag:${user.id}` });
  return (
    <ManageableAvatar
      user={user}
      workspace={workspace}
      currentUserId={currentUserId}
      canManage={canManage}
      onRequestRemove={onRequestRemoveMember}
      onStartDM={onStartDM}
      size={size}
      onClick={() => onSelectUser(user.id)}
      showDndToggle
      onToggleDnd={() => updateUser(user.id, { isDnd: !user.isDnd })}
      dragRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className="ring-2 ring-neutral-900 hover:z-10 hover:scale-110"
    />
  );
}

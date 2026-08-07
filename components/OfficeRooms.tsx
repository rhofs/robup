'use client';

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Megaphone, Pencil, Plus, Trash2, Users as UsersIcon, DoorOpen, DoorClosed, Maximize2 } from 'lucide-react';
import { useTaskStore, HierarchyRoom, AppUser, Task } from '../store/useTaskStore';
import PersonAvatar from './PersonAvatar';

// The "HQ Building" Office home view — a message-of-the-day banner plus a stacked-floor building:
// Rooms render as floors (newest/highest `order` on top), a Lobby at the ground floor for
// unassigned people. Reuses the app's single shared DndContext (page.tsx) via id-prefix dispatch
// (`person-drag:`/`room-drag:`/`room-drop:`) rather than a nested context — same mechanics as the
// old flat card-grid version, just restyled into a connected vertical stack. Decorating a room
// (icon/color) and its DND detail live in RoomDetail.tsx, reached via each floor's expand button.
type OfficeRoomsProps = {
  workspaceId: string;
  messageOfTheDay: string | null;
  rooms: HierarchyRoom[];
  users: AppUser[];
  tasks: Task[];
  onSelectUser: (userId: string) => void;
  onSelectRoom: (roomId: string) => void;
  onDeleteRoomRequest: (room: HierarchyRoom) => void;
};

export default function OfficeRooms({
  workspaceId,
  messageOfTheDay,
  rooms,
  users,
  tasks,
  onSelectUser,
  onSelectRoom,
  onDeleteRoomRequest,
}: OfficeRoomsProps) {
  const { createRoom } = useTaskStore();
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomDraft, setNewRoomDraft] = useState('');

  const unassigned = users.filter((u) => u.roomId === null);
  const taskCountFor = (userIds: string[]) =>
    tasks.filter((t) => !t.archived && t.assignees.some((a) => userIds.includes(a.id))).length;

  const commitNewRoom = () => {
    const trimmed = newRoomDraft.trim();
    if (trimmed) createRoom(workspaceId, trimmed);
    setNewRoomDraft('');
    setCreatingRoom(false);
  };

  // New floors get built upward — highest `order` renders at the top of the stack, closest to
  // the roof; the Lobby is always the fixed ground floor at the very bottom.
  const floors = [...rooms].sort((a, b) => b.order - a.order);

  return (
    <div className="space-y-4">
      <MessageBanner workspaceId={workspaceId} value={messageOfTheDay} />

      <div className="border-x-4 border-t-4 border-neutral-800 rounded-t overflow-hidden">
        <div className="p-2.5 border-b border-dashed border-neutral-700 bg-neutral-900/40">
          {creatingRoom ? (
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
              placeholder="Floor name..."
              className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setCreatingRoom(true)}
              className="w-full text-[11px] text-neutral-500 hover:text-blue-400 cursor-pointer flex items-center justify-center gap-1.5 py-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add a new floor
            </button>
          )}
        </div>

        {floors.map((room) => {
          const members = users.filter((u) => u.roomId === room.id);
          return (
            <FloorRoom
              key={room.id}
              room={room}
              members={members}
              taskCount={taskCountFor(members.map((m) => m.id))}
              onSelectUser={onSelectUser}
              onSelectRoom={() => onSelectRoom(room.id)}
              onDeleteRequest={() => onDeleteRoomRequest(room)}
            />
          );
        })}

        <Lobby users={unassigned} onSelectUser={onSelectUser} />
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

function FloorRoom({
  room,
  members,
  taskCount,
  onSelectUser,
  onSelectRoom,
  onDeleteRequest,
}: {
  room: HierarchyRoom;
  members: AppUser[];
  taskCount: number;
  onSelectUser: (userId: string) => void;
  onSelectRoom: () => void;
  onDeleteRequest: () => void;
}) {
  const { updateRoom } = useTaskStore();
  // Combined drag+drop, same trick as the old RoomCard: setNodeRef covers the whole floor (both
  // for drag-rect measurement and as the drop target people are dragged onto), {...attributes}/
  // {...listeners} — the actual pointer handlers — go on just the header row, not the floor root,
  // so they don't shadow each avatar's own useDraggable in the members row underneath. None of the
  // header's own buttons (name/DND/expand/delete) need stopPropagation against these listeners —
  // dnd-kit's pointer sensor only actuates a drag past a 5px move threshold, so a plain click on a
  // nested button already falls through to its own onClick untouched, same as before this rewrite.
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
      className={`border-b p-3 space-y-2.5 transition ${
        room.isDnd
          ? 'border-red-500/40 bg-red-950/10 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.15)]'
          : isOver
            ? 'border-blue-500/60 bg-blue-500/5'
            : 'border-neutral-800 bg-neutral-900/60'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <div {...attributes} {...listeners} className="flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base shrink-0">{room.icon || '🏠'}</span>
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
              className="bg-neutral-950 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none min-w-0"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-xs font-semibold text-neutral-200 truncate cursor-text text-left">
              {room.name}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-neutral-500 font-mono">{taskCount} oppg.</span>
          <button
            onClick={() => updateRoom(room.id, { isDnd: !room.isDnd })}
            title={room.isDnd ? 'Room is Do Not Disturb — click to clear' : 'Mark room Do Not Disturb'}
            className={`cursor-pointer transition ${room.isDnd ? 'text-red-400' : 'text-neutral-600 hover:text-neutral-300'}`}
          >
            {room.isDnd ? <DoorClosed className="w-3.5 h-3.5" /> : <DoorOpen className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onSelectRoom} title="Step inside" className="text-neutral-600 hover:text-blue-400 cursor-pointer">
            <Maximize2 className="w-3 h-3" />
          </button>
          <button onClick={onDeleteRequest} title="Delete room" className="text-neutral-600 hover:text-red-400 cursor-pointer">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center min-h-[36px]">
        {members.length === 0 && <span className="text-[10px] text-neutral-600 italic">Dra noen hit...</span>}
        {members.map((u) => (
          <DraggableAvatar key={u.id} user={u} onClick={() => onSelectUser(u.id)} size="sm" />
        ))}
      </div>
    </div>
  );
}

function Lobby({ users, onSelectUser }: { users: AppUser[]; onSelectUser: (userId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'room-drop:unassigned' });
  return (
    <div
      ref={setNodeRef}
      className={`p-4 space-y-2 transition border-t-2 border-b-4 rounded-b ${
        isOver ? 'bg-blue-500/10 border-blue-500/60' : 'bg-amber-500/5 border-amber-500/20'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-200/70 uppercase tracking-wider">
        <UsersIcon className="w-3 h-3" /> Lobby — Ikke plassert
      </div>
      <div className="flex items-center min-h-[36px]">
        {users.length === 0 && <span className="text-[10px] text-neutral-600 italic">Alle har et kontor 🎉</span>}
        {users.map((u) => (
          <DraggableAvatar key={u.id} user={u} onClick={() => onSelectUser(u.id)} size="md" />
        ))}
      </div>
    </div>
  );
}

// Overlapping "collaborating" cluster look (negative margin + separation ring), individually
// draggable per person — the DnD wiring itself lives here, PersonAvatar only owns the visuals.
function DraggableAvatar({ user, onClick, size }: { user: AppUser; onClick: () => void; size: 'sm' | 'md' }) {
  const { updateUser } = useTaskStore();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `person-drag:${user.id}` });
  return (
    <PersonAvatar
      user={user}
      size={size}
      onClick={onClick}
      showDndToggle
      onToggleDnd={() => updateUser(user.id, { isDnd: !user.isDnd })}
      dragRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className="-ml-2 first:ml-0 ring-2 ring-neutral-900 hover:z-10 hover:scale-110"
    />
  );
}

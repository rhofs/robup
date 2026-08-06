'use client';

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Megaphone, Pencil, Plus, Trash2, Users as UsersIcon } from 'lucide-react';
import FloatingPopover from './FloatingPopover';
import { useTaskStore, HierarchyRoom, AppUser, Task } from '../store/useTaskStore';

// The "cozy" Office home view — a message-of-the-day banner plus a floor plan of drag-and-drop
// Rooms, replacing the old flat team grid. Reuses the app's single shared DndContext (page.tsx)
// via id-prefix dispatch (`person-drag:`/`room-drop:`) rather than a nested context.
const ROOM_ICON_CHOICES = ['☕', '🌱', '🎮', '📚', '🎨', '🍕', '🎵', '🛋️', '🌟', '🔥'];
const ROOM_COLOR_CHOICES = ['#c89642', '#618cd1', '#9a61d1', '#349f7c', '#cd6565', '#31a0b3', '#cb6798', '#8d97a5'];

type OfficeRoomsProps = {
  workspaceId: string;
  messageOfTheDay: string | null;
  rooms: HierarchyRoom[];
  users: AppUser[];
  tasks: Task[];
  onSelectUser: (userId: string) => void;
  onDeleteRoomRequest: (room: HierarchyRoom) => void;
};

export default function OfficeRooms({ workspaceId, messageOfTheDay, rooms, users, tasks, onSelectUser, onDeleteRoomRequest }: OfficeRoomsProps) {
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

  return (
    <div className="space-y-4">
      <MessageBanner workspaceId={workspaceId} value={messageOfTheDay} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rooms.map((room) => {
          const members = users.filter((u) => u.roomId === room.id);
          return (
            <RoomCard
              key={room.id}
              room={room}
              members={members}
              taskCount={taskCountFor(members.map((m) => m.id))}
              onSelectUser={onSelectUser}
              onDeleteRequest={() => onDeleteRoomRequest(room)}
            />
          );
        })}

        <div className="rounded border border-dashed border-neutral-800 p-3 flex items-center justify-center min-h-[120px]">
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
              placeholder="Room name..."
              className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setCreatingRoom(true)}
              className="text-[11px] text-neutral-500 hover:text-blue-400 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> New room
            </button>
          )}
        </div>
      </div>

      <UnassignedTray users={unassigned} onSelectUser={onSelectUser} />
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

function RoomCard({
  room,
  members,
  taskCount,
  onSelectUser,
  onDeleteRequest,
}: {
  room: HierarchyRoom;
  members: AppUser[];
  taskCount: number;
  onSelectUser: (userId: string) => void;
  onDeleteRequest: () => void;
}) {
  const { updateRoom } = useTaskStore();
  const { setNodeRef, isOver } = useDroppable({ id: `room-drop:${room.id}` });
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.name);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== room.name) updateRoom(room.id, { name: trimmed });
    else setNameDraft(room.name);
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded border p-3 space-y-2.5 transition ${
        isOver ? 'border-blue-500/60 bg-blue-500/5' : 'border-neutral-800/80 bg-neutral-900/60'
      }`}
      style={room.color ? { borderTopColor: room.color, borderTopWidth: 2 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FloatingPopover
            open={customizeOpen}
            onClose={() => setCustomizeOpen(false)}
            panelClassName="w-48 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-2 space-y-2"
            anchor={
              <button onClick={() => setCustomizeOpen((o) => !o)} className="text-base cursor-pointer hover:scale-110 transition shrink-0" title="Customize">
                {room.icon || '🏠'}
              </button>
            }
          >
            <div className="flex flex-wrap gap-1">
              {ROOM_ICON_CHOICES.map((icon) => (
                <button
                  key={icon}
                  onClick={() => updateRoom(room.id, { icon })}
                  className={`w-6 h-6 rounded flex items-center justify-center text-sm cursor-pointer hover:bg-neutral-800 ${
                    room.icon === icon ? 'bg-neutral-800 ring-1 ring-blue-500' : ''
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {ROOM_COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  onClick={() => updateRoom(room.id, { color: c })}
                  className={`w-5 h-5 rounded-full cursor-pointer ${room.color === c ? 'ring-2 ring-white' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </FloatingPopover>

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
          <button onClick={onDeleteRequest} title="Delete room" className="text-neutral-600 hover:text-red-400 cursor-pointer">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 min-h-[36px]">
        {members.length === 0 && <span className="text-[10px] text-neutral-600 italic py-1.5">Dra noen hit...</span>}
        {members.map((u) => (
          <PersonChip key={u.id} user={u} onClick={() => onSelectUser(u.id)} />
        ))}
      </div>
    </div>
  );
}

function UnassignedTray({ users, onSelectUser }: { users: AppUser[]; onSelectUser: (userId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'room-drop:unassigned' });
  return (
    <div
      ref={setNodeRef}
      className={`rounded border border-dashed p-3 space-y-2 transition ${
        isOver ? 'border-blue-500/60 bg-blue-500/5' : 'border-neutral-800'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
        <UsersIcon className="w-3 h-3" /> Ikke plassert
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[36px]">
        {users.length === 0 && <span className="text-[10px] text-neutral-600 italic py-1.5">Alle har et kontor 🎉</span>}
        {users.map((u) => (
          <PersonChip key={u.id} user={u} onClick={() => onSelectUser(u.id)} />
        ))}
      </div>
    </div>
  );
}

function PersonChip({ user, onClick }: { user: AppUser; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `person-drag:${user.id}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className="flex items-center gap-1.5 bg-neutral-950/60 border border-neutral-800 rounded-full pl-1 pr-2.5 py-1 cursor-grab active:cursor-grabbing hover:border-neutral-700 transition"
    >
      <span
        className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: user.color }}
      >
        {user.initials}
      </span>
      <span className="text-[11px] text-neutral-300 truncate max-w-[100px]">{user.name}</span>
      {user.status && <span className="text-[10px] shrink-0">{user.status}</span>}
    </div>
  );
}

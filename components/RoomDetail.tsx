'use client';

import { useState } from 'react';
import { ArrowLeft, DoorOpen, DoorClosed } from 'lucide-react';
import { useTaskStore, HierarchyRoom, HierarchyWorkspace, AppUser } from '../store/useTaskStore';
import ManageableAvatar from './ManageableAvatar';
import ColorSwatchPicker from './ColorSwatchPicker';

const ROOM_ICON_CHOICES = ['☕', '🌱', '🎮', '📚', '🎨', '🍕', '🎵', '🛋️', '🌟', '🔥'];
const ROOM_COLOR_CHOICES = ['#c89642', '#618cd1', '#9a61d1', '#349f7c', '#cd6565', '#31a0b3', '#cb6798', '#8d97a5'];

// "Step inside" a room — reached from RoomBox's expand button. This is now the one place a room
// gets decorated (icon/color, moved off the old floor-header popover) and where its DND state gets
// a real labeled toggle rather than just the small door icon on the box itself. Members here are
// browse-only (click to open their own page) — dragging them stays the floor plan/Lobby view's
// job. Owner/Admins still get the manage badge (promote/demote/Roles/remove) via ManageableAvatar,
// same surface as the top-down floor plan.
type RoomDetailProps = {
  room: HierarchyRoom;
  members: AppUser[];
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean;
  onBack: () => void;
  onSelectUser: (userId: string) => void;
  onRequestRemoveMember: (user: AppUser) => void;
  onStartDM: (userId: string) => void;
};

export default function RoomDetail({ room, members, workspace, currentUserId, canManage, onBack, onSelectUser, onRequestRemoveMember, onStartDM }: RoomDetailProps) {
  const { updateRoom } = useTaskStore();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.name);

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== room.name) updateRoom(room.id, { name: trimmed });
    else setNameDraft(room.name);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button onClick={onBack} className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to HQ
      </button>

      <div
        className="bg-neutral-900/60 border rounded p-5 space-y-4"
        style={room.color ? { borderColor: room.color + '55' } : { borderColor: 'rgba(64,64,64,0.8)' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0"
            style={{ backgroundColor: (room.color ?? '#404040') + '30' }}
          >
            {room.icon || '🏠'}
          </span>
          <div className="min-w-0 flex-1">
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
                className="bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-lg font-semibold text-app-strong focus:outline-none w-full"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="text-lg font-semibold text-app-strong cursor-text text-left"
                style={{ color: room.textColor || undefined }}
              >
                {room.name}
              </button>
            )}
            <p className="text-[11px] text-neutral-500">
              {members.length} {members.length === 1 ? 'person' : 'people'} inside
            </p>
          </div>
          <button
            onClick={() => updateRoom(room.id, { isDnd: !room.isDnd })}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium cursor-pointer transition ${
              room.isDnd
                ? 'bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/20'
                : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700 hover:text-neutral-200'
            }`}
          >
            {room.isDnd ? <DoorClosed className="w-3.5 h-3.5" /> : <DoorOpen className="w-3.5 h-3.5" />}
            {room.isDnd ? 'Do Not Disturb' : 'Open'}
          </button>
        </div>

        <div className="space-y-2 pt-3 border-t border-neutral-800">
          <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Decorate</h3>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_ICON_CHOICES.map((icon) => (
              <button
                key={icon}
                onClick={() => updateRoom(room.id, { icon })}
                className={`w-7 h-7 rounded flex items-center justify-center text-base cursor-pointer hover:bg-neutral-800 ${
                  room.icon === icon ? 'bg-neutral-800 ring-1 ring-blue-500' : ''
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <ColorSwatchPicker value={room.color} onChange={(color) => updateRoom(room.id, { color })} choices={ROOM_COLOR_CHOICES} />
          <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider pt-1">Name text color</h3>
          <ColorSwatchPicker value={room.textColor} onChange={(textColor) => updateRoom(room.id, { textColor })} choices={ROOM_COLOR_CHOICES} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Who&apos;s here</h3>
        {members.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-1 py-6 text-center border border-dashed border-neutral-800 rounded">
            Nobody&apos;s in here yet — drag someone in from the HQ view.
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
            {members.map((u) => (
              // A <div>, not a <button> — PersonAvatar's own root (inside ManageableAvatar) is
              // already a <button>, and nesting a real button inside another is invalid HTML.
              // Clicking anywhere in the row (including the avatar, which has no onClick of its
              // own here) still bubbles up to this div's handler; the manage badge stops its own
              // propagation so it doesn't also trigger this row click.
              <div
                key={u.id}
                onClick={() => onSelectUser(u.id)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-neutral-800/30 transition cursor-pointer"
              >
                <ManageableAvatar
                  user={u}
                  workspace={workspace}
                  currentUserId={currentUserId}
                  canManage={canManage}
                  onRequestRemove={onRequestRemoveMember}
                  onStartDM={onStartDM}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-neutral-200 truncate">{u.name}</div>
                  {u.title && <div className="text-[10px] text-neutral-500 truncate">{u.title}</div>}
                </div>
                {u.status && <span className="text-[11px] shrink-0">{u.status}</span>}
                {u.isDnd && <span className="text-[10px] text-red-400 shrink-0">DND</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

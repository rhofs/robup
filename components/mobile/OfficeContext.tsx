'use client';

import { useState } from 'react';
import { ChevronRight, Hash, Users } from 'lucide-react';
import type { HierarchySpace, HierarchyRoom } from '../../store/useTaskStore';
import { FOLDER_ICON_MAP } from '../FolderTree';
import { hapticTap } from '../../lib/haptics';

// The Office half of the new two-context layout: one workspace, seen either as the work in it or
// the conversations in it.
//
// The toggle is the whole idea. Home has the identical control with My Spaces / Messages, so the
// structure is learned once and applies twice — which is what the old five-tabs-at-one-level layout
// could never do, because none of the five explained any of the others.
//
// Spaces is the default side, not Rooms: this is a task manager first. The user's call, and it is
// the right one — the half you land on is what the app says it is for.

export type OfficeTab = 'spaces' | 'rooms';

type Channel = { id: string; name: string; unreadCount?: number };

type Props = {
  spaces: HierarchySpace[];
  rooms: HierarchyRoom[];
  channels: Channel[];
  // Who is in which room right now, by room id. Presence lives with the room in this list rather
  // than on a separate screen — which is the point of merging Office into here at all.
  occupantsByRoom: Record<string, { id: string; initials: string; color: string }[]>;
  onSelectSpace: (spaceId: string) => void;
  onSelectRoom: (roomId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onCreateSpace: () => void;
};

export default function OfficeContext({
  spaces,
  rooms,
  channels,
  occupantsByRoom,
  onSelectSpace,
  onSelectRoom,
  onSelectChannel,
  onCreateSpace,
}: Props) {
  const [tab, setTab] = useState<OfficeTab>('spaces');

  return (
    <div className="flex-1 overflow-y-auto pb-28">
      {/* The switch itself. Two options only — a third would make it a menu, and a menu is what
          this layout exists to get rid of. */}
      <div className="mx-2 mb-2 flex gap-0.5 rounded-full bg-neutral-800/60 p-0.5">
        {(['spaces', 'rooms'] as const).map((id) => (
          <button
            key={id}
            onClick={() => {
              if (id !== tab) hapticTap();
              setTab(id);
            }}
            className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold capitalize transition cursor-pointer ${
              tab === id ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-400'
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {tab === 'spaces' ? (
        <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
          {spaces.length === 0 && (
            <p className="px-2 py-3 text-xs text-neutral-500">No spaces in this workspace yet.</p>
          )}
          {spaces.map((space) => {
            const Icon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
            return (
              <button
                key={space.id}
                onClick={() => onSelectSpace(space.id)}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
              >
                {/* text-white, not text-app-strong — the tile is filled with the Space's own
                    colour, and that token follows the neutral scale into near-black in light mode.
                    Same trap, already paid for once. */}
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: space.color || '#6366f1' }}
                >
                  {Icon ? (
                    <Icon className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-white text-xs font-bold">{space.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{space.name}</span>
                <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
              </button>
            );
          })}
          <button
            onClick={onCreateSpace}
            className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left text-xs text-neutral-500 hover:bg-neutral-800/60 cursor-pointer transition"
          >
            <span className="font-bold text-base leading-none">+</span> New space
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Rooms above channels, and both in one list — the thing this layout is for. A room and
              a channel answer the same question (where is the conversation), so splitting them
              across two tabs was always a statement about how the app is built rather than about
              what the user is looking for. The faces are why rooms go first: they are the only
              part of this screen that changes minute to minute. */}
          <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Rooms</p>
            {rooms.length === 0 && <p className="px-2 py-2 text-xs text-neutral-500">No rooms yet.</p>}
            {rooms.map((room) => {
              const occupants = occupantsByRoom[room.id] ?? [];
              return (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                >
                  <Users className="w-4 h-4 shrink-0 text-neutral-500" />
                  <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{room.name}</span>
                  {occupants.length > 0 ? (
                    <span className="flex -space-x-1.5 shrink-0">
                      {occupants.slice(0, 3).map((u) => (
                        <span
                          key={u.id}
                          className="w-5 h-5 rounded-full border border-neutral-900 text-[8px] font-bold flex items-center justify-center text-white"
                          style={{ backgroundColor: u.color }}
                        >
                          {u.initials}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-[11px] text-neutral-600 shrink-0">empty</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Channels</p>
            {channels.length === 0 && <p className="px-2 py-2 text-xs text-neutral-500">No channels yet.</p>}
            {channels.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectChannel(c.id)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
              >
                <Hash className="w-4 h-4 shrink-0 text-neutral-500" />
                <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{c.name}</span>
                {!!c.unreadCount && (
                  <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

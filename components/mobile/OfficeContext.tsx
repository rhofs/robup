'use client';

import { useState } from 'react';
import { ChevronRight, Hash, Users } from 'lucide-react';
import type { HierarchySpace, HierarchyRoom } from '../../store/useTaskStore';
import ContextSpaceList from './ContextSpaceList';
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
  tab: OfficeTab;
  onTabChange: (tab: OfficeTab) => void;
  openSpaceIds: Set<string>;
  openFolderIds: Set<string>;
  onToggleSpace: (spaceId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onSelectSpace: (spaceId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSpaceMenu: (x: number, y: number, space: HierarchySpace) => void;

  onSelectRoom: (roomId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onCreateSpace: (name: string) => void;
};

export default function OfficeContext({
  spaces,
  rooms,
  channels,
  occupantsByRoom,
  tab,
  onTabChange,
  openSpaceIds,
  openFolderIds,
  onToggleSpace,
  onToggleFolder,
  onSelectSpace,
  onSelectList,
  onSpaceMenu,
  onSelectRoom,
  onSelectChannel,
  onCreateSpace,
}: Props) {
  // Local, because creating a Space is a moment inside this screen and nothing above it needs to
  // know it is happening.
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [draft, setDraft] = useState('');
  const commitSpace = () => {
    const name = draft.trim();
    if (name) onCreateSpace(name);
    setDraft('');
    setCreatingSpace(false);
  };
  // tab/onTabChange come from the page rather than useState: this component unmounts every
  // time you open something from it, and a local default meant coming back always landed on the
  // first half regardless of which one you left from.

  // A dot rather than a number: the count is already on every row in the list below, and the only
  // thing this has to say from out here is "there is something in the other half".
  const unreadInOther = channels.reduce((sum, x) => sum + (x.unreadCount || 0), 0);

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
              onTabChange(id);
            }}
            className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold capitalize transition cursor-pointer ${
              tab === id ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-400'
            }`}
          >
            {id}
            {id === 'rooms' && unreadInOther > 0 && tab !== 'rooms' && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" />
            )}
          </button>
        ))}
      </div>

      {tab === 'spaces' ? (
        <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
          <ContextSpaceList
            spaces={spaces}
            openSpaceIds={openSpaceIds}
            openFolderIds={openFolderIds}
            onToggleSpace={onToggleSpace}
            onToggleFolder={onToggleFolder}
            emptyText="No spaces in this workspace yet."
            onSelectSpace={onSelectSpace}
            onSelectList={onSelectList}
            onSpaceMenu={onSpaceMenu}
          />
          {creatingSpace ? (
            // Creates the Space right here instead of opening the Spaces tree to do it. Routing this to
            // the tree was the original shortcut — the tree already has a create flow with naming, colour
            // and icon — but from a context screen it reads as the button failing: you tap "New space"
            // and land in a different navigation system with no space created. Reported as "Trykker jeg
            // på New Space, så kommer jeg bare inn på Personal Spaces. Så den funker ikke." Name only
            // here; colour and icon stay the tree's job, reachable by editing the Space afterwards.
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitSpace();
              }}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                // Blur commits rather than discards: on a phone, dismissing the keyboard is the most
                // likely way out of this field, and losing a typed name to it would read as the same
                // "New space does nothing" bug all over again.
                onBlur={commitSpace}
                placeholder="Space name"
                className="flex-1 min-w-0 bg-neutral-800 rounded-lg px-2.5 py-2 text-sm text-app-strong placeholder:text-neutral-500 outline-none"
              />
            </form>
          ) : (
            <button
              onClick={() => {
                hapticTap();
                setCreatingSpace(true);
              }}
              className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left text-xs text-neutral-500 hover:bg-neutral-800/60 cursor-pointer transition"
            >
              <span className="font-bold text-base leading-none">+</span> New space
            </button>
          )}
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

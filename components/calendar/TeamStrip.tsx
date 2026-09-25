'use client';

import { useState } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { pickableMembers } from '../../lib/workspaceMembers';
import { startPersonDrag, endPersonDrag } from '../../lib/personDrag';
import { MiniAvatar } from '../AssigneePicker';
import FloatingPopover from '../FloatingPopover';

const MAX_VISIBLE = 8;

// The active workspace's people, as faces in the Planner toolbar, each one something you can pick up
// and drop on a task or event bar to put them on it (lib/personDrag.ts has why it is native DnD and
// desktop only). You first, then whoever is online, then by name — the people you are most likely
// to be handing work to right now are nearest the start.
//
// Past MAX_VISIBLE the rest fold into "+N", which opens them in a panel you can drag from too.
export default function TeamStrip() {
  const workspaces = useTaskStore((s) => s.workspaces);
  const users = useTaskStore((s) => s.users);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const onlineUserIds = usePresenceStore((s) => s.onlineUserIds);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const members = pickableMembers(workspaces, users, activeWorkspaceId).sort(
    (a, b) =>
      Number(b.id === currentUserId) - Number(a.id === currentUserId) ||
      Number(onlineUserIds.has(b.id)) - Number(onlineUserIds.has(a.id)) ||
      a.name.localeCompare(b.name)
  );
  // A team of one has no one to hand anything to.
  if (members.length < 2) return null;

  const visible = members.slice(0, MAX_VISIBLE);
  const hidden = members.slice(MAX_VISIBLE);

  const face = (u: (typeof members)[number], size: number) => (
    <span
      key={u.id}
      draggable
      onDragStart={(e) => {
        startPersonDrag(e, u.id);
        setDraggingId(u.id);
      }}
      onDragEnd={() => {
        endPersonDrag();
        setDraggingId(null);
      }}
      title={`${u.id === currentUserId ? 'You' : u.name} — drag onto a task or event to assign`}
      className={`relative cursor-grab active:cursor-grabbing rounded-full transition hover:-translate-y-0.5 hover:z-10 ${
        draggingId === u.id ? 'siqt-person-dragging' : ''
      }`}
    >
      <MiniAvatar user={u} size={size} showPresence className="ring-2 ring-neutral-900" />
    </span>
  );

  return (
    <div className="hidden md:flex items-center gap-1.5">
      <span className="text-[10px] text-neutral-500 select-none">Assign</span>
      <div className="flex items-center -space-x-1">{visible.map((u) => face(u, 24))}</div>
      {hidden.length > 0 && (
        <FloatingPopover
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          panelClassName="w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2"
          anchor={
            <button
              onClick={() => setMoreOpen((o) => !o)}
              title="Everyone else"
              className="h-6 min-w-6 px-1.5 rounded-full bg-neutral-800 text-neutral-300 text-[10px] font-semibold hover:bg-neutral-700 cursor-pointer"
            >
              +{hidden.length}
            </button>
          }
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 px-1 pb-1.5">Drag onto a task</p>
          <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
            {hidden.map((u) => (
              <div key={u.id} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-neutral-800/60">
                {face(u, 22)}
                <span className="text-xs text-neutral-300 truncate">{u.name}</span>
              </div>
            ))}
          </div>
        </FloatingPopover>
      )}
    </div>
  );
}

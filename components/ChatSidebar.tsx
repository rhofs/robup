'use client';

import { useEffect, useMemo, useState } from 'react';
import { Hash, MessageCircle, Pencil, Plus, Check, Bell, BellOff } from 'lucide-react';
import { useChatStore, type ChatChannel, type Connection } from '../store/useChatStore';
import { useSessionStore } from '../store/useSessionStore';
import { useIsMobile } from '../hooks/useIsMobile';
import FloatingPopover from './FloatingPopover';

type ChatSidebarProps = {
  workspaceId: string | null;
};

// Swaps in for the Space/Folder/List tree in the main left `<aside>` while activeView === 'chat',
// same shape as how that tree swaps out for a plain Team list while activeView === 'office'.
// Replaces the old ChatChannelSidebar/DirectMessagesSidebar split — Channels and Direct Messages
// used to live behind two completely separate nav-rail destinations ("Chat" and the Me-zone's
// "Network"), which read as "two different chats in two different places" (user's own words,
// 2026-08-25 feedback). They're one Chat surface now, with a Channels/Direct Messages toggle right
// here — Connections (finding/managing who you can message) is still its own smaller destination,
// reachable from the Me-zone, since a Connection you haven't messaged yet has no ChatChannel row
// at all and showing one for every Connection would mean inventing fake conversations.
export default function ChatSidebar({ workspaceId }: ChatSidebarProps) {
  const isMobile = useIsMobile();
  const {
    channelsByWorkspace,
    dms,
    connections,
    activeChannelId,
    activeChatSidebarTab,
    setActiveChannelId,
    setActiveChatSidebarTab,
    fetchChannels,
    createChannel,
    renameChannel,
    fetchDMs,
    fetchConnections,
    createOrOpenDM,
    toggleChannelMute,
  } = useChatStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const channels = workspaceId ? channelsByWorkspace[workspaceId] || [] : [];
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const channelsUnread = useMemo(() => channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0), [channels]);
  const dmsUnread = useMemo(() => dms.reduce((sum, d) => sum + (d.unreadCount || 0), 0), [dms]);

  useEffect(() => {
    if (workspaceId) fetchChannels(workspaceId);
  }, [workspaceId, fetchChannels]);

  useEffect(() => {
    fetchDMs();
    fetchConnections();
  }, [fetchDMs, fetchConnections]);

  const handleCreateChannel = async (name: string) => {
    if (!workspaceId) return;
    setNewChannelOpen(false);
    const channel = await createChannel(workspaceId, { name });
    if (channel) setActiveChannelId(channel.id);
  };

  const handleStartDM = async (memberIds: string[]) => {
    setNewChatOpen(false);
    const dm = await createOrOpenDM(memberIds);
    if (dm) setActiveChannelId(dm.id);
  };

  return (
    <div className="space-y-4">
      {/* Segmented pill control, not two stacked full-width rows — per direct feedback that the
          old rows read as plain list items rather than a tab switcher. Side-by-side + a filled
          "active" pill is the more immediately legible "these are the two views" affordance,
          and reads fine both here (the narrow desktop <aside>) and inline as mobile Chat's own
          main content (app/page.tsx) now that it's shown there too. */}
      {/* Border dropped on mobile only — inline here, this pill's own straight-edged border sat
          just below app/page.tsx's new big rounded-top-corner sheet and read as a second,
          conflicting border right under the first one. Desktop (this same component, in the
          `<aside>` sidebar) keeps its border unchanged. */}
      <div className={`flex items-center gap-1 p-1 bg-neutral-950/60 rounded-lg ${isMobile ? '' : 'border border-neutral-800/60'}`}>
        <button
          onClick={() => setActiveChatSidebarTab('channels')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
            activeChatSidebarTab === 'channels' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Hash className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Channels</span>
          {channelsUnread > 0 && (
            <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {channelsUnread > 99 ? '99+' : channelsUnread}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveChatSidebarTab('dms')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
            activeChatSidebarTab === 'dms' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">DMs</span>
          {dmsUnread > 0 && (
            <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {dmsUnread > 99 ? '99+' : dmsUnread}
            </span>
          )}
        </button>
      </div>

      {activeChatSidebarTab === 'channels' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Channels</p>
            <FloatingPopover
              open={newChannelOpen}
              onClose={() => setNewChannelOpen(false)}
              panelClassName="w-56 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-2"
              anchor={
                <button onClick={() => setNewChannelOpen((o) => !o)} title="New channel" className="text-neutral-500 hover:text-blue-400 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              }
            >
              <NewChannelForm onCreate={handleCreateChannel} />
            </FloatingPopover>
          </div>
          {!workspaceId && <p className="text-[11px] text-neutral-500 px-2">Pick a workspace to see its channels.</p>}
          {workspaceId && channels.length === 0 && <p className="text-[11px] text-neutral-500 px-2">No channels yet.</p>}
          {channels.map((c) =>
            editingChannelId === c.id ? (
              <ChannelRenameInput
                key={c.id}
                channel={c}
                onCommit={(name) => {
                  setEditingChannelId(null);
                  if (workspaceId && name && name !== c.name) renameChannel(workspaceId, c.id, name);
                }}
              />
            ) : (
              <div key={c.id} className={`group relative ${c.muted ? 'opacity-60' : ''}`}>
                <button
                  onClick={() => setActiveChannelId(c.id)}
                  className={`w-full text-left py-1.5 pr-11 rounded text-xs font-medium transition flex items-center gap-1.5 cursor-pointer border-l-2 ${
                    activeChannelId === c.id
                      ? 'bg-neutral-800 text-app-strong border-blue-500 pl-2'
                      : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 border-transparent pl-2.5'
                  }`}
                >
                  <Hash className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                  <span className="truncate flex-1">{c.name}</span>
                  {!!c.unreadCount && (
                    <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none group-hover:opacity-0 transition">
                      {c.unreadCount > 99 ? '99+' : c.unreadCount}
                    </span>
                  )}
                </button>
                <MuteToggleButton muted={!!c.muted} onToggle={() => toggleChannelMute(c.id, !c.muted)} className="right-6" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingChannelId(c.id);
                  }}
                  title="Rename channel"
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition text-neutral-500 hover:text-blue-400 cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Direct messages</p>
            <FloatingPopover
              open={newChatOpen}
              onClose={() => setNewChatOpen(false)}
              panelClassName="w-56 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
              anchor={
                <button onClick={() => setNewChatOpen((o) => !o)} title="New message" className="text-neutral-500 hover:text-blue-400 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              }
            >
              <NewChatPicker connections={connections} onStart={handleStartDM} />
            </FloatingPopover>
          </div>
          {dms.length === 0 && <p className="text-[11px] text-neutral-500 px-2">No conversations yet.</p>}
          {dms.map((dm) => {
            const others = (dm.members ?? []).map((m) => m.user).filter((u) => u.id !== currentUserId);
            const label = others.map((u) => u.name).join(', ') || 'Just you';
            return (
              <div key={dm.id} className={`group relative ${dm.muted ? 'opacity-60' : ''}`}>
              <button
                onClick={() => setActiveChannelId(dm.id)}
                className={`w-full text-left py-1.5 pl-2 pr-6 rounded text-xs font-medium transition flex items-center gap-1.5 cursor-pointer border-l-2 ${
                  activeChannelId === dm.id
                    ? 'bg-neutral-800 text-app-strong border-blue-500'
                    : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 border-transparent'
                }`}
              >
                <span className="flex items-center -space-x-1.5 shrink-0">
                  {others.slice(0, 3).map((u) => (
                    <span
                      key={u.id}
                      className="w-5 h-5 rounded-full border border-neutral-900 text-[8px] font-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.initials}
                    </span>
                  ))}
                </span>
                <span className="truncate flex-1">{label}</span>
                {!!dm.unreadCount && (
                  <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none group-hover:opacity-0 transition">
                    {dm.unreadCount > 99 ? '99+' : dm.unreadCount}
                  </span>
                )}
              </button>
              <MuteToggleButton muted={!!dm.muted} onToggle={() => toggleChannelMute(dm.id, !dm.muted)} className="right-1" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Shared by both channel and DM rows (backlog #6, mute). Visible on hover when unmuted (matching
// the channel row's rename pencil), but stays visible even without hovering once actually muted —
// the row's own dimmed opacity (set by the caller) already signals "muted" at a glance, and this
// icon is what explains why plus how to undo it.
function MuteToggleButton({ muted, onToggle, className }: { muted: boolean; onToggle: () => void; className: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={muted ? 'Unmute' : 'Mute'}
      className={`absolute ${className} top-1/2 -translate-y-1/2 transition text-neutral-500 hover:text-blue-400 cursor-pointer ${
        muted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      {muted ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
    </button>
  );
}

function NewChannelForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
  };
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-0.5">New channel</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="e.g. marketing"
        className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-xs text-app-strong placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={submit}
        disabled={!name.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded px-2 py-1.5 text-xs font-medium text-white cursor-pointer transition"
      >
        Create channel
      </button>
    </div>
  );
}

function ChannelRenameInput({ channel, onCommit }: { channel: ChatChannel; onCommit: (name: string | null) => void }) {
  const [draft, setDraft] = useState(channel.name ?? '');
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onCommit(null);
      }}
      className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-app-strong focus:outline-none"
    />
  );
}

// Checkbox list drawn from the caller's FULL connections list (explicit connections ∪ every
// coworker across every workspace) — not scoped to any single workspace. Pick one to start/reopen
// a 1:1, two or more starts a brand-new group (server-side never deduped).
function NewChatPicker({ connections, onStart }: { connections: Connection[]; onStart: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <div className="p-1">
      <div className="max-h-56 overflow-y-auto">
        {connections.length === 0 && (
          <p className="text-[11px] text-neutral-500 px-2 py-1.5">No connections yet — share your connect link, or join a shared workspace with someone.</p>
        )}
        {connections.map((c) => {
          const isChecked = selected.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                })
              }
              className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 cursor-pointer hover:bg-neutral-800/60"
            >
              <span
                className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 transition ${
                  isChecked ? 'bg-blue-500/20 border-blue-500/60 text-blue-400' : 'border-neutral-600'
                }`}
              >
                {isChecked && <Check className="w-2.5 h-2.5" />}
              </span>
              <span className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0" style={{ backgroundColor: c.color }}>
                {c.initials}
              </span>
              <span className="truncate text-neutral-200">{c.name}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={selected.size === 0}
        onClick={() => onStart([...selected])}
        className="w-full mt-1 text-center px-2 py-1.5 rounded text-[11px] font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white cursor-pointer transition"
      >
        {selected.size > 1 ? 'Start group' : 'Message'}
      </button>
    </div>
  );
}

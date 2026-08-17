'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Users, Plus, Check } from 'lucide-react';
import { useChatStore, type Connection } from '../store/useChatStore';
import { useSessionStore } from '../store/useSessionStore';
import FloatingPopover from './FloatingPopover';

// Swaps into the main left `<aside>` while activeView === 'directMessages', same pattern
// ChatChannelSidebar uses for activeView === 'chat' — previously the Spaces & Lists tree kept
// showing there instead (meaningless for a workspace-agnostic view) while Chats/Connections lived
// as a small tab strip inside DirectMessagesPage's own content pane. Moved here so Direct Messages
// gets the same sidebar-driven navigation every other top-level destination already has, and the
// content pane (DirectMessagesPage.tsx) no longer needs its own internal tab bar.
export default function DirectMessagesSidebar() {
  const { dms, connections, connectionRequestsIncoming, activeChannelId, activeDmTab, setActiveChannelId, setActiveDmTab, fetchDMs, fetchConnections, fetchConnectionRequests, createOrOpenDM } =
    useChatStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const dmUnreadTotal = useMemo(() => dms.reduce((sum, d) => sum + (d.unreadCount || 0), 0), [dms]);

  useEffect(() => {
    fetchDMs();
    fetchConnections();
    // Fetched here (not gated on the Connections sub-view being open) so the incoming-request
    // badge below is accurate the moment this sidebar mounts.
    fetchConnectionRequests();
  }, [fetchDMs, fetchConnections, fetchConnectionRequests]);

  const handleStartDM = async (memberIds: string[]) => {
    setNewChatOpen(false);
    const dm = await createOrOpenDM(memberIds);
    if (dm) {
      setActiveChannelId(dm.id);
      setActiveDmTab('chats');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <button
          onClick={() => setActiveDmTab('chats')}
          className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
            activeDmTab === 'chats' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/40'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" /> Chats
          {dmUnreadTotal > 0 && (
            <span className="ml-auto min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {dmUnreadTotal > 99 ? '99+' : dmUnreadTotal}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveDmTab('connections')}
          className={`relative w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
            activeDmTab === 'connections' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/40'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Connections
          {connectionRequestsIncoming.length > 0 && (
            <span className="ml-auto min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {connectionRequestsIncoming.length}
            </span>
          )}
        </button>
      </div>

      {activeDmTab === 'chats' && (
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
              <button
                key={dm.id}
                onClick={() => setActiveChannelId(dm.id)}
                className={`w-full text-left py-1.5 px-2 rounded text-xs font-medium transition flex items-center gap-1.5 cursor-pointer border-l-2 ${
                  activeChannelId === dm.id
                    ? 'bg-neutral-800 text-white border-blue-500'
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
                  <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {dm.unreadCount > 99 ? '99+' : dm.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
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

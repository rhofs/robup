'use client';

import { useEffect, useState } from 'react';
import { Hash, Pencil, Plus } from 'lucide-react';
import { useChatStore, type ChatChannel } from '../store/useChatStore';

type ChatChannelSidebarProps = {
  workspaceId: string | null;
};

// Swaps in for the Space/Folder/List tree in the main left `<aside>` while activeView === 'chat',
// same shape as how that tree swaps out for a plain Team list while activeView === 'office' — Chat
// is workspace-scoped, not Space/List-scoped, so the Tasks tree has nothing to show it anyway.
// Direct messages/group chats live in their own top-level "Direct Messages" Me-zone destination
// now (components/DirectMessagesPage.tsx) — they're never scoped to one workspace, so they don't
// belong here anymore.
export default function ChatChannelSidebar({ workspaceId }: ChatChannelSidebarProps) {
  const { channelsByWorkspace, activeChannelId, setActiveChannelId, fetchChannels, createChannel, renameChannel } = useChatStore();
  const channels = workspaceId ? channelsByWorkspace[workspaceId] || [] : [];
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId) fetchChannels(workspaceId);
  }, [workspaceId, fetchChannels]);

  const handleNewChannel = async () => {
    if (!workspaceId) return;
    const name = window.prompt('Channel name');
    if (!name || !name.trim()) return;
    const channel = await createChannel(workspaceId, { name: name.trim() });
    if (channel) setActiveChannelId(channel.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between px-2">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Channels</p>
          <button onClick={handleNewChannel} title="New channel" className="text-neutral-500 hover:text-blue-400 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {channels.length === 0 && <p className="text-[11px] text-neutral-500 px-2">No channels yet.</p>}
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
            <div key={c.id} className="group relative">
              <button
                onClick={() => setActiveChannelId(c.id)}
                className={`w-full text-left py-1.5 pr-6 rounded text-xs font-medium transition flex items-center gap-1.5 cursor-pointer border-l-2 ${
                  activeChannelId === c.id
                    ? 'bg-neutral-800 text-white border-blue-500 pl-2'
                    : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200 border-transparent pl-2.5'
                }`}
              >
                <Hash className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                <span className="truncate">{c.name}</span>
              </button>
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
      className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-[11px] text-white focus:outline-none"
    />
  );
}

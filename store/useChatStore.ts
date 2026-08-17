import { create } from 'zustand';

export type ChatChannel = {
  id: string;
  workspaceId: string;
  type: string;
  name: string | null;
  topic: string | null;
  taskId: string | null;
  spaceId: string | null;
  isPrivate: boolean;
  accessJson: string;
  createdById: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string | null;
  author: { id: string; name: string; initials: string; color: string } | null;
  body: string;
  createdAt: string;
};

interface ChatStore {
  channelsByWorkspace: Record<string, ChatChannel[]>;
  messagesByChannel: Record<string, ChatMessage[]>;
  // Shared between the channel-picker sidebar and the message-feed panel, which are now two
  // separate components (sidebar swaps in for the Space/List tree while activeView === 'chat') —
  // lives here rather than as local component state so both stay in sync without prop drilling
  // through app/page.tsx.
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  fetchChannels: (workspaceId: string) => Promise<void>;
  createChannel: (
    workspaceId: string,
    opts: { name: string; topic?: string; isPrivate?: boolean; accessEntries?: { type: 'user' | 'role'; id: string }[]; taskId?: string; spaceId?: string }
  ) => Promise<ChatChannel | null>;
  renameChannel: (workspaceId: string, channelId: string, name: string) => Promise<void>;
  fetchMessages: (channelId: string) => Promise<void>;
  postMessage: (channelId: string, opts: { id?: string; body: string }) => Promise<ChatMessage | null>;
}

export const useChatStore = create<ChatStore>((set) => ({
  channelsByWorkspace: {},
  messagesByChannel: {},
  activeChannelId: null,

  setActiveChannelId: (id) => set({ activeChannelId: id }),

  fetchChannels: async (workspaceId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels`);
    if (!res.ok) return;
    const channels = await res.json();
    set((state) => ({ channelsByWorkspace: { ...state.channelsByWorkspace, [workspaceId]: channels } }));
  },

  createChannel: async (workspaceId, opts) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) return null;
    const channel = await res.json();
    set((state) => ({
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: [...(state.channelsByWorkspace[workspaceId] || []), channel],
      },
    }));
    return channel;
  },

  renameChannel: async (workspaceId, channelId, name) => {
    set((state) => ({
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: (state.channelsByWorkspace[workspaceId] || []).map((c) => (c.id === channelId ? { ...c, name } : c)),
      },
    }));
    await fetch(`/api/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  fetchMessages: async (channelId) => {
    const res = await fetch(`/api/channels/${channelId}/messages`);
    if (!res.ok) return;
    const messages = await res.json();
    set((state) => ({ messagesByChannel: { ...state.messagesByChannel, [channelId]: messages } }));
  },

  postMessage: async (channelId, opts) => {
    const res = await fetch(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) return null;
    const message = await res.json();
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: [...(state.messagesByChannel[channelId] || []), message],
      },
    }));
    return message;
  },
}));

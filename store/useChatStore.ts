import { create } from 'zustand';
import { useHistoryStore } from './useHistoryStore';

export type ChatDMMember = { id: string; name: string; initials: string; color: string };

export type ChatChannel = {
  id: string;
  // Nullable — non-null only for type: 'channel'. dm/group_dm rows can span people who share no
  // Workspace at all (Connections), so they're never tied to one.
  workspaceId: string | null;
  type: string;
  name: string | null;
  topic: string | null;
  taskId: string | null;
  spaceId: string | null;
  isPrivate: boolean;
  accessJson: string;
  createdById: string | null;
  // Denormalized recency — bumped server-side on every new top-level message or thread reply,
  // used to sort the flat `dms` list newest-activity-first (see fetchDMs/postMessage below).
  lastMessageAt: string;
  createdAt: string;
  // Present on every row now (channels included, via GET/POST /api/workspaces/[id]/channels'
  // `include`) — a DM has no meaningful `name` of its own (name: null always), it's rendered
  // client-side from whichever *other* members are in this list, per viewer, same as Slack/Discord.
  members?: { userId: string; user: ChatDMMember }[];
  // Only present on GET /api/workspaces/[id]/channels and GET /api/dms's own responses (Phase 8,
  // unread badges) — POST create-channel/create-DM responses don't compute it (a freshly created
  // channel has nothing unread yet), so those call sites set it to 0 locally instead.
  unreadCount?: number;
};

export type Connection = ChatDMMember & { source: 'connection' | 'workspace' };
export type ConnectionSearchResult = ChatDMMember & { status: 'connected' | 'requested-by-me' | 'requested-by-them' | 'none' };
export type ConnectionInvite = { id: string; createdAt: string };
export type ConnectionRequest = { id: string; createdAt: string; user: ChatDMMember };

export type ChatAttachment = { id: string; url: string; kind: string; fileName: string | null; byteSize: number | null };
export type ChatReaction = { id: string; emoji: string; userId: string; user: ChatDMMember };

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string | null;
  author: { id: string; name: string; initials: string; color: string } | null;
  body: string;
  createdAt: string;
  // Quote-reply (Phase 4). quotedMessageId goes null the moment the original is hard-deleted
  // (onDelete: SetNull) — the two snapshot fields are plain columns, untouched by that relation,
  // so a reply keeps showing what was actually quoted even after the original is gone. Render
  // from the snapshot always, never by re-looking-up quotedMessageId in the live message list.
  quotedMessageId: string | null;
  quotedBodySnapshot: string | null;
  quotedAuthorId: string | null;
  // Threads (Phase 5). threadRootId is set only on a reply, never on the root itself — the main
  // feed (GET /api/channels/[id]/messages) only ever returns threadRootId: null rows, so replies
  // never leak into it structurally, not just by UI convention. threadReplyCount lives on the
  // root and is denormalized (kept in sync server-side on every thread reply create/delete)
  // specifically so the "N replies" affordance never needs its own COUNT(*) per rendered message.
  threadRootId: string | null;
  threadReplyCount: number;
  // Media (Phase 6). One image per message in v1 (matches the composer's own single-pending-image
  // UI), but plural/array since the schema itself is a genuine one-to-many relation.
  attachments: ChatAttachment[];
  // Reactions (Phase 7). Flat list of individual (user, emoji) rows, not pre-grouped — grouping by
  // emoji for the pill display happens client-side (see ChatPanel.tsx's groupReactions), same
  // "server sends raw rows, client shapes them for display" split the day/run grouping above
  // already uses for messages themselves.
  reactions: ChatReaction[];
};

// What postMessage/postThreadReply accept for a pending image — already-uploaded (POST
// /api/uploads/image?context=chat happens in the composer, before this is ever called), so this
// is just the resulting url/fileName/byteSize to attach server-side.
export type PendingChatAttachment = { url: string; fileName?: string; byteSize?: number; kind?: 'image' | 'file' };

interface ChatStore {
  channelsByWorkspace: Record<string, ChatChannel[]>;
  // Flat, not workspace-keyed — a DM/group-DM never belongs to one Workspace (Connections work).
  // Sorted newest-activity-first by the server (GET /api/dms orders by lastMessageAt desc);
  // postMessage/postThreadReply re-sort client-side after an optimistic patch so the list reorders
  // immediately without waiting on a refetch.
  dms: ChatChannel[];
  connections: Connection[];
  connectionInvite: ConnectionInvite | null;
  // Pending connection requests, both directions — see app/api/connections/requests/route.ts.
  // incoming: someone opened my link, waiting on me. outgoing: I opened someone else's, waiting
  // on them. `user` on each row is always the *other* person, never the caller.
  connectionRequestsIncoming: ConnectionRequest[];
  connectionRequestsOutgoing: ConnectionRequest[];
  messagesByChannel: Record<string, ChatMessage[]>;
  threadsByRootId: Record<string, ChatMessage[]>;
  // Shared between the channel-picker sidebar and the message-feed panel, which are now two
  // separate components (sidebar swaps in for the Space/List tree while activeView === 'chat') —
  // lives here rather than as local component state so both stay in sync without prop drilling
  // through app/page.tsx.
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  // Which thread's side panel (if any) is open — a message's own id doubles as the thread id,
  // there's no separate Thread model. Cleared whenever the active channel changes (a thread
  // panel open for a channel you've navigated away from doesn't make sense to leave hanging).
  activeThreadRootId: string | null;
  setActiveThreadRootId: (id: string | null) => void;
  // Which of the Direct Messages Me-zone destination's two sub-views is showing — Chats (DM/group
  // list + ChatPanel) or Connections (connect link, requests, connections list). Shared between
  // DirectMessagesSidebar (which swaps into the main `<aside>` while activeView ===
  // 'directMessages', same pattern ChatChannelSidebar uses for 'chat') and DirectMessagesPage
  // (the content pane), same "lives in the store so two separate components stay in sync without
  // prop drilling" reasoning as activeChannelId above.
  activeDmTab: 'chats' | 'connections';
  setActiveDmTab: (tab: 'chats' | 'connections') => void;
  fetchChannels: (workspaceId: string) => Promise<void>;
  createChannel: (
    workspaceId: string,
    opts: { name: string; topic?: string; isPrivate?: boolean; accessEntries?: { type: 'user' | 'role'; id: string }[]; taskId?: string; spaceId?: string }
  ) => Promise<ChatChannel | null>;
  renameChannel: (workspaceId: string, channelId: string, name: string) => Promise<void>;
  fetchDMs: () => Promise<void>;
  // Find-or-create — one other person reopens the same 1:1 conversation every time (server-side
  // dmKey dedupe); two or more always makes a genuinely new group, never deduped.
  createOrOpenDM: (memberIds: string[]) => Promise<ChatChannel | null>;
  fetchConnections: () => Promise<void>;
  fetchConnectionInvite: () => Promise<void>;
  regenerateConnectionInvite: () => Promise<void>;
  fetchConnectionRequests: () => Promise<void>;
  // Accept refetches connections (a new one just landed) + requests (mine own list shrank) rather
  // than optimistically patching three separate pieces of local state for one action — this isn't
  // a hot-path/high-frequency action like a reaction toggle, a plain re-fetch pair is simpler and
  // correct by construction.
  acceptConnectionRequest: (id: string) => Promise<void>;
  declineConnectionRequest: (id: string) => Promise<void>;
  // Free-text name search (app/api/connections/search/route.ts) — the other way in besides
  // opening someone's personal connect link. Not cached in store state (a transient search-box
  // result, not app-wide data other components need), just returned straight to the caller.
  searchUsersToConnect: (query: string) => Promise<ConnectionSearchResult[]>;
  sendConnectionRequestTo: (userId: string) => Promise<{ status: string } | null>;
  fetchMessages: (channelId: string) => Promise<void>;
  postMessage: (
    channelId: string,
    opts: { id?: string; body: string; quotedMessageId?: string; attachment?: PendingChatAttachment }
  ) => Promise<ChatMessage | null>;
  // Hard delete (v1 decision, no soft-delete/Trash for individual messages) — mirrors
  // deleteDocComment's own shape: no history push of its own, it's purely the undo *target*
  // postMessage's own history entry calls. A direct user-initiated delete isn't itself
  // Ctrl+Z-able, same as deleting a Doc comment isn't. `threadRootId` is only needed when
  // deleting a *reply* (the caller already knows this, since it's rendering that thread) — lets
  // the optimistic update also pull the reply out of threadsByRootId and decrement the cached
  // root's threadReplyCount without waiting on the DELETE response first.
  deleteMessage: (channelId: string, messageId: string, threadRootId?: string) => Promise<void>;
  fetchThread: (rootId: string) => Promise<void>;
  postThreadReply: (
    rootId: string,
    channelId: string,
    opts: { id?: string; body: string; quotedMessageId?: string; attachment?: PendingChatAttachment }
  ) => Promise<ChatMessage | null>;
  // Immediate optimistic local patch + fire-and-forget POST, no history push — mirrors
  // resolveDocComment's own shape (low-stakes, instantly reversible by clicking again, not the
  // kind of action this app tracks in undo/redo). `currentUser` is the caller's own resolved
  // profile (from the active channel's own `.members`, same source every author-name lookup
  // already uses) — needed to render the optimistic reaction immediately, before the server
  // response (which carries the real row id) comes back. `threadRootId` only needed when
  // reacting to a thread reply, same convention as deleteMessage's own optional third param.
  toggleReaction: (channelId: string, messageId: string, emoji: string, currentUser: ChatDMMember, threadRootId?: string) => Promise<void>;
}

// Bumps a channel's lastMessageAt in the flat `dms` list and re-sorts newest-first — shared by
// postMessage/postThreadReply's optimistic patches. Harmless no-op when channelId isn't a
// currently-loaded DM/group (e.g. a real channel), same "harmless no-op" convention deleteMessage
// already uses for threadRootId.
function bumpDmRecency(dms: ChatChannel[], channelId: string, at: string): ChatChannel[] {
  if (!dms.some((d) => d.id === channelId)) return dms;
  return [...dms]
    .map((d) => (d.id === channelId ? { ...d, lastMessageAt: at } : d))
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
}

// Opening a channel (fetchMessages) is also the mark-as-read trigger server-side — zero the badge
// locally right away instead of waiting for the next poll to pick up the server's own update.
function zeroUnread(channels: ChatChannel[], channelId: string): ChatChannel[] {
  return channels.map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c));
}

export const useChatStore = create<ChatStore>((set, get) => ({
  channelsByWorkspace: {},
  dms: [],
  connections: [],
  connectionInvite: null,
  connectionRequestsIncoming: [],
  connectionRequestsOutgoing: [],
  messagesByChannel: {},
  threadsByRootId: {},
  activeChannelId: null,
  activeThreadRootId: null,
  activeDmTab: 'chats',

  setActiveChannelId: (id) => set({ activeChannelId: id, activeThreadRootId: null }),
  setActiveThreadRootId: (id) => set({ activeThreadRootId: id }),
  setActiveDmTab: (tab) => set({ activeDmTab: tab }),

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
    const channel: ChatChannel = { ...(await res.json()), unreadCount: 0 };
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

  fetchDMs: async () => {
    const res = await fetch('/api/dms');
    if (!res.ok) return;
    const dms = await res.json();
    set({ dms });
  },

  createOrOpenDM: async (memberIds) => {
    const res = await fetch('/api/dms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds }),
    });
    if (!res.ok) return null;
    const dm = await res.json();
    set((state) => {
      // A 1:1 re-open returns the same id as one already in the list — replace it in place
      // (picks up any member changes) rather than appending a duplicate row. This route's own
      // response never computes unreadCount (unlike GET /api/dms), so a re-open keeps whatever
      // the existing local entry already had (real, possibly nonzero) rather than resetting it —
      // only a genuinely brand-new DM defaults to 0 (nothing could be unread in it yet).
      const existing = state.dms.find((d) => d.id === dm.id);
      const merged: ChatChannel = { ...dm, unreadCount: existing?.unreadCount ?? 0 };
      const next = existing ? state.dms.map((d) => (d.id === dm.id ? merged : d)) : [merged, ...state.dms];
      return { dms: next };
    });
    return dm;
  },

  fetchConnections: async () => {
    const res = await fetch('/api/connections');
    if (!res.ok) return;
    set({ connections: await res.json() });
  },

  fetchConnectionInvite: async () => {
    const res = await fetch('/api/connections/invite');
    if (!res.ok) return;
    set({ connectionInvite: await res.json() });
  },

  regenerateConnectionInvite: async () => {
    const res = await fetch('/api/connections/invite', { method: 'POST' });
    if (!res.ok) return;
    set({ connectionInvite: await res.json() });
  },

  fetchConnectionRequests: async () => {
    const res = await fetch('/api/connections/requests');
    if (!res.ok) return;
    const { incoming, outgoing } = await res.json();
    set({ connectionRequestsIncoming: incoming, connectionRequestsOutgoing: outgoing });
  },

  acceptConnectionRequest: async (id) => {
    const res = await fetch(`/api/connections/requests/${id}/accept`, { method: 'POST' });
    if (!res.ok) return;
    await Promise.all([get().fetchConnections(), get().fetchConnectionRequests()]);
  },

  declineConnectionRequest: async (id) => {
    const res = await fetch(`/api/connections/requests/${id}/decline`, { method: 'POST' });
    if (!res.ok) return;
    // Works for both an incoming request (removed from connectionRequestsIncoming) and my own
    // canceled outgoing one (removed from connectionRequestsOutgoing) — filtering both lists by
    // id is a harmless no-op on whichever one the request wasn't actually in.
    set((state) => ({
      connectionRequestsIncoming: state.connectionRequestsIncoming.filter((r) => r.id !== id),
      connectionRequestsOutgoing: state.connectionRequestsOutgoing.filter((r) => r.id !== id),
    }));
  },

  searchUsersToConnect: async (query) => {
    const res = await fetch(`/api/connections/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
  },

  sendConnectionRequestTo: async (userId) => {
    const res = await fetch('/api/connections/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: userId }),
    });
    if (!res.ok) return null;
    const result = await res.json();
    // A mutual-accept lands us straight in 'connected'; either way the request lists may have
    // changed (outgoing gained one, or an incoming one that mutually resolved just disappeared).
    await Promise.all([get().fetchConnections(), get().fetchConnectionRequests()]);
    return result;
  },

  fetchMessages: async (channelId) => {
    const res = await fetch(`/api/channels/${channelId}/messages`);
    if (!res.ok) return;
    const messages = await res.json();
    set((state) => ({
      messagesByChannel: { ...state.messagesByChannel, [channelId]: messages },
      dms: zeroUnread(state.dms, channelId),
      channelsByWorkspace: Object.fromEntries(
        Object.entries(state.channelsByWorkspace).map(([wsId, channels]) => [wsId, zeroUnread(channels, channelId)])
      ),
    }));
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
      dms: bumpDmRecency(state.dms, channelId, message.createdAt),
    }));
    useHistoryStore.getState().push({
      label: 'Send message',
      undo: () => get().deleteMessage(channelId, message.id),
      redo: async () => {
        await get().postMessage(channelId, { ...opts, id: message.id });
      },
    });
    return message;
  },

  deleteMessage: async (channelId, messageId, threadRootId) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        // Harmless no-op filter when messageId is actually a thread reply — replies were never
        // in this list to begin with (the main feed route excludes them structurally).
        [channelId]: (state.messagesByChannel[channelId] || [])
          .filter((m) => m.id !== messageId)
          .map((m) => (threadRootId && m.id === threadRootId ? { ...m, threadReplyCount: Math.max(0, m.threadReplyCount - 1) } : m)),
      },
      threadsByRootId: threadRootId
        ? { ...state.threadsByRootId, [threadRootId]: (state.threadsByRootId[threadRootId] || []).filter((m) => m.id !== messageId) }
        : state.threadsByRootId,
    }));
    await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
  },

  fetchThread: async (rootId) => {
    const res = await fetch(`/api/messages/${rootId}/thread`);
    if (!res.ok) return;
    const replies = await res.json();
    set((state) => ({ threadsByRootId: { ...state.threadsByRootId, [rootId]: replies } }));
  },

  postThreadReply: async (rootId, channelId, opts) => {
    const res = await fetch(`/api/messages/${rootId}/thread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) return null;
    const reply = await res.json();
    set((state) => ({
      threadsByRootId: { ...state.threadsByRootId, [rootId]: [...(state.threadsByRootId[rootId] || []), reply] },
      // Keep the root's own cached threadReplyCount in step, same reasoning as deleteMessage's
      // matching decrement — the "N replies" affordance in the main feed reads this, not a
      // recount of threadsByRootId (which may not even be loaded if the panel isn't open).
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map((m) => (m.id === rootId ? { ...m, threadReplyCount: m.threadReplyCount + 1 } : m)),
      },
      dms: bumpDmRecency(state.dms, channelId, reply.createdAt),
    }));
    useHistoryStore.getState().push({
      label: 'Reply in thread',
      undo: () => get().deleteMessage(channelId, reply.id, rootId),
      redo: async () => {
        await get().postThreadReply(rootId, channelId, { ...opts, id: reply.id });
      },
    });
    return reply;
  },

  toggleReaction: async (channelId, messageId, emoji, currentUser, threadRootId) => {
    const patch = (m: ChatMessage): ChatMessage => {
      if (m.id !== messageId) return m;
      const existing = m.reactions.find((r) => r.userId === currentUser.id && r.emoji === emoji);
      return {
        ...m,
        reactions: existing
          ? m.reactions.filter((r) => r.id !== existing.id)
          // Deterministic id (not a random one) — the real-time signal this POST also fires
          // triggers a refetch shortly after, which replaces this placeholder with the server's
          // real row without a visible flash/duplicate.
          : [...m.reactions, { id: `optimistic:${currentUser.id}:${emoji}`, emoji, userId: currentUser.id, user: currentUser }],
      };
    };
    set((state) => ({
      // Harmless no-op map when messageId isn't in a given bucket (e.g. reacting to a thread
      // reply only ever touches threadsByRootId, never messagesByChannel), same "harmless no-op"
      // convention deleteMessage already uses for threadRootId.
      messagesByChannel: { ...state.messagesByChannel, [channelId]: (state.messagesByChannel[channelId] || []).map(patch) },
      threadsByRootId: threadRootId
        ? { ...state.threadsByRootId, [threadRootId]: (state.threadsByRootId[threadRootId] || []).map(patch) }
        : state.threadsByRootId,
    }));
    await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
  },
}));

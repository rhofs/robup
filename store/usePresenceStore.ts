import { create } from 'zustand';

// "Who has the app open right now" — small, standalone (same isolation pattern as
// useSessionStore.ts) so it stays swappable if real presence/session infra is ever built later.
// Populated by lib/collab/usePresenceConnection.ts, mounted once in app/page.tsx; read by
// components/PersonAvatar.tsx wherever an avatar renders.
interface PresenceStore {
  onlineUserIds: Set<string>;
  setOnlineUserIds: (ids: Set<string>) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  onlineUserIds: new Set(),
  setOnlineUserIds: (ids) => set({ onlineUserIds: ids }),
}));

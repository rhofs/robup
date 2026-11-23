import { useEffect, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useTaskStore } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { presenceDocumentName } from './presenceRoom';
import { collabWsUrl, isCollabRealtimeEnabled } from './collabWsUrl';

// Genuine live "who's online" detection, reusing the same Hocuspocus sidecar already running for
// Doc collaboration (server/collabServer.ts) — a dedicated awareness-only room, no persisted
// content, one per workspace (see presenceDocumentName — an earlier version used a single global
// room name here, which leaked presence across every workspace regardless of membership; the
// server now also enforces this via onAuthenticate, this scoping is what makes that check
// meaningful in the first place). Mounted once in app/page.tsx's PageContent for the whole app
// session, not per-view — reconnects whenever the active workspace changes.
// No manual heartbeat needed: Yjs awareness already clears a peer's state the instant its
// WebSocket disconnects — the same mechanism components/collab/PresenceBar.tsx already relies on
// for per-doc "who's viewing this doc."
export function usePresenceConnection(workspaceId: string | null): void {
  const users = useTaskStore((s) => s.users);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const currentUser = users.find((u) => u.id === currentUserId);
  const setOnlineUserIds = usePresenceStore((s) => s.setOnlineUserIds);

  // Provider lifecycle lives in an effect, not useMemo — same Strict-Mode-safe pattern as
  // CollabDocEditor.tsx (a HocuspocusProvider's constructor opens a real WebSocket, a side effect
  // useMemo isn't safe for under React's dev-mode double-invocation).
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!workspaceId || !isCollabRealtimeEnabled()) {
      setProvider(null);
      return;
    }
    const p = new HocuspocusProvider({
      url: collabWsUrl(),
      name: presenceDocumentName(workspaceId),
    });
    setProvider(p);
    return () => {
      p.destroy();
    };
  }, [workspaceId]);

  // Keep the broadcast identity in sync with "You are: ..." without reconnecting the socket.
  useEffect(() => {
    if (!provider || !currentUser) return;
    provider.setAwarenessField('user', { userId: currentUser.id, name: currentUser.name, color: currentUser.color });
  }, [provider, currentUser]);

  // The same room also carries "tasks or events here just changed" from the server
  // (lib/collab/broadcastWorkspaceChange.ts) — fetch now rather than at the next 30-second poll.
  // Gathered for a moment first: a run of signals becomes one fetch, and the fetch itself already
  // steps aside for this tab's own writes still on their way (lib/pendingWrites.ts).
  useEffect(() => {
    if (!provider) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = ({ payload }: { payload: string }) => {
      let type: unknown;
      try {
        type = JSON.parse(payload)?.type;
      } catch {
        return;
      }
      if (type !== 'data-changed' || timer) return;
      timer = setTimeout(() => {
        timer = null;
        const store = useTaskStore.getState();
        void store.refetchTasks();
        void store.refetchEvents();
      }, 600);
    };
    provider.on('stateless', handler);
    return () => {
      provider.off('stateless', handler);
      if (timer) clearTimeout(timer);
    };
  }, [provider]);

  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) return;
    const sync = () => {
      const ids = new Set<string>();
      awareness.getStates().forEach((state) => {
        if (state.user?.userId) ids.add(state.user.userId);
      });
      setOnlineUserIds(ids);
    };
    sync();
    awareness.on('change', sync);
    return () => awareness.off('change', sync);
  }, [provider, setOnlineUserIds]);
}

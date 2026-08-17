import { useEffect, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { chatDocumentName } from './chatRoom';

// Real-time delivery for Chat (Phase 2) — mirrors usePresenceConnection.ts's exact lifecycle
// (provider create/destroy lives in a useEffect + useState pair, not useMemo, since a
// HocuspocusProvider's constructor opens a real WebSocket — a side effect React's dev-mode Strict
// Mode double-invoke isn't safe for inside useMemo, per this codebase's own documented gotcha).
//
// The room carries no real content, only a discrete "something changed" stateless signal (see
// server/collabServer.ts's onStateless hook and lib/collab/broadcastChatSignal.ts) — onSignal is
// expected to just re-fetch the channel's messages via the normal REST endpoint, same as the
// manual refresh button already does. A signal missed during a brief disconnect isn't queued —
// HocuspocusProvider reconnects on its own, but whatever happened while offline is only ever
// caught up to via the next real fetch, never replayed.
export function useChatChannelConnection(channelId: string | null, onSignal: () => void): void {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!channelId) {
      setProvider(null);
      return;
    }
    const p = new HocuspocusProvider({
      url: `ws://${window.location.hostname}:1234`,
      name: chatDocumentName(channelId),
    });
    setProvider(p);
    return () => {
      p.destroy();
    };
  }, [channelId]);

  useEffect(() => {
    if (!provider) return;
    const handler = () => onSignal();
    provider.on('stateless', handler);
    return () => {
      provider.off('stateless', handler);
    };
  }, [provider, onSignal]);
}

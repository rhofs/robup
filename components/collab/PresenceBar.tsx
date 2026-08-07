'use client';

import { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';

type PresenceUser = { clientId: number; name: string; color: string };

// "Who's viewing this doc right now" row, driven directly by the Yjs awareness protocol
// (provider.awareness) rather than Tiptap's own editor.storage.collaborationCaret.users — that
// storage is updated internally by CollaborationCaret on the same awareness changes, but reading
// awareness directly here means this bar works even before an editor instance exists/re-renders.
export default function PresenceBar({ provider }: { provider: HocuspocusProvider }) {
  const [peers, setPeers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const sync = () => {
      const localId = awareness.clientID;
      const next: PresenceUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === localId || !state.user) return;
        next.push({ clientId, name: state.user.name, color: state.user.color });
      });
      setPeers(next);
    };
    sync();
    awareness.on('change', sync);
    return () => awareness.off('change', sync);
  }, [provider]);

  if (peers.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {peers.map((p) => (
        <span
          key={p.clientId}
          title={`${p.name} is viewing this doc`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: p.color }}
        >
          {p.name}
        </span>
      ))}
    </div>
  );
}

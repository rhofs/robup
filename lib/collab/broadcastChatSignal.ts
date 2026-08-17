import { HocuspocusProvider } from '@hocuspocus/provider';
import { chatDocumentName } from './chatRoom';

// Server-only — called from app/api/channels/[id]/messages/route.ts (the Next.js process) right
// after a message commits, to tell the separate Hocuspocus sidecar (server/collabServer.ts) "a
// new message landed here, tell anyone connected." Opens a short-lived connection authenticated
// via CHAT_BROADCAST_SECRET (server/collabServer.ts's onAuthenticate has a narrow bypass for this
// exact token, scoped to chat rooms only) — never a real user identity, since this call has none.
// Fire-and-forget by design (see call site): a lost signal here just means a client falls back to
// its next manual refresh, never lost data (the message itself is already committed in Postgres).
export function broadcastChatSignal(channelId: string): void {
  if (!process.env.CHAT_BROADCAST_SECRET) {
    console.warn('CHAT_BROADCAST_SECRET is not set — skipping real-time chat broadcast for', channelId);
    return;
  }
  const provider = new HocuspocusProvider({
    url: `ws://localhost:${process.env.COLLAB_PORT ?? 1234}`,
    name: chatDocumentName(channelId),
    token: process.env.CHAT_BROADCAST_SECRET,
    onSynced: () => {
      provider.sendStateless(JSON.stringify({ type: 'new-message' }));
      // Give the send a beat to actually flush over the socket before tearing it down.
      setTimeout(() => provider.destroy(), 250);
    },
    onAuthenticationFailed: (data) => {
      console.error('broadcastChatSignal: authentication failed', data);
      provider.destroy();
    },
  });
}

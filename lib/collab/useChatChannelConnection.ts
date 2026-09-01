import { useCallback, useEffect, useRef, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { chatDocumentName } from './chatRoom';
import { collabWsUrl, isCollabRealtimeEnabled } from './collabWsUrl';

const TYPING_EXPIRY_MS = 3000;

export type TypingUser = { id: string; name: string };

// Real-time delivery for Chat (Phase 2) — mirrors usePresenceConnection.ts's exact lifecycle
// (provider create/destroy lives in a useEffect + useState pair, not useMemo, since a
// HocuspocusProvider's constructor opens a real WebSocket — a side effect React's dev-mode Strict
// Mode double-invoke isn't safe for inside useMemo, per this codebase's own documented gotcha).
//
// The room carries no real content, only discrete stateless signals — server/collabServer.ts's
// onStateless hook re-broadcasts anything it receives to every connection on the room verbatim
// (including back to the sender itself — there's no server-side self-exclusion), so every consumer
// here has to recognize and ignore its own signals where that matters (typing does; the
// message-posted signal doesn't care, a redundant refetch of your own just-sent message is
// harmless). Two kinds share the one room rather than each getting its own: `{type:'new-message'}`
// (server→client only, from broadcastChatSignal.ts right after a POST commits — onMessageSignal is
// expected to just re-fetch via the normal REST endpoint, same as the manual refresh button) and
// `{type:'typing', userId, name}` (client→client, sent directly by whoever's composing via the
// returned `notifyTyping`). A signal missed during a brief disconnect isn't queued —
// HocuspocusProvider reconnects on its own, but whatever happened while offline is only ever
// caught up to via the next real fetch (for messages) or simply expires away on its own (for
// typing — nothing to "catch up" on there).
export function useChatChannelConnection(
  channelId: string | null,
  onMessageSignal: () => void,
  // Optional — ChatThreadPanel doesn't surface a typing indicator (a thread reply composer is a
  // much rarer, lower-traffic surface than the main channel one), so it calls this with just the
  // first two args and ignores the returned notifyTyping/typingUsers entirely.
  currentUser: { id: string; name: string } | null = null
): { typingUsers: TypingUser[]; notifyTyping: () => void } {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimersRef = useRef<Map<string, number>>(new Map());

  // Polling fallback for whenever the WebSocket signal isn't available — which today is *always*
  // in production, since NEXT_PUBLIC_COLLAB_WS_ENABLED is still unset there (see collabWsUrl.ts):
  // the effect below returns immediately, nothing ever calls onMessageSignal, and a conversation
  // simply never updates until the page is reloaded. Reported live: "må refreshe for å se
  // meldinger poppe opp." Without this, chat is only real-time on localhost, which is the one
  // place it matters least.
  //
  // 6s, not the 30s the unread-badge/invite polls elsewhere in the app use: those keep a number in
  // a corner roughly fresh, while this is someone waiting for a reply in an open conversation, and
  // 30s reads as broken. Skipped entirely while the tab is hidden — a backgrounded conversation
  // has nobody watching it, and it catches up on the visibilitychange below the moment it returns.
  //
  // Deliberately kept even once the WebSocket is enabled would be wrong, so it isn't: this only
  // runs when realtime is genuinely off. When the socket is live it stays the sole mechanism, and
  // its own comment above about missed signals during a brief disconnect still applies.
  useEffect(() => {
    if (!channelId || isCollabRealtimeEnabled()) return;
    const tick = () => {
      if (!document.hidden) onMessageSignal();
    };
    const interval = window.setInterval(tick, 6000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [channelId, onMessageSignal]);

  useEffect(() => {
    if (!channelId || !isCollabRealtimeEnabled()) {
      setProvider(null);
      return;
    }
    const p = new HocuspocusProvider({
      url: collabWsUrl(),
      name: chatDocumentName(channelId),
    });
    setProvider(p);
    return () => {
      p.destroy();
    };
  }, [channelId]);

  // Switching channels invalidates any "X is typing" state left over from the previous one —
  // otherwise it'd sit there (up to TYPING_EXPIRY_MS) attributed to the wrong conversation.
  useEffect(() => {
    setTypingUsers([]);
    typingTimersRef.current.forEach((t) => window.clearTimeout(t));
    typingTimersRef.current.clear();
  }, [channelId]);

  useEffect(() => {
    if (!provider) return;
    const handler = ({ payload }: { payload: string }) => {
      let msg: { type?: string; userId?: string; name?: string };
      try {
        msg = JSON.parse(payload);
      } catch {
        return;
      }
      if (msg.type === 'new-message') {
        onMessageSignal();
        return;
      }
      if (msg.type === 'typing' && msg.userId && msg.userId !== currentUser?.id) {
        const { userId, name } = msg as { userId: string; name: string };
        setTypingUsers((prev) => (prev.some((u) => u.id === userId) ? prev : [...prev, { id: userId, name }]));
        const existingTimer = typingTimersRef.current.get(userId);
        if (existingTimer !== undefined) window.clearTimeout(existingTimer);
        // No explicit "stopped typing" signal — a composer that goes quiet (sent, or just paused)
        // simply stops re-pinging, so this expiry is what actually clears the indicator, not an
        // event. Same tradeoff Slack/Discord's own typing indicators make.
        const timer = window.setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== userId));
          typingTimersRef.current.delete(userId);
        }, TYPING_EXPIRY_MS);
        typingTimersRef.current.set(userId, timer);
      }
    };
    provider.on('stateless', handler);
    return () => {
      provider.off('stateless', handler);
    };
  }, [provider, onMessageSignal, currentUser?.id]);

  // Cleanup on unmount — the channel-change effect above already handles a channel switch, this
  // only covers the component going away entirely.
  useEffect(() => {
    return () => {
      typingTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const notifyTyping = useCallback(() => {
    if (!provider || !currentUser) return;
    provider.sendStateless(JSON.stringify({ type: 'typing', userId: currentUser.id, name: currentUser.name }));
  }, [provider, currentUser]);

  return { typingUsers, notifyTyping };
}

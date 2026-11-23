import { HocuspocusProvider } from '@hocuspocus/provider';
import { prisma } from '@/lib/prisma';
import { presenceDocumentName } from './presenceRoom';

// Server-only. Tells everyone who has a workspace open that its tasks or events just changed, so
// their screens fetch the new state now instead of at the next 30-second poll (app/page.tsx).
//
// Tasks and events had no live updates at all — a colleague's change, or your own from another
// device, showed up within half a minute or on reload. It became impossible to overlook once
// people sat watching an AI agent work: "dette burde jo skje live og ikke kun ved refresh"
// (2026-11-23). It is not an agent feature, though: every change by anyone goes through here.
//
// The signal carries nothing but "changed". Each client then asks the ordinary API, which applies
// the ordinary access rules — so nothing about a private task travels over the room, and a missed
// signal costs nothing but the wait for the next poll, which is still there as the fallback.
//
// It rides on the room every open app already holds per workspace for "who is online"
// (usePresenceConnection), through the same server-to-server bridge chat uses
// (broadcastChatSignal.ts): a short-lived connection to the Hocuspocus sidecar, let in by
// CHAT_BROADCAST_SECRET (server/collabServer.ts's onAuthenticate). Without that secret, or without
// the sidecar, nothing is sent and nothing breaks.

const WAIT_MS = 400; // quiet time before sending — an action touching fifty tasks sends once
const MAX_WAIT_MS = 2000; // …but a long run of changes still gets through every couple of seconds

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; first: number }>();

function send(workspaceId: string) {
  pending.delete(workspaceId);
  const secret = process.env.CHAT_BROADCAST_SECRET;
  if (!secret) return;
  try {
    const provider = new HocuspocusProvider({
      url: `ws://localhost:${process.env.COLLAB_PORT ?? 1234}`,
      name: presenceDocumentName(workspaceId),
      token: secret,
      onSynced: () => {
        provider.sendStateless(JSON.stringify({ type: 'data-changed' }));
        // Give the send a beat to flush over the socket before tearing it down.
        setTimeout(() => provider.destroy(), 250);
      },
      onAuthenticationFailed: () => provider.destroy(),
    });
    // No sidecar to reach (local dev without it): do not keep retrying forever.
    setTimeout(() => provider.destroy(), 5000);
  } catch (err) {
    console.error('broadcastWorkspaceChange failed', err);
  }
}

export function signalWorkspaceChanged(workspaceId: string | null | undefined): void {
  if (!workspaceId) return;
  const now = Date.now();
  const waiting = pending.get(workspaceId);
  if (waiting) {
    clearTimeout(waiting.timer);
    if (now - waiting.first >= MAX_WAIT_MS) {
      send(workspaceId);
      return;
    }
  }
  pending.set(workspaceId, { first: waiting?.first ?? now, timer: setTimeout(() => send(workspaceId), WAIT_MS) });
}

// For a route that knows the List or the task it changed, not the workspace. Never awaited by the
// caller and never throws: a change that was saved must not fail because announcing it did.
export function signalChangeIn(where: { listId?: string | null; taskId?: string | null }): void {
  void (async () => {
    try {
      if (where.listId) {
        const list = await prisma.list.findUnique({ where: { id: where.listId }, select: { space: { select: { workspaceId: true } } } });
        signalWorkspaceChanged(list?.space.workspaceId);
      } else if (where.taskId) {
        const task = await prisma.task.findUnique({ where: { id: where.taskId }, select: { list: { select: { space: { select: { workspaceId: true } } } } } });
        signalWorkspaceChanged(task?.list.space.workspaceId);
      }
    } catch (err) {
      console.error('signalChangeIn failed', err);
    }
  })();
}

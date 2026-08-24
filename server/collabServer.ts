import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { PrismaClient } from '@prisma/client';
import { getToken } from 'next-auth/jwt';
import { yXmlFragmentToProsemirrorJSON, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { collabSchema } from '../lib/collab/schema';
import { legacyContentToDocJSON } from '../lib/collab/legacyContentToDocJSON';
import { docJSONToPlainText } from '../lib/collab/docJSONToPlainText';
import { isPresenceDocumentName, workspaceIdFromPresenceDocumentName } from '../lib/collab/presenceRoom';
import { isChatDocumentName, channelIdFromChatDocumentName } from '../lib/collab/chatRoom';
import { canSee, type AccessContext } from '../lib/auth/access';

// Standalone sidecar process (run via `npm run dev:collab` / bundled into `npm run dev` via
// concurrently — see package.json) — deliberately NOT embedded into the Next server, so `next
// dev`/`next start` stay completely untouched. A second, separate `PrismaClient` instance is
// correct here (not a duplicate of lib/prisma.ts's singleton, which exists only to survive
// Next's in-process hot-reload): this is a different OS process, pointed at the exact same
// prisma/dev.db file via schema.prisma's own datasource url.
const prisma = new PrismaClient();

const XML_FRAGMENT_FIELD = 'default';

// Resolves the Workspace that owns a given documentName, so onAuthenticate can check the
// connecting user is actually a member of it — a presence-room name carries its workspaceId
// directly; a real Doc id needs a DB lookup (a Doc is Space-scoped, Task-scoped, or both; either
// path leads back to exactly one Workspace via the schema's own foreign keys).
async function resolveWorkspaceId(documentName: string): Promise<string | null> {
  if (isPresenceDocumentName(documentName)) {
    return workspaceIdFromPresenceDocumentName(documentName);
  }
  if (isChatDocumentName(documentName)) {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelIdFromChatDocumentName(documentName) },
      select: { workspaceId: true },
    });
    return channel?.workspaceId ?? null;
  }
  const doc = await prisma.doc.findUnique({
    where: { id: documentName },
    select: {
      space: { select: { workspaceId: true } },
      task: { select: { list: { select: { space: { select: { workspaceId: true } } } } } },
    },
  });
  if (!doc) return null;
  return doc.space?.workspaceId ?? doc.task?.list.space.workspaceId ?? null;
}

const server = new Server({
  port: Number(process.env.COLLAB_PORT ?? 1234),
  debounce: 2000,
  maxDebounce: 10000,
  // Hocuspocus defaults to unloading a document from memory the instant its last client
  // disconnects, even if a debounced onStoreDocument write is still pending — a closed tab right
  // after typing would silently lose that edit. false makes it wait for the pending write first.
  unloadImmediately: false,

  // Runs once per (connection, documentName) before any load/store hook — throwing here rejects
  // the connection outright (Hocuspocus sends a permission-denied close), so a rejected client
  // never receives document content at all. Reuses the app's own Auth.js session cookie rather
  // than a separate token: cookies aren't port-scoped, so the browser already sends the exact
  // same `authjs.session-token` cookie to this sidecar (port 1234) that it sends to the main app
  // (port 3000) — `getToken` (next-auth/jwt) decodes/verifies it the same way the rest of the app
  // implicitly trusts it. This process previously loaded no env vars at all (SQLite's datasource
  // URL is hardcoded in schema.prisma, so it never needed any) — `AUTH_SECRET` now comes from
  // `--env-file=.env.local` on the npm scripts that start this process (package.json).
  async onAuthenticate({ documentName, requestHeaders, token: providedToken }) {
    // Trusted server-to-server bridge, scoped narrowly to chat rooms only — lets the message-POST
    // route (app/api/channels/[id]/messages/route.ts, running in the separate Next.js process)
    // open a short-lived connection here purely to broadcast "something changed," with no real
    // user identity of its own. Safe when CHAT_BROADCAST_SECRET is unset: `undefined ===
    // providedToken` is never true for a real (non-empty) token.
    if (
      isChatDocumentName(documentName) &&
      providedToken &&
      process.env.CHAT_BROADCAST_SECRET &&
      providedToken === process.env.CHAT_BROADCAST_SECRET
    ) {
      return;
    }

    // Auth.js only sets the `__Secure-` cookie-name prefix when it thinks the site is on HTTPS
    // (true in production, `siqt.no`; false in local dev, plain `http://localhost`) — getToken's
    // `secureCookie` option has to match that or it looks up the wrong cookie name entirely and
    // silently finds nothing. A hardcoded `secureCookie: false` here worked fine against every
    // local/dev test (including the http-proxy verification done for the /collab routing fix —
    // that ran over plain HTTP), but meant every real production connection carried a valid
    // `__Secure-authjs.session-token` cookie that this lookup could never find, since it was only
    // ever checking for the unprefixed name — silently rejecting *every* authenticated user with
    // "no valid session", not just genuinely logged-out ones. That produced exactly the
    // connect→auth-fail→reconnect loop (HocuspocusProvider auto-reconnects by default) the flicker
    // report showed. Fixed by detecting which cookie is actually present on this specific request,
    // rather than assuming one environment.
    const cookieHeader = new Headers(requestHeaders).get('cookie') ?? '';
    const secureCookie = cookieHeader.includes('__Secure-authjs.session-token=');
    const token = await getToken({ req: { headers: requestHeaders }, secret: process.env.AUTH_SECRET, secureCookie });
    const userId = token?.sub;
    if (!userId) throw new Error('Unauthorized: no valid session');

    // A dm/group_dm chat room has no workspaceId at all now (Connections work — DMs can span
    // people who share no Workspace) — its own ChatChannelMember check below is the complete and
    // correct gate for that case, so the generic workspace-membership requirement only applies to
    // real channels (and every non-chat document, unchanged).
    const chatChannelType = isChatDocumentName(documentName)
      ? (
          await prisma.chatChannel.findUnique({
            where: { id: channelIdFromChatDocumentName(documentName) },
            select: { type: true, isPrivate: true, accessJson: true },
          })
        )
      : null;
    const isDmRoom = chatChannelType?.type === 'dm' || chatChannelType?.type === 'group_dm';

    let membership: { role: string } | null = null;
    let resolvedWorkspaceId: string | null = null;
    if (!isDmRoom) {
      resolvedWorkspaceId = await resolveWorkspaceId(documentName);
      if (!resolvedWorkspaceId) throw new Error(`Unauthorized: ${documentName} does not resolve to a workspace`);

      membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: resolvedWorkspaceId, userId } },
        select: { role: true },
      });
      if (!membership) throw new Error(`Unauthorized: user is not a member of workspace ${resolvedWorkspaceId}`);
    }

    // Chat-specific tightening, after the generic membership check above — a private channel
    // needs the same canSee() grant check as everything else in this app (lib/auth/access.ts),
    // not just "is a workspace member." Public channels need nothing further. DM/group-DM rooms
    // go through a completely different check — real ChatChannelMember membership, never canSee —
    // per PLANNING.md's "canSee vs membership split" note: canSee's owner/admin-sees-everything
    // rule would otherwise let a workspace owner listen in on two other members' private DM, which
    // is exactly the leak this split exists to prevent.
    if (isChatDocumentName(documentName)) {
      const channelId = channelIdFromChatDocumentName(documentName);
      const channel = chatChannelType;
      if (channel?.type === 'dm' || channel?.type === 'group_dm') {
        const isChatMember = await prisma.chatChannelMember.findUnique({
          where: { channelId_userId: { channelId, userId } },
        });
        if (!isChatMember) throw new Error('Unauthorized: not a participant in this conversation');
      } else if (channel?.isPrivate && membership && resolvedWorkspaceId) {
        const role = membership.role as AccessContext['role'];
        const isManager = role === 'owner' || role === 'admin';
        const workspaceId = resolvedWorkspaceId;
        const heldRoleIds = isManager
          ? []
          : (
              await prisma.role.findMany({
                where: { workspaceId, members: { some: { id: userId } } },
                select: { id: true },
              })
            ).map((r) => r.id);
        const ctx: AccessContext = { userId, role, isManager, isMember: true, heldRoleIds };
        if (!canSee(channel, ctx)) throw new Error('Unauthorized: private channel');
      }
    }

    // Best-effort "contributor" tracking for the Docs Subpages table's avatar column — deliberately
    // approximate (records "has connected to edit this doc," not "has made a specific edit"; see
    // PLANNING.md). A presence or chat room isn't a real Doc row, so skip it the same way the
    // load/store hooks below do. Fire-and-forget: a lost race on this display-only field isn't
    // worth blocking the connection over.
    if (!isPresenceDocumentName(documentName) && !isChatDocumentName(documentName)) {
      prisma.doc
        .findUnique({ where: { id: documentName }, select: { contributorIdsJson: true } })
        .then((doc) => {
          if (!doc) return null;
          const ids: string[] = JSON.parse(doc.contributorIdsJson);
          if (ids.includes(userId)) return null;
          return prisma.doc.update({
            where: { id: documentName },
            data: { contributorIdsJson: JSON.stringify([...ids, userId]) },
          });
        })
        .catch((err) => console.error('Failed to record doc contributor:', err));
    }
  },

  // Stateless messages (used for chat's live-signal broadcast) do NOT auto-relay to other
  // connections on the same document — confirmed by spiking against this exact installed version
  // (4.5.0) before wiring this up for real: without this hook explicitly re-broadcasting, a
  // sender's sendStateless() call reaches the server and is silently dropped, no other client ever
  // sees it. document.broadcastStateless(payload) is what actually fans it out.
  async onStateless({ document, payload }) {
    document.broadcastStateless(payload);
  },

  async onLoadDocument({ document, documentName }) {
    // The workspace-presence room and a chat room both carry no persisted content, only
    // ephemeral awareness/stateless-signal traffic — neither is a real Doc row, so skip the DB
    // lookup entirely for both.
    if (isPresenceDocumentName(documentName) || isChatDocumentName(documentName)) return;

    const doc = await prisma.doc.findUnique({ where: { id: documentName } });
    if (!doc) throw new Error(`Doc ${documentName} not found`);

    const fragment = document.getXmlFragment(XML_FRAGMENT_FIELD);

    if (doc.ydoc) {
      Y.applyUpdate(document, doc.ydoc);
      return;
    }

    // Never-yet-collaborative doc — seed the Y.Doc from the legacy plain-text `content` (which may
    // contain `@[Label](kind:id)` mention tokens) so the first person to open it sees exactly what
    // the old textarea showed. Hocuspocus coalesces concurrent first-loads of the same
    // documentName internally, so this only ever runs once per doc regardless of how many clients
    // race to open it first.
    const json = legacyContentToDocJSON(doc.content);
    prosemirrorJSONToYXmlFragment(collabSchema, json, fragment);
    await prisma.doc.update({
      where: { id: documentName },
      data: { ydoc: Buffer.from(Y.encodeStateAsUpdate(document)) },
    });
  },

  async onStoreDocument({ document, documentName }) {
    if (isPresenceDocumentName(documentName) || isChatDocumentName(documentName)) return;

    const json = yXmlFragmentToProsemirrorJSON(document.getXmlFragment(XML_FRAGMENT_FIELD));
    await prisma.doc.update({
      where: { id: documentName },
      data: {
        ydoc: Buffer.from(Y.encodeStateAsUpdate(document)),
        content: docJSONToPlainText(json),
      },
    });
  },
});

server.listen();

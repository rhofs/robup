import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { PrismaClient } from '@prisma/client';
import { getToken } from 'next-auth/jwt';
import { yXmlFragmentToProsemirrorJSON, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { collabSchema } from '../lib/collab/schema';
import { legacyContentToDocJSON } from '../lib/collab/legacyContentToDocJSON';
import { docJSONToPlainText } from '../lib/collab/docJSONToPlainText';
import { isPresenceDocumentName, workspaceIdFromPresenceDocumentName } from '../lib/collab/presenceRoom';

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
  async onAuthenticate({ documentName, requestHeaders }) {
    const token = await getToken({ req: { headers: requestHeaders }, secret: process.env.AUTH_SECRET, secureCookie: false });
    const userId = token?.sub;
    if (!userId) throw new Error('Unauthorized: no valid session');

    const workspaceId = await resolveWorkspaceId(documentName);
    if (!workspaceId) throw new Error(`Unauthorized: ${documentName} does not resolve to a workspace`);

    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) throw new Error(`Unauthorized: user is not a member of workspace ${workspaceId}`);

    // Best-effort "contributor" tracking for the Docs Subpages table's avatar column — deliberately
    // approximate (records "has connected to edit this doc," not "has made a specific edit"; see
    // PLANNING.md). A presence room isn't a real Doc row, so skip it the same way the load/store
    // hooks below do. Fire-and-forget: a lost race on this display-only field isn't worth blocking
    // the connection over.
    if (!isPresenceDocumentName(documentName)) {
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

  async onLoadDocument({ document, documentName }) {
    // The workspace-presence room carries no persisted content, only ephemeral awareness state
    // (who's connected) — it isn't a real Doc row, so skip the DB lookup entirely.
    if (isPresenceDocumentName(documentName)) return;

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
    if (isPresenceDocumentName(documentName)) return;

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

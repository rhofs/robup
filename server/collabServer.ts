import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { PrismaClient } from '@prisma/client';
import { yXmlFragmentToProsemirrorJSON, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { collabSchema } from '../lib/collab/schema';
import { legacyContentToDocJSON } from '../lib/collab/legacyContentToDocJSON';
import { docJSONToPlainText } from '../lib/collab/docJSONToPlainText';

// Standalone sidecar process (run via `npm run dev:collab` / bundled into `npm run dev` via
// concurrently — see package.json) — deliberately NOT embedded into the Next server, so `next
// dev`/`next start` stay completely untouched. A second, separate `PrismaClient` instance is
// correct here (not a duplicate of lib/prisma.ts's singleton, which exists only to survive
// Next's in-process hot-reload): this is a different OS process, pointed at the exact same
// prisma/dev.db file via schema.prisma's own datasource url.
const prisma = new PrismaClient();

const XML_FRAGMENT_FIELD = 'default';

const server = new Server({
  port: Number(process.env.COLLAB_PORT ?? 1234),
  debounce: 2000,
  maxDebounce: 10000,
  // Hocuspocus defaults to unloading a document from memory the instant its last client
  // disconnects, even if a debounced onStoreDocument write is still pending — a closed tab right
  // after typing would silently lose that edit. false makes it wait for the pending write first.
  unloadImmediately: false,

  async onLoadDocument({ document, documentName }) {
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

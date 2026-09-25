import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { prisma } from '@/lib/prisma';
import { collabSchema } from '@/lib/collab/schema';
import { docJSONToPlainText } from '@/lib/collab/docJSONToPlainText';
import { WIKI_TEMPLATE } from './templates';

const XML_FRAGMENT_FIELD = 'default';

// A page's stored content from ProseMirror JSON: the Yjs state the collab server loads, plus the
// plain-text mirror (Doc.content) that search reads — the same pair onStoreDocument writes on every
// edit, so a seeded page is indistinguishable from one someone typed.
export function contentFromJSON(json: Record<string, unknown>): { ydoc: Uint8Array<ArrayBuffer>; content: string } {
  const ydoc = new Y.Doc();
  prosemirrorJSONToYXmlFragment(collabSchema, json, ydoc.getXmlFragment(XML_FRAGMENT_FIELD));
  const roundTripped = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(XML_FRAGMENT_FIELD));
  // Copied into a fresh ArrayBuffer-backed array: what Prisma's Bytes type accepts.
  return { ydoc: new Uint8Array(Y.encodeStateAsUpdate(ydoc)), content: docJSONToPlainText(roundTripped) };
}

export const EMPTY_PAGE = { type: 'doc', content: [{ type: 'paragraph' }] };

// One seeding at a time per workspace. Two people opening an empty wiki in the same second would
// otherwise both see "no pages" and both create the template — a single Next process, so an
// in-memory lock is enough.
const seeding = new Map<string, Promise<void>>();

// Creates the starting chapters the first time a workspace's wiki is opened. Deleted pages count as
// existing: someone who removed the template on purpose must not find it back the next day.
export async function ensureWikiSeeded(workspaceId: string): Promise<void> {
  const running = seeding.get(workspaceId);
  if (running) return running;
  const job = (async () => {
    const existing = await prisma.doc.count({ where: { wikiWorkspaceId: workspaceId } });
    if (existing > 0) return;
    await prisma.$transaction(async (tx) => {
      for (const [ci, chapter] of WIKI_TEMPLATE.entries()) {
        const created = await tx.doc.create({
          data: { wikiWorkspaceId: workspaceId, title: chapter.title, order: ci, ...contentFromJSON(chapter.body) },
        });
        for (const [pi, page] of chapter.pages.entries()) {
          await tx.doc.create({
            data: { wikiWorkspaceId: workspaceId, parentId: created.id, title: page.title, order: pi, ...contentFromJSON(page.body) },
          });
        }
      }
    });
  })().finally(() => seeding.delete(workspaceId));
  seeding.set(workspaceId, job);
  return job;
}

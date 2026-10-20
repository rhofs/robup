import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { collabSchema } from './schema';
import { docJSONToPlainText } from './docJSONToPlainText';

const XML_FRAGMENT_FIELD = 'default';

// A page's stored content from ProseMirror JSON: the Yjs state the collab server loads, plus the
// plain-text mirror (Doc.content) that search reads — the same pair onStoreDocument writes on every
// edit, so a seeded page is indistinguishable from one someone typed. Used for wiki pages
// (lib/wiki/seed.ts) and a task's description doc (app/api/tasks/[id]/description-doc).
export function contentFromJSON(json: Record<string, unknown>): { ydoc: Uint8Array<ArrayBuffer>; content: string } {
  const ydoc = new Y.Doc();
  prosemirrorJSONToYXmlFragment(collabSchema, json, ydoc.getXmlFragment(XML_FRAGMENT_FIELD));
  const roundTripped = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(XML_FRAGMENT_FIELD));
  // Copied into a fresh ArrayBuffer-backed array: what Prisma's Bytes type accepts.
  return { ydoc: new Uint8Array(Y.encodeStateAsUpdate(ydoc)), content: docJSONToPlainText(roundTripped) };
}

import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type { Doc } from '@prisma/client';
import { legacyContentToDocJSON } from './legacyContentToDocJSON';

const XML_FRAGMENT_FIELD = 'default';

// Shared by every export path (PDF, Google Docs) — the same ydoc-load-or-legacy-fallback logic
// server/collabServer.ts's onLoadDocument already uses, so an export sees exactly the same
// content a live collaborative open would, not the plain-text `Doc.content` mirror (which has
// already lost bold/italic/heading/list structure).
export function loadDocJSONForExport(doc: Doc): Record<string, any> {
  if (doc.ydoc) {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, doc.ydoc);
    return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(XML_FRAGMENT_FIELD));
  }
  return legacyContentToDocJSON(doc.content);
}

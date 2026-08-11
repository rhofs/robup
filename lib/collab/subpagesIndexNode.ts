import { Node, mergeAttributes } from '@tiptap/core';

// A live "Subpages" table block a user inserts into a Doc's own written content (via the "/"
// slash menu) — shows that doc's own child pages (title, owner, contributors), same table this
// app once rendered as a fixed block above the editor before moving to a side panel; this brings
// it back as a real, positionable piece of content instead. Block-level atom (a whole table, not
// a text-flow chip like `mention`) — framework-agnostic (no React) for the same reason
// mentionNode.ts is: both the sidecar server (schema/migration only) and the client editor import
// the identical definition, visual table rendering is layered on top client-side only, see
// components/collab/subpagesIndexNodeView.tsx.
export interface SubpagesIndexAttrs {
  docId: string;
}

export const SubpagesIndexNode = Node.create({
  name: 'subpagesIndex',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      docId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-subpages-index-doc-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-subpages-index-doc-id': node.attrs.docId }), 'Subpages'];
  },

  renderText() {
    return '[Subpages]';
  },
});

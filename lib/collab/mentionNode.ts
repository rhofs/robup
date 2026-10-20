import { Node, mergeAttributes } from '@tiptap/core';
import type { MentionKind } from '../mentions';

// Tiptap equivalent of the plain-text `@[Label](kind:id)` convention (lib/mentions.ts) used by
// Comments/the old textarea editors. An inline atom so it behaves as one unit for cursor movement
// and selection, same as the old token did in a <textarea>. Framework-agnostic (no React) so both
// the sidecar server (schema/migration only) and the client editor import the identical definition
// — visual chip rendering is layered on top client-side only, see components/collab/mentionNodeView.tsx.
export interface MentionAttrs {
  kind: MentionKind;
  id: string;
  label: string;
}

export const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  // Read from the data-mention-* attributes first. Without that, a mention written as HTML by
  // anything but this node's own renderHTML (which also happens to emit bare kind/id/label) came
  // back with every attribute null — lib/richText.ts's plainToHtml, which turns an old plain-text
  // description into HTML, writes only the data-* ones.
  addAttributes() {
    const fromHtml = (name: 'kind' | 'id' | 'label') => (element: HTMLElement) =>
      element.getAttribute(`data-mention-${name}`) ?? element.getAttribute(name);
    return {
      kind: { default: null, parseHTML: fromHtml('kind') },
      id: { default: null, parseHTML: fromHtml('id') },
      label: { default: null, parseHTML: fromHtml('label') },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-kind]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention-kind': node.attrs.kind,
        'data-mention-id': node.attrs.id,
        'data-mention-label': node.attrs.label,
      }),
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return node.attrs.label;
  },
});

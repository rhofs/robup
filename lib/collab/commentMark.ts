import { Mark, mergeAttributes } from '@tiptap/core';

// Selection-anchored comments — wraps existing text (a Mark, not a Node, since it decorates
// content rather than replacing it) with a `commentId` linking it back to a DocComment thread
// (prisma/schema.prisma). Applied directly to the current selection rather than via a toggle
// command (see components/collab/commentMarkView.tsx's addComment), and removed (not toggled) on
// resolve. Framework-agnostic (no React) for the same reason mentionNode.ts/subpagesIndexNode.ts
// are — both the sidecar server (schema/migration only) and the client editor import the
// identical definition; interactive click-to-open behavior is layered on client-side only.
export interface CommentMarkAttrs {
  commentId: string;
}

export const CommentMark = Mark.create({
  name: 'comment',

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => ({ 'data-comment-id': attrs.commentId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes, { class: 'doc-comment-mark' }), 0];
  },
});

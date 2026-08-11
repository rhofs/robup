'use client';

import { Plugin } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';
import { CommentMark } from '../../lib/collab/commentMark';

export type CommentMarkExtensionOptions = {
  onCommentClick?: (commentId: string) => void;
};

// Client-only extension of the shared, framework-agnostic CommentMark (see mentionNodeView.tsx
// for the identical pattern applied to `mention`) — adds click-to-open-thread behavior, which the
// server doesn't need. Marks don't support addNodeView() (Node-only in Tiptap), so interactivity
// is wired via a plain ProseMirror plugin's handleClick instead of a React node view.
export const ClientCommentMark = CommentMark.extend<CommentMarkExtensionOptions>({
  addOptions() {
    return { onCommentClick: undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        props: {
          handleClick(_view, _pos, event) {
            const target = (event.target as HTMLElement)?.closest('[data-comment-id]');
            const commentId = target?.getAttribute('data-comment-id');
            if (commentId) {
              options.onCommentClick?.(commentId);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

// Resolving a thread clears its highlight from the text (leaving the text itself untouched) —
// matches Google Docs' own behavior. Scans the whole document rather than using the original
// {from,to} range, since the range may have shifted from edits made since the comment was added;
// walking every text node for a matching mark attr is the only way to reliably find every
// (possibly now-discontiguous) span still carrying this commentId. A plain helper rather than a
// registered Tiptap command — avoids the TS module-augmentation ceremony for one call site.
export function removeCommentMarkFromDoc(editor: Editor, commentId: string) {
  const { state, view } = editor;
  const commentMarkType = state.schema.marks.comment;
  if (!commentMarkType) return;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type === commentMarkType && m.attrs.commentId === commentId);
    if (mark) {
      tr.removeMark(pos, pos + node.nodeSize, commentMarkType);
    }
  });
  if (tr.docChanged) view.dispatch(tr);
}

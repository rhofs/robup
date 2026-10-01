import { Node, mergeAttributes } from '@tiptap/core';

// A live view of one List's tasks inside a Doc — ClickUp's "ClickUp List (Table)" block, inserted from
// the "/" menu or the "+" in the margin. Holds only the List's id: the rows are the real tasks, read
// from the store as the doc renders, so ticking one off or renaming it here is the same change as doing
// it on the board. Inserted with `listId: null`, which makes the block show a List picker first.
// Framework-agnostic for the same reason as subpagesIndexNode.ts: the collab server builds its schema
// from this file too, and the React rendering lives client-side in taskListEmbedView.tsx.
export const TaskListEmbedNode = Node.create({
  name: 'taskListEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      listId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-task-list-embed]', getAttrs: (el) => ({ listId: (el as HTMLElement).getAttribute('data-task-list-embed') || null }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-task-list-embed': node.attrs.listId ?? '' }), 'Tasks'];
  },

  renderText() {
    return '[Tasks]';
  },
});

'use client';

import Heading from '@tiptap/extension-heading';

// Pressing Enter inside a heading should drop back to normal text on the new line, matching
// Notion/Google Docs — Tiptap's own default Enter behavior just splits the block, producing
// another heading of the same level, which isn't what "write a heading, then keep writing normal
// text" actually wants. Client-only interactive behavior (a keyboard shortcut, not a document
// structure change), so unlike the custom nodes/marks this session added, this doesn't need a
// matching entry in lib/collab/schema.ts — the schema only cares about node/mark shapes, not
// keybindings, and the underlying `heading`/`paragraph` node types are unchanged.
export const ClientHeading = Heading.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this;
        if (!editor.isActive(this.name)) return false;

        // Two separate dispatches, not one .chain() — chaining splitBlock() straight into
        // setParagraph() computed the paragraph conversion's position against the
        // *pre-split* document, throwing "Position N out of range" the moment the split
        // actually shifted things (caught via a real runtime error, not assumed). Calling
        // each command standalone forces Tiptap to dispatch and re-read state in between, so
        // setParagraph() sees the already-split document and a valid, current selection.
        const didSplit = editor.commands.splitBlock();
        if (!didSplit) return false;
        editor.commands.setParagraph();
        return true;
      },
    };
  },
});

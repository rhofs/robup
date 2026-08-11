'use client';

import { Extension } from '@tiptap/core';
import { gapCursor } from '@tiptap/pm/gapcursor';

// A thin wrapper around ProseMirror's own gapcursor plugin (re-exported via @tiptap/pm — the
// separate `@tiptap/extension-gapcursor` npm package is just this same ~10 lines, not worth an
// extra dependency for). Without it, clicking directly above/below a block atom (subpagesIndex —
// no adjacent text to click into) doesn't place a cursor there at all, since ProseMirror has no
// built-in way to represent "selection is between two block nodes with nothing in between."
export const GapCursor = Extension.create({
  name: 'gapCursor',
  addProseMirrorPlugins() {
    return [gapCursor()];
  },
});

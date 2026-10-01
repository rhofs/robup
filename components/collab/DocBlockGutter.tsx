'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Plus } from 'lucide-react';

// The "+" that appears in the left margin beside whichever block the mouse is over — ClickUp's way
// into its block menu ("ClickUp has this function in the Docs, where you can press +"). Pressing it
// opens the same "/" menu: on an empty line it types the "/" there, otherwise it opens a new line
// under the block first, so nothing already written is touched.
//
// Drawn fixed-position in a portal rather than inside the editor: the doc pages put the editor in
// scrolling containers whose edges would clip anything hanging out into the margin. It follows the
// pointer with one listener on the document, so it also stays put while the mouse travels left from
// the text onto the button. Mouse only — a touch screen has no hover, and "/" works there as before.
export default function DocBlockGutter({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const [at, setAt] = useState<{ pos: number; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!container) return;
    const hide = () => setAt(null);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !editor.isEditable || editor.isDestroyed) return hide();
      const box = container.getBoundingClientRect();
      // From the margin (where the button sits) to the right edge, within the editor's height.
      if (e.clientY < box.top || e.clientY > box.bottom || e.clientX < box.left - 56 || e.clientX > box.right) return hide();
      const view = editor.view;
      const hit = view.posAtCoords({ left: box.left + 8, top: e.clientY });
      if (!hit) return hide();
      // The top-level block under that point: an atom block answers through `inside`, text through
      // the position's depth-1 ancestor.
      const $pos = view.state.doc.resolve(hit.pos);
      const pos = $pos.depth >= 1 ? $pos.before(1) : hit.inside >= 0 ? hit.inside : -1;
      if (pos < 0) return hide();
      const dom = view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return hide();
      const r = dom.getBoundingClientRect();
      // Level with the block's first line rather than its middle, so a tall block keeps its "+" at the
      // top like ClickUp's.
      const lineHeight = parseFloat(getComputedStyle(dom).lineHeight) || 24;
      const firstLine = Math.min(r.height, lineHeight);
      setAt((prev) => {
        const next = { pos, top: r.top + firstLine / 2, left: box.left - 30 };
        return prev && prev.pos === next.pos && prev.top === next.top && prev.left === next.left ? prev : next;
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', hide, true);
    };
  }, [editor, container]);

  if (!at || typeof document === 'undefined') return null;

  const open = () => {
    const { state } = editor;
    const node = state.doc.nodeAt(at.pos);
    if (!node) return;
    const emptyLine = node.type.name === 'paragraph' && node.content.size === 0;
    const chain = editor.chain().focus();
    if (emptyLine) {
      chain.setTextSelection(at.pos + 1).insertContent('/').run();
    } else {
      const after = at.pos + node.nodeSize;
      chain
        .insertContentAt(after, { type: 'paragraph' })
        .setTextSelection(after + 1)
        .insertContent('/')
        .run();
    }
    setAt(null);
  };

  return createPortal(
    <button
      type="button"
      aria-label="Add a block"
      title="Add a block"
      onMouseDown={(e) => e.preventDefault()}
      onClick={open}
      className="fixed z-40 w-6 h-6 -translate-y-1/2 rounded-md flex items-center justify-center text-neutral-500 hover:text-app-strong hover:bg-neutral-800 cursor-pointer transition-colors"
      style={{ top: at.top, left: at.left }}
    >
      <Plus className="w-4 h-4" />
    </button>,
    document.body
  );
}

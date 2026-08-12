'use client';

import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { useTaskStore } from '../../store/useTaskStore';
import { scoreMatch } from '../../lib/search';
import SlashCommandList, { type SlashCommandListRef } from './SlashCommandList';

export type SlashCommandItem = {
  id: string;
  label: string;
  icon: 'heading1' | 'heading2' | 'bulletList' | 'orderedList' | 'subpage' | 'subpagesIndex' | 'image';
  run: (editor: Editor, range: Range) => void;
};

// Deliberately limited to what this editor's actual Tiptap schema can already do (Heading[1,2],
// BulletList, OrderedList — see CollabDocEditor.tsx's extension list, no Table/Toggle/Checklist/
// Banner extensions exist) plus the one genuinely new capability: New Subpage. ClickUp's own
// slash menu (the reference screenshots) has many more block types — out of scope here, would
// need substantial new Tiptap node types per block, a separate effort.
function baseCommands(): SlashCommandItem[] {
  return [
    {
      id: 'h1',
      label: 'Heading 1',
      icon: 'heading1',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      id: 'h2',
      label: 'Heading 2',
      icon: 'heading2',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      id: 'bullet-list',
      label: 'Bullet list',
      icon: 'bulletList',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: 'ordered-list',
      label: 'Numbered list',
      icon: 'orderedList',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
  ];
}

// New Subpage: creates a child Doc via the existing store action, then inserts an inline
// reference to it at the cursor using the *existing* `mention` node (already supports
// `kind: 'doc'`, already renders as a clickable chip via MentionChip.tsx with click-to-navigate)
// — no new Tiptap node type needed for the "embedded page link" shown in the reference screenshot.
function newSubpageCommand(spaceId: string, docId: string): SlashCommandItem {
  return {
    id: 'new-subpage',
    label: 'New Subpage',
    icon: 'subpage',
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      useTaskStore
        .getState()
        .createSpaceDoc(spaceId, null, { parentId: docId })
        .then((doc) => {
          if (!doc) return;
          editor.chain().focus().insertContent({ type: 'mention', attrs: { kind: 'doc', id: doc.id, label: doc.title } }).insertContent(' ').run();
        });
    },
  };
}

// Inserts a live `subpagesIndex` block (SubpagesIndexBlock.tsx) showing *this* doc's own
// children — the "table lives inside the written content" pattern from the ClickUp reference,
// as opposed to New Subpage above (which creates a new page and links to it).
function subpagesIndexCommand(docId: string): SlashCommandItem {
  return {
    id: 'subpages-index',
    label: 'Subpages',
    icon: 'subpagesIndex',
    run: (editor, range) => {
      // A trailing empty paragraph right after the block atom, inserted at the same time, so
      // there's always an immediately clickable line to keep writing on below it (gapCursor,
      // registered on the editor, additionally covers clicking directly above/below the block in
      // general — this covers the common "just inserted it" case without waiting on that).
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([{ type: 'subpagesIndex', attrs: { docId } }, { type: 'paragraph' }])
        .run();
    },
  };
}

// Unlike every other item, Image has no selection or content to build immediately — it just
// clears the "/image" text and hands off to CollabDocEditor.tsx's own URL-prompt modal (no
// natural anchor to float a BubbleMenu-style composer off, unlike Link which always has a text
// selection to anchor to), which calls editor.chain().setImage({src}) itself once submitted, at
// the cursor position this leaves behind.
function imageCommand(onRequestImage: () => void): SlashCommandItem {
  return {
    id: 'image',
    label: 'Image',
    icon: 'image',
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      onRequestImage();
    },
  };
}

// spaceId/docId come from the extension's own options (see slashCommandExtension.ts), not a
// closure captured at module scope — this factory is called fresh per editor instance.
export function createSlashCommandSuggestion(opts: { spaceId?: string; docId: string; onRequestImage?: () => void }): Partial<SuggestionOptions<SlashCommandItem>> {
  const items = spaceIdAwareItems(opts);

  return {
    items: ({ query }) => {
      if (!query) return items;
      const q = query.toLowerCase();
      return items
        .map((item) => ({ item, score: scoreMatch(item.label, q) }))
        .filter((x): x is { item: SlashCommandItem; score: number } => x.score !== null)
        .sort((a, b) => a.score - b.score)
        .map((x) => x.item);
    },

    command: ({ editor, range, props }) => {
      props.run(editor, range);
    },

    render: () => {
      let component: ReactRenderer<SlashCommandListRef, any>;
      let unmount: (() => void) | undefined;

      return {
        onStart: (props) => {
          component = new ReactRenderer(SlashCommandList, { props, editor: props.editor });
          unmount = props.mount(component.element as HTMLElement);
        },
        onUpdate: (props) => {
          component.updateProps(props);
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            unmount?.();
            return true;
          }
          return component.ref?.onKeyDown({ event: props.event }) ?? false;
        },
        onExit: () => {
          unmount?.();
          component.destroy();
        },
      };
    },
  };
}

function spaceIdAwareItems(opts: { spaceId?: string; docId: string; onRequestImage?: () => void }): SlashCommandItem[] {
  const items = baseCommands();
  if (opts.onRequestImage) items.push(imageCommand(opts.onRequestImage));
  if (opts.spaceId) {
    items.push(newSubpageCommand(opts.spaceId, opts.docId));
    items.push(subpagesIndexCommand(opts.docId));
  }
  return items;
}

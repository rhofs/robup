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
  icon:
    | 'text'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'bulletList'
    | 'orderedList'
    | 'checklist'
    | 'taskList'
    | 'quote'
    | 'divider'
    | 'subpage'
    | 'subpagesIndex'
    | 'image'
    | 'codeBlock'
    | 'file';
  // The heading it is listed under in the menu (SlashCommandList) — ClickUp's layout: what you reach
  // for most first, then the plain text styles, then media.
  section: 'Suggestions' | 'Text' | 'Media';
  // Extra words it is found by besides its label ("todo" finds Checklist).
  keywords?: string;
  run: (editor: Editor, range: Range) => void;
};

// The blocks this editor's schema has (lib/collab/schema.ts). Grown to a ClickUp-like set on
// 2026-10-01 — checklist, a live List of tasks, Heading 3, quote, divider — when the user asked for
// ClickUp's "+" and its block menu. Toggle lists, banners, columns and tables are still not here: each
// is a new node type with its own editing behaviour, a separate piece of work.
function baseCommands(): SlashCommandItem[] {
  return [
    {
      id: 'checklist',
      label: 'Checklist',
      icon: 'checklist',
      section: 'Suggestions',
      keywords: 'todo to-do check box tick',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      id: 'task-list',
      label: 'Task list',
      icon: 'taskList',
      section: 'Suggestions',
      keywords: 'list table tasks embed clickup new existing',
      // Inserted without a List: the block opens on its own setup — a new List, or an existing one. A
      // paragraph after it so there is always a line to keep writing on.
      run: (editor, range) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([{ type: 'taskListEmbed', attrs: { listId: null } }, { type: 'paragraph' }])
          .run(),
    },
    {
      id: 'divider',
      label: 'Divider',
      icon: 'divider',
      section: 'Suggestions',
      keywords: 'line separator hr rule',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: 'quote',
      section: 'Suggestions',
      keywords: 'blockquote citation',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: 'text',
      label: 'Normal text',
      icon: 'text',
      section: 'Text',
      keywords: 'paragraph plain',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      id: 'h1',
      label: 'Heading 1',
      icon: 'heading1',
      section: 'Text',
      keywords: 'title h1',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      id: 'h2',
      label: 'Heading 2',
      icon: 'heading2',
      section: 'Text',
      keywords: 'subtitle h2',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      id: 'h3',
      label: 'Heading 3',
      icon: 'heading3',
      section: 'Text',
      keywords: 'h3',
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      id: 'bullet-list',
      label: 'Bullet list',
      icon: 'bulletList',
      section: 'Text',
      keywords: 'unordered ul',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: 'ordered-list',
      label: 'Numbered list',
      icon: 'orderedList',
      section: 'Text',
      keywords: 'ordered ol',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: 'code-block',
      label: 'Code block',
      icon: 'codeBlock',
      section: 'Text',
      keywords: 'code pre snippet',
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
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
    section: 'Suggestions',
    keywords: 'page child doc',
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
    section: 'Suggestions',
    keywords: 'pages children index table',
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
    section: 'Media',
    keywords: 'picture photo',
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      onRequestImage();
    },
  };
}

// "File": clears "/file" and opens the file picker; CollabDocEditor uploads what is picked and puts a
// file chip (lib/collab/fileAttachmentNode.ts) where the caret was.
function fileCommand(onRequestFile: () => void): SlashCommandItem {
  return {
    id: 'file',
    label: 'File',
    icon: 'file',
    section: 'Media',
    keywords: 'attachment upload',
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      onRequestFile();
    },
  };
}

// spaceId/docId come from the extension's own options (see slashCommandExtension.ts), not a
// closure captured at module scope — this factory is called fresh per editor instance.
export function createSlashCommandSuggestion(opts: { spaceId?: string; docId: string; onRequestImage?: () => void; onRequestFile?: () => void }): Partial<SuggestionOptions<SlashCommandItem>> {
  const items = spaceIdAwareItems(opts);

  return {
    items: ({ query }) => {
      if (!query) return items;
      const q = query.toLowerCase();
      return items
        .map((item) => {
          const scores = [item.label, ...(item.keywords?.split(' ') ?? [])].map((w) => scoreMatch(w, q)).filter((x): x is number => x !== null);
          return { item, score: scores.length ? Math.min(...scores) : null };
        })
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

// Menu order: Suggestions (checklist, tasks, subpages, divider, quote), then Text, then Media — the
// list component groups consecutive items by section, so this order is the menu's order.
function spaceIdAwareItems(opts: { spaceId?: string; docId: string; onRequestImage?: () => void; onRequestFile?: () => void }): SlashCommandItem[] {
  const base = baseCommands();
  const suggestions = base.filter((i) => i.section === 'Suggestions');
  if (opts.spaceId) suggestions.splice(2, 0, newSubpageCommand(opts.spaceId, opts.docId), subpagesIndexCommand(opts.docId));
  const media: SlashCommandItem[] = [];
  if (opts.onRequestImage) media.push(imageCommand(opts.onRequestImage));
  if (opts.onRequestFile) media.push(fileCommand(opts.onRequestFile));
  return [...suggestions, ...base.filter((i) => i.section === 'Text'), ...media];
}

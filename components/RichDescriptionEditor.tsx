'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import HardBreak from '@tiptap/extension-hard-break';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Placeholder from '@tiptap/extension-placeholder';
import { ClientHeading } from './collab/headingExtension';
import { ClientMentionNode } from './collab/mentionNodeView';
import { SlashCommand } from './collab/slashCommandExtension';
import { GapCursor } from './collab/gapCursorExtension';
import DocFormatPanel from './collab/DocFormatPanel';
import { isRichHtml, plainToHtml } from '../lib/richText';
import type { MentionKind } from '../lib/mentions';

// A task's description, written with the same editor as Docs — the formatting panel (bold, italic,
// underline, headings, lists, fonts, sizes, colours, highlight, alignment), "/" for blocks and "@" for
// people, tasks and docs. "Mangler masse formatering for beskrivelsen … Kan du fikse så vi har det
// samme som i docs?" (2026-10-14). It used to be a plain textarea.
//
// Not a live collaborative document like a Doc (no Hocuspocus room): a description is one field on the
// task, saved as HTML when the editor loses focus, like the textarea it replaces. Older descriptions —
// plain text with mention tokens — are turned into the same shape when they are opened
// (lib/richText.ts), and become HTML the first time they are saved. Left out from Docs: comments,
// subpages, the live task-list block and images/files.
export default function RichDescriptionEditor({
  value,
  onCommit,
  onJump,
  placeholder = 'Write a description… “/” for blocks, “@” for people, tasks and docs',
  compact = false,
}: {
  value: string | null;
  onCommit: (html: string | null) => void;
  onJump?: (kind: MentionKind, id: string) => void;
  placeholder?: string;
  // Smaller, without the side formatting panel — for forms (the task template editor).
  compact?: boolean;
}) {
  // The description as editor HTML, once — the editor owns it from then on (the caller remounts per task).
  const [initialHtml] = useState(() => (value ? (isRichHtml(value) ? value : plainToHtml(value)) : ''));
  // What is saved now, so a blur with no change saves nothing.
  const saved = useRef(initialHtml);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      ClientHeading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      HardBreak,
      Underline,
      Strike,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      CodeBlock,
      Blockquote,
      HorizontalRule,
      TaskList,
      TaskItem.configure({ nested: true }),
      GapCursor,
      ClientMentionNode.configure({ onJump }),
      SlashCommand.configure({ docId: '', noTaskList: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml,
    immediatelyRender: false,
    onBlur: ({ editor: e }) => {
      const html = e.isEmpty ? '' : e.getHTML();
      if (html === saved.current) return;
      saved.current = html;
      onCommit(html || null);
    },
  });

  // Links open in a new tab with Ctrl/⌘ held, as in Docs — a plain click puts the caret in them.
  const openLinkOnClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!a || !(e.metaKey || e.ctrlKey)) return;
    const href = a.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
    e.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex items-start gap-3">
      <div
        onClick={(e) => {
          openLinkOnClick(e);
          // Anywhere in the box puts the caret in — not only on a line of text.
          if (editor && !editor.isFocused && (e.target as HTMLElement).closest('.ProseMirror') === null) editor.commands.focus('end');
        }}
        className={`flex-1 min-w-0 rounded-lg border border-transparent hover:border-neutral-800 focus-within:border-blue-500/70 px-3 py-2 -mx-3 cursor-text transition-colors ${
          compact ? 'min-h-[80px] bg-neutral-950 border-neutral-700' : 'min-h-[60px]'
        }`}
      >
        <div className="collab-doc-editor text-xs">
          <EditorContent editor={editor} />
        </div>
      </div>
      {editor && !compact && <DocFormatPanel editor={editor} />}
    </div>
  );
}

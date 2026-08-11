'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Type, ChevronRight } from 'lucide-react';

// Same button set the old DocToolbar.tsx had, now living in a collapsible right-side column
// instead of a fixed row between the title and the editor content — per explicit user feedback
// referencing ClickUp's own "Page Styles" side panel as the model (collapsed to a thin icon
// strip, expands on click). Active-state styling mirrors RoomDetail.tsx's icon-picker convention.
const BUTTONS: { key: string; label: string; icon: typeof Bold; isActive: (editor: Editor) => boolean; run: (editor: Editor) => void }[] = [
  {
    key: 'bold',
    label: 'Bold',
    icon: Bold,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    label: 'Italic',
    icon: Italic,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    key: 'h1',
    label: 'Heading 1',
    icon: Heading1,
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    label: 'Heading 2',
    icon: Heading2,
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'bulletList',
    label: 'Bullet list',
    icon: List,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    label: 'Numbered list',
    icon: ListOrdered,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
];

export default function DocFormatPanel({ editor }: { editor: Editor }) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title="Formatting"
        className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 cursor-pointer"
      >
        <Type className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="shrink-0 w-36 border-l border-neutral-800 pl-3">
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300 mb-2 cursor-pointer"
      >
        <ChevronRight className="w-3 h-3" /> Formatting
      </button>
      <div className="grid grid-cols-3 gap-1">
        {BUTTONS.map(({ key, label, icon: Icon, isActive, run }) => (
          <button
            key={key}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(editor)}
            className={`w-9 h-9 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 ${
              isActive(editor) ? 'bg-neutral-800 ring-1 ring-blue-500 text-blue-400' : 'text-neutral-400'
            }`}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

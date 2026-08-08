'use client';

import type { Editor } from '@tiptap/react';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered } from 'lucide-react';

// Small fixed row above the editor — no floating/bubble-menu precedent exists anywhere in this
// app, and a fixed row is simpler/more discoverable, consistent with the app having no other
// floating contextual UI besides right-click context menus. Active-state styling mirrors
// RoomDetail.tsx's icon-picker convention (the app's one existing precedent for a row of
// toggleable icon buttons): neutral hover, ring-1 ring-blue-500 + bg-neutral-800 when active.
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

export default function DocToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-1 pb-1.5 border-b border-neutral-800">
      {BUTTONS.map(({ key, label, icon: Icon, isActive, run }) => (
        <button
          key={key}
          type="button"
          title={label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(editor)}
          className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 ${
            isActive(editor) ? 'bg-neutral-800 ring-1 ring-blue-500 text-blue-400' : 'text-neutral-400'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

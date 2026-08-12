'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Pilcrow,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  Highlighter,
  ChevronRight,
  Minus,
  Plus,
} from 'lucide-react';
import FloatingPopover from '../FloatingPopover';
import ColorSwatchPicker from '../ColorSwatchPicker';

// Same button set the old DocToolbar.tsx had, now living in a collapsible right-side column
// instead of a fixed row between the title and the editor content — per explicit user feedback
// referencing ClickUp's own "Page Styles" side panel as the model (collapsed to a thin icon
// strip, expands on click). Active-state styling mirrors RoomDetail.tsx's icon-picker convention.
const MARK_BUTTONS: { key: string; label: string; icon: typeof Bold; isActive: (editor: Editor) => boolean; run: (editor: Editor) => void }[] = [
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
    key: 'underline',
    label: 'Underline',
    icon: UnderlineIcon,
    isActive: (editor) => editor.isActive('underline'),
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
  },
  {
    key: 'strike',
    label: 'Strikethrough',
    icon: Strikethrough,
    isActive: (editor) => editor.isActive('strike'),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
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
    key: 'paragraph',
    label: 'Normal text',
    icon: Pilcrow,
    isActive: (editor) => editor.isActive('paragraph'),
    run: (editor) => editor.chain().focus().setParagraph().run(),
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

const ALIGN_BUTTONS: { key: 'left' | 'center' | 'right' | 'justify'; label: string; icon: typeof AlignLeft }[] = [
  { key: 'left', label: 'Align left', icon: AlignLeft },
  { key: 'center', label: 'Align center', icon: AlignCenter },
  { key: 'right', label: 'Align right', icon: AlignRight },
  { key: 'justify', label: 'Justify', icon: AlignJustify },
];

// The classic "web-safe" set — every one of these is pre-installed on essentially every OS, so
// on-screen and Google Docs export (which can render any real font name Google already knows)
// both render each one faithfully. PDF export (pdfkit) only ships 3 built-in font families, so it
// rounds each of these down to the closest of Helvetica/Times/Courier — a documented, deliberate
// approximation rather than embedding font files (see lib/collab/docJSONToPdf.ts's
// FONT_CATEGORY_BY_NAME, and PLANNING.md's note on why this project avoids embedded pdfkit
// assets). Keep each `value`'s primary (first, before the comma) name in sync with that lookup
// table and with googleFontFamily() in docJSONToGoogleRequests.ts if adding more.
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Lucida Console', value: '"Lucida Console", Monaco, monospace' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive, sans-serif' },
  { label: 'Impact', value: 'Impact, Charcoal, sans-serif' },
];

const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 120;

// Includes black/dark gray even though the editor's own UI is dark — these matter most for
// exported documents (PDF, Google Docs), which always render on a white page regardless of the
// app's own theme, where every one of the original bright/light-only choices would wash out.
const TEXT_COLOR_CHOICES = ['#000000', '#404040', '#737373', '#e5e5e5', '#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f472b6'];
const HIGHLIGHT_COLOR_CHOICES = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#fed7aa', '#e9d5ff', '#fbcfe8'];

export default function DocFormatPanel({ editor }: { editor: Editor }) {
  const [expanded, setExpanded] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);

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

  const currentColor = editor.getAttributes('textStyle').color || '#e5e5e5';
  const currentHighlight = editor.getAttributes('highlight').color || '#fef08a';

  return (
    <div className="shrink-0 w-48 border-l border-neutral-800 pl-3 space-y-2">
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300 mb-1 cursor-pointer"
      >
        <ChevronRight className="w-3 h-3" /> Formatting
      </button>

      <div className="grid grid-cols-4 gap-1">
        {MARK_BUTTONS.map(({ key, label, icon: Icon, isActive, run }) => (
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

      <div className="grid grid-cols-4 gap-1">
        {ALIGN_BUTTONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign(key).run()}
            className={`w-9 h-9 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 ${
              editor.isActive({ textAlign: key }) ? 'bg-neutral-800 ring-1 ring-blue-500 text-blue-400' : 'text-neutral-400'
            }`}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <FloatingPopover
          open={colorOpen}
          onClose={() => setColorOpen(false)}
          panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-2"
          anchor={
            <button
              type="button"
              title="Text color"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColorOpen((o) => !o)}
              className="w-9 h-9 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800 text-neutral-400"
            >
              <Palette size={14} />
              <span className="w-4 h-[2.5px] rounded-full mt-0.5" style={{ backgroundColor: currentColor }} />
            </button>
          }
        >
          <ColorSwatchPicker
            value={editor.getAttributes('textStyle').color ?? null}
            onChange={(color) => editor.chain().focus().setColor(color).run()}
            choices={TEXT_COLOR_CHOICES}
            size="sm"
          />
        </FloatingPopover>

        <FloatingPopover
          open={highlightOpen}
          onClose={() => setHighlightOpen(false)}
          panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-2"
          anchor={
            <button
              type="button"
              title="Highlight color"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setHighlightOpen((o) => !o)}
              className={`w-9 h-9 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800 ${
                editor.isActive('highlight') ? 'text-blue-400' : 'text-neutral-400'
              }`}
            >
              <Highlighter size={14} />
              <span className="w-4 h-[2.5px] rounded-full mt-0.5" style={{ backgroundColor: currentHighlight }} />
            </button>
          }
        >
          <ColorSwatchPicker
            value={editor.getAttributes('highlight').color ?? null}
            onChange={(color) => editor.chain().focus().setHighlight({ color }).run()}
            choices={HIGHLIGHT_COLOR_CHOICES}
            size="sm"
          />
          {editor.isActive('highlight') && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setHighlightOpen(false);
              }}
              className="w-full mt-1.5 text-[10px] text-neutral-400 hover:text-red-400 cursor-pointer text-left"
            >
              Remove highlight
            </button>
          )}
        </FloatingPopover>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-wide text-neutral-500 block">Font</label>
        <select
          value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(value).run();
          }}
          className="w-full bg-neutral-950 border border-neutral-700 rounded px-1.5 py-1 text-[11px] text-neutral-200 focus:outline-none focus:border-blue-500"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-wide text-neutral-500 block">Size</label>
        {(() => {
          const raw = editor.getAttributes('textStyle').fontSize as string | undefined;
          const parsed = raw ? parseInt(raw, 10) : null;
          const displayValue = parsed && !Number.isNaN(parsed) ? String(parsed) : '';
          const setSize = (n: number) => {
            const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, n));
            editor.chain().focus().setFontSize(`${clamped}px`).run();
          };
          const step = (delta: number) => setSize((parsed ?? DEFAULT_FONT_SIZE) + delta);
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Decrease size"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => step(-1)}
                className="w-6 h-7 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 text-neutral-400 shrink-0"
              >
                <Minus size={12} />
              </button>
              <input
                type="number"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={displayValue}
                placeholder="Default"
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    editor.chain().focus().unsetFontSize().run();
                    return;
                  }
                  const n = parseInt(value, 10);
                  if (!Number.isNaN(n)) setSize(n);
                }}
                className="w-full min-w-0 text-center bg-neutral-950 border border-neutral-700 rounded px-1 py-1 text-[11px] text-neutral-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                title="Increase size"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => step(1)}
                className="w-6 h-7 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 text-neutral-400 shrink-0"
              >
                <Plus size={12} />
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

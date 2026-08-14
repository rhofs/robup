'use client';

import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
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
  ChevronDown,
  Minus,
  Plus,
  Code2,
  Check,
} from 'lucide-react';
import FloatingPopover from '../FloatingPopover';
import ColorSwatchPicker from '../ColorSwatchPicker';
import type { TaskDoc } from '../../store/useTaskStore';

type DocPagePatch = {
  coverImageUrl?: string | null;
  subtitle?: string | null;
  pageWidth?: 'normal' | 'full';
  showLastModified?: boolean;
};

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
  {
    key: 'codeBlock',
    label: 'Code block',
    icon: Code2,
    isActive: (editor) => editor.isActive('codeBlock'),
    // Tiptap's plain toggleCodeBlock() applies setBlockType to every selected textblock
    // independently — selecting 3 existing paragraphs and toggling code-on converts each one into
    // its *own* separate codeBlock node (3 boxes) instead of one block containing all 3 lines
    // (reported directly: "instead of being one whole codeblock, there are 3 lines of codeblock").
    // Toggling off, or toggling on with nothing selected, has no multiple-textblocks-at-once case
    // to merge, so those still go through the plain command unchanged.
    run: (editor) => {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().toggleCodeBlock().run();
        return;
      }
      const { state } = editor;
      const { from, to, empty } = state.selection;
      if (empty) {
        editor.chain().focus().toggleCodeBlock().run();
        return;
      }
      const text = state.doc.textBetween(from, to, '\n', '\n');
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, { type: 'codeBlock', content: text ? [{ type: 'text', text }] : [] })
        .run();
    },
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
const FONT_SIZE_CHOICES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96];

// Includes black/dark gray even though the editor's own UI is dark — these matter most for
// exported documents (PDF, Google Docs), which always render on a white page regardless of the
// app's own theme, where every one of the original bright/light-only choices would wash out.
const TEXT_COLOR_CHOICES = ['#000000', '#404040', '#737373', '#e5e5e5', '#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f472b6'];
const HIGHLIGHT_COLOR_CHOICES = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#fed7aa', '#e9d5ff', '#fbcfe8'];

export default function DocFormatPanel({
  editor,
  doc,
  onUpdateDoc,
}: {
  editor: Editor;
  // Both undefined at the task-modal Documents-panel call site (no spaceId there, see
  // CollabDocEditor.tsx) — page-level settings only ever apply to a real standalone Doc.
  doc?: TaskDoc;
  onUpdateDoc?: (patch: DocPagePatch) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverDraft, setCoverDraft] = useState('');

  // `editor` is one stable object for the whole editing session — every control below reads its
  // live state directly (`editor.isActive()`/`getAttributes()`), which only reflects reality if
  // *something* re-renders this component on each transaction. Nothing did: this panel only ever
  // re-rendered as a side effect of some unrelated parent update, so a control could show a stale
  // value (most visibly font size, since it's the one most often checked immediately after
  // clicking) until the next incidental re-render happened to catch up — reported as "always shows
  // default." `useEditorState`, subscribed to `transactionNumber` (bumped on every transaction:
  // selection move, mark toggle, a remote Yjs edit), is Tiptap's own documented fix — it forces a
  // re-render on every one, so every plain read below is now live rather than mount-time-stale.
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });

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
        <ChevronRight className="w-3 h-3" /> Page styles
      </button>

      {doc && onUpdateDoc && (
        <div className="space-y-1.5 pb-2 mb-1 border-b border-neutral-800">
          <label className="text-[9px] uppercase tracking-wide text-neutral-500 block">Page</label>

          <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded p-0.5">
            <button
              type="button"
              onClick={() => onUpdateDoc({ pageWidth: 'normal' })}
              className={`flex-1 text-[10px] py-1 rounded cursor-pointer transition ${
                doc.pageWidth !== 'full' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => onUpdateDoc({ pageWidth: 'full' })}
              className={`flex-1 text-[10px] py-1 rounded cursor-pointer transition ${
                doc.pageWidth === 'full' ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Full width
            </button>
          </div>

          {doc.coverImageUrl ? (
            <button
              type="button"
              onClick={() => onUpdateDoc({ coverImageUrl: null })}
              className="w-full text-[10px] text-neutral-400 hover:text-red-400 text-left cursor-pointer"
            >
              Remove cover
            </button>
          ) : (
            <FloatingPopover
              open={coverOpen}
              onClose={() => setCoverOpen(false)}
              panelClassName="w-52 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-2 space-y-1.5"
              anchor={
                <button
                  type="button"
                  onClick={() => {
                    setCoverDraft('');
                    setCoverOpen((o) => !o);
                  }}
                  className="w-full text-[10px] text-neutral-400 hover:text-neutral-200 text-left cursor-pointer"
                >
                  + Add cover
                </button>
              }
            >
              <input
                autoFocus
                value={coverDraft}
                onChange={(e) => setCoverDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const trimmed = coverDraft.trim();
                  if (trimmed) onUpdateDoc({ coverImageUrl: trimmed });
                  setCoverOpen(false);
                }}
                placeholder="Paste an image URL..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = coverDraft.trim();
                  if (trimmed) onUpdateDoc({ coverImageUrl: trimmed });
                  setCoverOpen(false);
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[10px] py-1 rounded font-medium cursor-pointer"
              >
                Set cover
              </button>
            </FloatingPopover>
          )}

          <button
            type="button"
            onClick={() => onUpdateDoc({ subtitle: doc.subtitle === null ? '' : null })}
            className="w-full text-[10px] text-neutral-400 hover:text-neutral-200 text-left cursor-pointer"
          >
            {doc.subtitle === null ? '+ Add subtitle' : 'Remove subtitle'}
          </button>

          <button
            type="button"
            onClick={() => onUpdateDoc({ showLastModified: !doc.showLastModified })}
            className="w-full flex items-center gap-1.5 text-[10px] text-neutral-400 hover:text-neutral-200 cursor-pointer"
          >
            <span
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                doc.showLastModified ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
              }`}
            >
              {doc.showLastModified && <Check className="w-2.5 h-2.5" />}
            </span>
            Show last edited
          </button>
        </div>
      )}

      <label className="text-[9px] uppercase tracking-wide text-neutral-500 block">Text</label>
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
          // `focusEditor` defaults to false: the +/- buttons already keep the editor focused on
          // their own (onMouseDown preventDefault below stops the click from ever moving focus
          // away from it), so they opt in explicitly. The text input is the opposite case — it
          // genuinely needs real browser focus to be typed into at all, so every keystroke's
          // onChange must NOT call it, or the editor steals focus back after every character,
          // which is exactly what made typing feel "like choosing a new place to write" each time
          // (reported directly) — the text selection this is supposed to be resizing was getting
          // clobbered by the input fighting the editor for focus on every single digit.
          const applySize = (n: number, opts?: { focusEditor?: boolean }) => {
            const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, n));
            const chain = opts?.focusEditor ? editor.chain().focus() : editor.chain();
            chain.setFontSize(`${clamped}px`).run();
          };
          const step = (delta: number) => applySize((parsed ?? DEFAULT_FONT_SIZE) + delta, { focusEditor: true });
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
                type="text"
                inputMode="numeric"
                value={displayValue}
                placeholder="Default"
                onChange={(e) => {
                  const value = e.target.value.trim();
                  if (!value) {
                    editor.chain().unsetFontSize().run();
                    return;
                  }
                  const n = parseInt(value, 10);
                  if (!Number.isNaN(n)) applySize(n);
                }}
                className="w-full min-w-0 text-center bg-neutral-950 border border-neutral-700 rounded px-1 py-1 text-[11px] text-neutral-200 focus:outline-none focus:border-blue-500"
              />
              {/* A native <datalist>-backed input was tried first — cheap, but the actual
                  dropdown never reliably showed up (reported directly), and native datalist
                  rendering is genuinely inconsistent across browsers with no way to fix from the
                  code side. Replaced with the same FloatingPopover pattern the color/highlight
                  pickers just above already use, which this app fully controls. */}
              <FloatingPopover
                open={sizeMenuOpen}
                onClose={() => setSizeMenuOpen(false)}
                align="right"
                panelClassName="w-16 max-h-56 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
                anchor={
                  <button
                    type="button"
                    title="Common sizes"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSizeMenuOpen((o) => !o)}
                    className="w-5 h-7 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 text-neutral-400 shrink-0"
                  >
                    <ChevronDown size={11} />
                  </button>
                }
              >
                {FONT_SIZE_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      applySize(n, { focusEditor: true });
                      setSizeMenuOpen(false);
                    }}
                    className={`w-full text-center px-2 py-1 text-[11px] cursor-pointer hover:bg-neutral-800 ${
                      parsed === n ? 'text-blue-400' : 'text-neutral-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </FloatingPopover>
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

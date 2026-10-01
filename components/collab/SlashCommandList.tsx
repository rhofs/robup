'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  ListChecks,
  Quote,
  Minus,
  FileText,
  Rows3,
  Image as ImageIcon,
  Code2,
  Paperclip,
} from 'lucide-react';
import type { SlashCommandItem } from './slashCommandSuggestion';

const ICON = {
  text: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  checklist: ListTodo,
  taskList: ListChecks,
  quote: Quote,
  divider: Minus,
  subpage: FileText,
  subpagesIndex: Rows3,
  image: ImageIcon,
  codeBlock: Code2,
  file: Paperclip,
} as const;

type Props = {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  query?: string;
};

export type SlashCommandListRef = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

// The block menu behind "/" and the "+" in the doc's margin, laid out like ClickUp's (the user's
// screenshots): headed sections, two columns, an icon tile per item. While searching it drops the
// headings and shows the matches in order. Arrow keys move through the items in reading order —
// left/right one step, up/down one row (two steps) — and Enter/Tab picks.
const SlashCommandList = forwardRef<SlashCommandListRef, Props>(({ items, command, query }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelectedIndex(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const count = Math.max(items.length, 1);
      const step = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step !== undefined) {
        setSelectedIndex((i) => Math.min(count - 1, Math.max(0, i + step)));
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  const searching = !!query;
  // Consecutive runs of one section, each rendered as a heading plus its two-column grid. The items
  // keep their flat index for keyboard selection.
  const groups: { section: string; entries: { item: SlashCommandItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const section = searching ? 'Results' : item.section;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.entries.push({ item, index });
    else groups.push({ section, entries: [{ item, index }] });
  });

  return (
    <div
      ref={listRef}
      onMouseDown={(e) => e.preventDefault()}
      className="w-[min(440px,calc(100vw-24px))] max-h-[min(380px,60vh)] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-1.5"
    >
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 px-3 py-2">No matches</p>
      ) : (
        groups.map((g) => (
          <div key={g.section} className="mb-1 last:mb-0">
            <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{g.section}</div>
            <div className="grid grid-cols-2 gap-0.5">
              {g.entries.map(({ item, index }) => {
                const Icon = ICON[item.icon];
                const active = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    data-index={index}
                    onClick={() => selectItem(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`text-left px-1.5 py-1 rounded-lg flex items-center gap-2.5 cursor-pointer transition-colors ${
                      active ? 'bg-neutral-800 text-app-strong' : 'text-neutral-300'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        active ? 'border-blue-500/40 bg-blue-500/15 text-blue-400' : 'border-neutral-800 bg-neutral-950/40 text-neutral-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate text-[13px] flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';
export default SlashCommandList;

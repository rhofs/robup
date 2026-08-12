'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Heading1, Heading2, List, ListOrdered, FileText, Rows3, Image as ImageIcon, Code2 } from 'lucide-react';
import type { SlashCommandItem } from './slashCommandSuggestion';

const ICON = {
  heading1: Heading1,
  heading2: Heading2,
  bulletList: List,
  orderedList: ListOrdered,
  subpage: FileText,
  subpagesIndex: Rows3,
  image: ImageIcon,
  codeBlock: Code2,
} as const;

type Props = {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
};

export type SlashCommandListRef = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

// Same shape as MentionSuggestionList.tsx (arrow/Enter/Tab nav via useImperativeHandle), driven
// by a separate '/'-triggered @tiptap/suggestion plugin instead of '@' — the two trigger
// characters coexist on the same editor with no conflict.
const SlashCommandList = forwardRef<SlashCommandListRef, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const count = Math.max(items.length, 1);
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % count);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i - 1 + count) % count);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="w-56 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1">
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 px-3 py-2">No matches</p>
      ) : (
        items.map((item, i) => {
          const Icon = ICON[item.icon];
          return (
            <button
              key={item.id}
              onClick={() => selectItem(i)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                i === selectedIndex ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate text-xs flex-1">{item.label}</span>
            </button>
          );
        })
      )}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';
export default SlashCommandList;

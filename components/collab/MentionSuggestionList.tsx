'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ListChecks, FileText, UserCircle } from 'lucide-react';
import type { MentionKind } from '../../lib/mentions';
import type { MentionSuggestionItem } from './mentionSuggestion';

const KIND_ICON: Record<MentionKind, typeof ListChecks> = {
  task: ListChecks,
  doc: FileText,
  user: UserCircle,
};

type Props = {
  items: MentionSuggestionItem[];
  command: (item: MentionSuggestionItem) => void;
};

export type MentionSuggestionListRef = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

// Dropdown rendered by mentionSuggestion.ts's render() via ReactRenderer + props.mount — same
// look and arrow/Enter/Tab keyboard nav as components/MentionTextarea.tsx's dropdown, just driven
// by @tiptap/suggestion's plugin instead of hand-rolled caret tracking.
const MentionSuggestionList = forwardRef<MentionSuggestionListRef, Props>(({ items, command }, ref) => {
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
    /* No z-index here on purpose — it would do nothing. This element is statically positioned; the
       one the plugin positions is its parent, and that is where the stacking level is set. See
       mentionSuggestion.ts's onStart. */
    <div className="w-64 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1">
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 px-3 py-2">No matches</p>
      ) : (
        items.map((item, i) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => selectItem(i)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer ${
                i === selectedIndex ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {/* Two lines, matching the other dropdown: where a task lives is often longer than its
                  own name, and as a trailing label it pushed the name into an ellipsis. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{item.label}</span>
                {item.sub && <span className="block truncate text-[10px] text-neutral-500">{item.sub}</span>}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
});

MentionSuggestionList.displayName = 'MentionSuggestionList';
export default MentionSuggestionList;

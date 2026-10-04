'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, X } from 'lucide-react';
import { useVisibleViewport } from '../../hooks/useVisibleViewport';
import { useBackLayer } from '../../hooks/useBackLayer';

// Adding tasks on a phone: one composer docked on top of the keyboard, not an input row at the end of
// the list. The row it replaced lived inside the scrolling list, so the keyboard shoved it about, the
// page could be scrolled out from under it, and every new task landed above it and pushed it down —
// "det føles ikke ut som en sømmeløs skreddersydd løsning … Når jeg lager den, så popper hele raden
// ned". Here the field never moves: it stays open and focused after each task, so several can be typed
// in a row, and each new card arrives in the list above with its own entrance (TaskMaterialize).
//
// Placed against the visual viewport (useVisibleViewport), so it sits on the keyboard on iOS too,
// where the keyboard covers the page instead of shrinking it. Back closes it (useBackLayer), as does ✕,
// or leaving the field while it is empty.
export const TASK_COMPOSER_ID = 'siqt-task-composer';

export default function TaskComposer({
  listName,
  onSubmit,
  onClose,
}: {
  listName: string | null;
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const visible = useVisibleViewport();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Set for a moment after each task is sent: some keyboards blur the field on submit, and the field is
  // empty by then — which would read as "tapped away with nothing typed" and close the composer.
  const justSentRef = useRef(false);
  useBackLayer(true, onClose);

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    onSubmit(title);
    setValue('');
    justSentRef.current = true;
    window.setTimeout(() => {
      justSentRef.current = false;
    }, 400);
    // Keep the keyboard up for the next one.
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 z-[70] pointer-events-none md:hidden"
      style={visible ? { top: visible.top, height: visible.height, bottom: 'auto' } : undefined}
    >
      <motion.div
        id={TASK_COMPOSER_ID}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
        className="absolute inset-x-0 bottom-0 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)] pointer-events-auto"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2 rounded-[22px] bg-neutral-900/95 backdrop-blur-xl border border-white/[0.08] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7),0_0_0_1px_rgb(59_130_246/0.12),0_0_24px_-6px_rgb(59_130_246/0.35)] p-1.5 pl-3.5"
        >
          {/* The done circle a task will have, empty — the field reads as the card it is about to be. */}
          <span className="w-5 h-5 rounded-full border-[1.5px] border-dashed border-neutral-600 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              // Tapping away with nothing typed closes it; with something typed it stays, so a stray
              // tap never loses a title.
              if (!value.trim() && !justSentRef.current) onClose();
            }}
            enterKeyHint="send"
            placeholder={listName ? `New task in ${listName}` : 'New task'}
            // 16px: iOS zooms the page into any smaller input on focus.
            className="flex-1 min-w-0 h-10 bg-transparent text-[16px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
          />
          {value.trim() ? (
            <button
              type="submit"
              aria-label="Add task"
              // Pressing it must not take focus from the field, or the keyboard drops between tasks.
              onPointerDown={(e) => e.preventDefault()}
              className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-transform shadow-[0_6px_18px_-4px_rgb(59_130_246/0.8)]"
            >
              <ArrowUp className="w-5 h-5" strokeWidth={2.4} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Close"
              onPointerDown={(e) => e.preventDefault()}
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-transform"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
}

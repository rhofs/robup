'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, FileText, UserCircle } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';
import { scoreMatch } from '../lib/search';
import { buildMentionToken, type MentionKind } from '../lib/mentions';
import { getCaretCoordinates, type CaretCoordinates } from '../lib/caretCoordinates';

const KIND_ICON: Record<MentionKind, typeof ListChecks> = {
  task: ListChecks,
  doc: FileText,
  user: UserCircle,
};

const MAX_RESULTS = 8;

type MentionOption = { kind: MentionKind; id: string; label: string; sub?: string; score: number };

type Trigger = { start: number; end: number; query: string };

type MentionTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

// Drop-in <textarea> replacement: forwards every prop transparently, and on top of that watches
// for an in-progress "@query" at the caret to show a floating, keyboard-navigable mention dropdown
// (Task/standalone-Doc/User, same scoring as CommandPalette). Selecting an option splices in a
// `@[Label](kind:id)` token. Arrow/Enter/Tab/Escape are only intercepted while the dropdown is
// open — every other keystroke, and onBlur, always falls through to the wrapped handler untouched,
// so callers' existing behavior (comment-box Enter-to-submit, doc-editor activity logging on blur)
// keeps working exactly as before when the user isn't mid-mention.
function MentionTextareaInner(
  { value, onChange, onKeyDown, onBlur, ...rest }: MentionTextareaProps,
  forwardedRef: React.ForwardedRef<HTMLTextAreaElement>
) {
  const { tasks, users, workspaces } = useTaskStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);
  const pendingCaretRef = useRef<number | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<CaretCoordinates | null>(null);

  useEffect(() => {
    if (pendingCaretRef.current !== null && textareaRef.current) {
      const pos = pendingCaretRef.current;
      textareaRef.current.selectionStart = pos;
      textareaRef.current.selectionEnd = pos;
      pendingCaretRef.current = null;
    }
  }, [value]);

  const closeTrigger = () => {
    setTrigger(null);
    setSelectedIndex(0);
    setCoords(null);
  };

  const detectTrigger = (text: string, caret: number) => {
    let i = caret - 1;
    while (i >= 0 && text[i] !== '@' && !/\s/.test(text[i])) i--;
    if (i >= 0 && text[i] === '@' && (i === 0 || /\s/.test(text[i - 1]))) {
      setTrigger({ start: i, end: caret, query: text.slice(i + 1, caret) });
      setSelectedIndex(0);
      if (textareaRef.current) setCoords(getCaretCoordinates(textareaRef.current, caret));
    } else {
      closeTrigger();
    }
  };

  const options: MentionOption[] = (() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    const results: MentionOption[] = [];
    for (const t of tasks) {
      if (t.archived) continue;
      const score = q ? scoreMatch(t.title, q) : 1;
      if (score !== null) results.push({ kind: 'task', id: t.id, label: t.title, score });
    }
    for (const u of users) {
      const score = q ? scoreMatch(u.name, q) : 1;
      if (score !== null) results.push({ kind: 'user', id: u.id, label: u.name, score });
    }
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        for (const doc of space.spaceDocs) {
          const label = doc.title || 'Untitled';
          const score = q ? scoreMatch(label, q) : 1;
          if (score !== null) results.push({ kind: 'doc', id: doc.id, label, sub: space.name, score });
        }
      }
    }
    return results.sort((a, b) => a.score - b.score || a.label.length - b.label.length).slice(0, MAX_RESULTS);
  })();

  const selectOption = (opt: MentionOption) => {
    if (!trigger) return;
    const token = buildMentionToken(opt.kind, opt.id, opt.label) + ' ';
    const before = value.slice(0, trigger.start);
    const after = value.slice(trigger.end);
    const newValue = before + token + after;
    pendingCaretRef.current = before.length + token.length;
    closeTrigger();
    onChange({ target: { value: newValue } } as React.ChangeEvent<HTMLTextAreaElement>);
    textareaRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e);
    detectTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const handleSelect = () => {
    if (!trigger || !textareaRef.current) return;
    detectTrigger(value, textareaRef.current.selectionStart ?? 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTrigger();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (options[selectedIndex]) selectOption(options[selectedIndex]);
        else closeTrigger();
        return;
      }
    }
    onKeyDown?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    closeTrigger();
    onBlur?.(e);
  };

  return (
    <>
      <textarea
        {...rest}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onSelect={handleSelect}
      />
      {trigger &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{ position: 'fixed', top: coords.top + coords.height + 4, left: coords.left, zIndex: 90 }}
            className="w-64 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded shadow-2xl py-1"
          >
            {options.length === 0 ? (
              <p className="text-xs text-neutral-500 px-3 py-2">No matches</p>
            ) : (
              options.map((opt, i) => {
                const Icon = KIND_ICON[opt.kind];
                return (
                  <button
                    key={`${opt.kind}-${opt.id}`}
                    onClick={() => selectOption(opt)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                      i === selectedIndex ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate text-xs flex-1">{opt.label}</span>
                    {opt.sub && <span className="text-[10px] text-neutral-500 shrink-0">{opt.sub}</span>}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(MentionTextareaInner);
export default MentionTextarea;

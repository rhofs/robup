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

// Where the dropdown goes, given where the caret is.
//
// It used to always open downward from the caret, which is fine in a comment box in the middle of a
// page and wrong in the one place mentions matter most: the chat composer sits at the bottom of the
// screen with the keyboard under it, so the list opened straight into the keyboard and all you could
// see was the top millimetre of the first row.
//
// The bottom bound is `visualViewport.height`, not `innerHeight`. In a WebView the keyboard does not
// change innerHeight, it covers part of it — the same fact the composer's own safe-area padding had
// to learn. Measuring against innerHeight here would conclude there is plenty of room below and put
// the list right back under the keyboard.
function placement(coords: CaretCoordinates): React.CSSProperties {
  const MARGIN = 8;
  const MAX_PANEL = 256;
  const viewportHeight =
    (typeof window !== 'undefined' ? window.visualViewport?.height : undefined) ??
    (typeof window !== 'undefined' ? window.innerHeight : 800);
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 400;

  const below = viewportHeight - (coords.top + coords.height) - MARGIN;
  const above = coords.top - MARGIN;
  // Flip only when below is genuinely too cramped AND above is better — a list that jumps sides for
  // a few pixels' difference is more disorienting than a slightly short one.
  const up = below < 160 && above > below;
  const maxHeight = Math.max(96, Math.min(MAX_PANEL, up ? above : below));

  return {
    position: 'fixed',
    top: up ? Math.max(MARGIN, coords.top - maxHeight - 4) : coords.top + coords.height + 4,
    // 256px is the panel's own width; without this it runs off the right edge whenever the caret is
    // in the last third of the line, which on a phone is most of the time.
    left: Math.max(MARGIN, Math.min(coords.left, viewportWidth - 256 - MARGIN)),
    maxHeight,
    zIndex: 90,
  };
}

type MentionOption = { kind: MentionKind; id: string; label: string; sub?: string; score: number };

// `sigil` is what opened the dropdown, and it decides what the dropdown is allowed to contain.
// '@' searches everything — people, tasks and docs together — because most of the time you remember
// the name and not which kind of thing it is. '#' narrows to tasks only, for anyone who already has
// that habit from GitHub. A shortcut, never the only way in: nobody has to learn it.
type Trigger = { start: number; end: number; query: string; sigil: '@' | '#' };

type MentionTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  // Limits what can be mentioned to one workspace's people, tasks and docs. Omitted where the text
  // is already inside a workspace and cannot be read from outside it.
  workspaceId?: string | null;
};

// Drop-in <textarea> replacement: forwards every prop transparently, and on top of that watches
// for an in-progress "@query" at the caret to show a floating, keyboard-navigable mention dropdown
// (Task/standalone-Doc/User, same scoring as CommandPalette). Selecting an option splices in a
// `@[Label](kind:id)` token. Arrow/Enter/Tab/Escape are only intercepted while the dropdown is
// open — every other keystroke, and onBlur, always falls through to the wrapped handler untouched,
// so callers' existing behavior (comment-box Enter-to-submit, doc-editor activity logging on blur)
// keeps working exactly as before when the user isn't mid-mention.
function MentionTextareaInner(
  { value, onChange, workspaceId, onKeyDown, onBlur, ...rest }: MentionTextareaProps,
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
    while (i >= 0 && text[i] !== '@' && text[i] !== '#' && !/\s/.test(text[i])) i--;
    if (i >= 0 && (text[i] === '@' || text[i] === '#') && (i === 0 || /\s/.test(text[i - 1]))) {
      setTrigger({ start: i, end: caret, query: text.slice(i + 1, caret), sigil: text[i] as '@' | '#' });
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
    // Scoped when the caller says which workspace this text belongs to. Chat does; a task comment
    // does not need to, since it is already inside one. Without a scope everything is offered, which
    // is right for a comment and wrong for a message: mentioning a task from a workspace the other
    // person cannot open produces a chip that does nothing for them.
    const spaceIds = workspaceId
      ? new Set((workspaces.find((w) => w.id === workspaceId)?.spaces ?? []).flatMap((sp) => sp.lists.map((l) => l.id)))
      : null;
    const memberIds = workspaceId
      ? new Set((workspaces.find((w) => w.id === workspaceId)?.members ?? []).map((m) => m.id))
      : null;
    for (const t of tasks) {
      if (spaceIds && !spaceIds.has(t.listId)) continue;
      if (t.archived) continue;
      const score = q ? scoreMatch(t.title, q) : 1;
      if (score !== null) results.push({ kind: 'task', id: t.id, label: t.title, score });
    }
    if (trigger.sigil === '@') {
      for (const u of users) {
        if (memberIds && !memberIds.has(u.id)) continue;
        const score = q ? scoreMatch(u.name, q) : 1;
        if (score !== null) results.push({ kind: 'user', id: u.id, label: u.name, score });
      }
    }
    for (const ws of workspaces) {
      if (trigger.sigil === '#') break;
      if (workspaceId && ws.id !== workspaceId) continue;
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
            style={placement(coords)}
            className="w-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1"
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
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer ${
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

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import type { AppUser } from '../store/useTaskStore';
import { usePresenceStore } from '../store/usePresenceStore';

// A person's face, or their initials on their colour when there is no photo. Local to the pickers on
// purpose: PersonAvatar carries DND badges and drag wiring that mean nothing inside a dropdown.
// `showPresence` adds the green online dot, from the same presence store Office uses.
export function MiniAvatar({
  user,
  size = 24,
  className = '',
  showPresence = false,
}: {
  user: AppUser;
  size?: number;
  className?: string;
  showPresence?: boolean;
}) {
  const isOnline = usePresenceStore((s) => s.onlineUserIds.has(user.id));
  const style = { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.38)) };
  const face = user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt={user.name} title={user.name} style={style} className={`rounded-full object-cover shrink-0 ${className}`} draggable={false} />
  ) : (
    <span
      title={user.name}
      style={{ ...style, backgroundColor: user.color }}
      className={`rounded-full font-bold text-white flex items-center justify-center shrink-0 ${className}`}
    >
      {user.initials}
    </span>
  );
  if (!showPresence) return face;
  const dot = Math.max(7, Math.round(size * 0.3));
  return (
    <span className="relative inline-flex shrink-0">
      {face}
      {isOnline && (
        <span
          title="Online"
          style={{ width: dot, height: dot }}
          className="absolute -bottom-px -left-px rounded-full bg-emerald-500 ring-2 ring-neutral-900"
        />
      )}
    </span>
  );
}

// The overlapping faces a task shows for its assignees — the anchor the picker opens from.
export function AssigneeStack({ people, max = 3, size = 22 }: { people: AppUser[]; max?: number; size?: number }) {
  if (people.length === 0) {
    return (
      <span
        style={{ width: size, height: size }}
        className="rounded-full border border-dashed border-neutral-600 text-neutral-500 text-[10px] flex items-center justify-center"
      >
        +
      </span>
    );
  }
  const extra = people.length - max;
  return (
    <span className="flex items-center -space-x-1.5">
      {people.slice(0, max).map((p) => (
        <MiniAvatar key={p.id} user={p} size={size} className="ring-2 ring-neutral-900" />
      ))}
      {extra > 0 && (
        <span
          style={{ width: size, height: size }}
          className="rounded-full bg-neutral-800 text-neutral-300 text-[9px] font-semibold flex items-center justify-center ring-2 ring-neutral-900"
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

// The body of every assignee / attendee dropdown (task row, task modal, event, quick-create).
//
// Built after ClickUp's, as asked: a search field on top, you first as "Me", and no checkboxes —
// whether someone is on the task is shown on the person (a ring, and a small red × on their face
// that says what a click will do), not in a separate box beside them. One component so the four
// pickers stop being four copies that drift.
//
// Two sections while nothing is typed: "Suggested" — you, then the people most often put on things
// in this same place (`suggestedIds`, see lib/assigneeSuggestions.ts) — and everyone else, already
// assigned first, then by name. Typing flattens it to one filtered list.
//
// The order is decided when the panel opens and then held. Re-sorting on every click would make the
// row you just clicked jump away from under the pointer.
export default function AssigneePicker({
  people,
  selectedIds,
  onToggle,
  currentUserId,
  autoFocus = true,
  heading = 'Assignees',
  suggestedIds = [],
}: {
  people: AppUser[];
  selectedIds: string[];
  // Most likely first. Anyone not in `people` is ignored.
  suggestedIds?: string[];
  onToggle: (userId: string) => void;
  currentUserId?: string | null;
  // Off on phones: focusing the field raises the keyboard over the list you opened to tap in.
  autoFocus?: boolean;
  heading?: string;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [initiallySelected] = useState(() => new Set(selectedIds));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Frozen at open for the same reason as the order below it: a suggestion that moved as you clicked
  // would be worse than none.
  const [suggestionsAtOpen] = useState(() => suggestedIds);

  const { suggested, rest } = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p] as const));
    const top: AppUser[] = [];
    const me = currentUserId ? byId.get(currentUserId) : undefined;
    if (me) top.push(me);
    for (const id of suggestionsAtOpen) {
      const p = byId.get(id);
      if (p && !top.includes(p) && top.length < 4) top.push(p);
    }
    const topIds = new Set(top.map((p) => p.id));
    const others = people
      .filter((p) => !topIds.has(p.id))
      .sort((a, b) => Number(initiallySelected.has(b.id)) - Number(initiallySelected.has(a.id)) || a.name.localeCompare(b.name));
    return { suggested: top, rest: others };
  }, [people, currentUserId, suggestionsAtOpen, initiallySelected]);

  const q = query.trim().toLowerCase();
  const matches = (u: AppUser) => u.name.toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q);
  // One flat list for the keyboard, with where each heading goes.
  const sections: { title: string; people: AppUser[] }[] = q
    ? [{ title: heading, people: [...suggested, ...rest].filter(matches) }]
    : [
        { title: 'Suggested', people: suggested },
        { title: heading, people: rest },
      ].filter((sec) => sec.people.length > 0);
  const visible = sections.flatMap((sec) => sec.people);
  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const u = visible[activeIndex];
      if (u) onToggle(u.id);
    }
  };

  const selected = new Set(selectedIds);

  return (
    <div className="flex flex-col w-full" onKeyDown={onKeyDown}>
      <div className="relative mb-1.5">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Search people…"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-2 py-2 md:py-1.5 text-[13px] md:text-xs text-app-strong placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/70"
        />
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto -mx-0.5 px-0.5">
        {sections.map((sec) => (
          <div key={sec.title}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 px-2 pt-1.5 pb-1">{sec.title}</p>
            {sec.people.map((u) => {
              const i = visible.indexOf(u);
              const isOn = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  data-index={i}
                  onClick={() => onToggle(u.id)}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  className={`group w-full flex items-center gap-2.5 px-2 py-2 md:py-1.5 rounded-lg text-left cursor-pointer transition ${
                    i === activeIndex ? 'bg-neutral-800/80' : ''
                  }`}
                >
                  <span className="relative shrink-0">
                    <MiniAvatar user={u} size={26} showPresence className={isOn ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-neutral-900' : ''} />
                    {isOn && (
                      // The × says what clicking does to someone already on the task, which a filled
                      // checkbox never did — ClickUp's own cue.
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center ring-2 ring-neutral-900 transition group-hover:scale-110">
                        <X className="w-2.5 h-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className={`flex-1 min-w-0 truncate text-[13px] md:text-xs ${isOn ? 'text-app-strong font-semibold' : 'text-neutral-300'}`}>
                    {u.id === currentUserId ? 'Me' : u.name}
                  </span>
                  {isOn && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-[11px] text-neutral-500 px-2 py-2">{people.length === 0 ? 'No one in this workspace yet.' : 'No one matches.'}</p>
        )}
      </div>
    </div>
  );
}

// A person already on something (a task's assignees, an event's attendees): their face and name on a
// quiet pill, with an × to take them off. Replaces the name on a slab of the person's own colour —
// that colour is for the avatar, and a row of them read as a row of warning labels.
export function PersonPill({ user, onRemove }: { user: AppUser; onRemove?: () => void }) {
  return (
    <span className="group/pill inline-flex items-center gap-1.5 pl-0.5 pr-1 py-0.5 rounded-full bg-neutral-800/70 border border-neutral-700/60 text-[11px] text-app-strong font-medium">
      <MiniAvatar user={user} size={20} />
      <span className={`max-w-[9rem] truncate ${onRemove ? '' : 'pr-1.5'}`}>{user.name}</span>
      {onRemove && (
        <button
          type="button"
          title={`Remove ${user.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          // Always visible on touch, where there is no hover to reveal it.
          className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-500 hover:text-app-strong hover:bg-neutral-700 cursor-pointer md:opacity-0 md:group-hover/pill:opacity-100 focus:opacity-100 transition"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

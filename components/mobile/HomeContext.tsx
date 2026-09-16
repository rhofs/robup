'use client';

import { useState } from 'react';
import { ChevronRight, MessageSquare, UserPlus } from 'lucide-react';
import type { HierarchySpace } from '../../store/useTaskStore';
import ContextSpaceList from './ContextSpaceList';
import { hapticTap } from '../../lib/haptics';

// The private half of the two-context layout, and deliberately the same component shape as
// OfficeContext: a two-option toggle over a list.
//
// That sameness is the feature. Learn the control once in Office and it already works here; the old
// layout had five things at one level and none of them taught you any of the others. It is also why
// the toggle is two options and not three — a third would make it a menu, and a menu explains
// nothing.
//
// My Spaces is the default side, matching Office's Spaces: the app is a task manager first, and the
// half you land on is what it says it is for.

export type HomeTab = 'spaces' | 'messages';

type Dm = {
  id: string;
  label: string;
  initials: string;
  color: string;
  preview?: string;
  unreadCount?: number;
};

type Suggestion = { id: string; name: string; initials: string; color: string; reason: string };

type Props = {
  spaces: HierarchySpace[];
  dms: Dm[];
  suggestions: Suggestion[];
  tab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  openSpaceIds: Set<string>;
  openFolderIds: Set<string>;
  onToggleSpace: (spaceId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onSelectSpace: (spaceId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSpaceMenu: (x: number, y: number, space: HierarchySpace) => void;

  onSelectDm: (channelId: string) => void;
  onStartDm: (userId: string) => void;
  onCreateSpace: (name: string) => void;
};

export default function HomeContext({
  spaces,
  dms,
  suggestions,
  tab,
  onTabChange,
  openSpaceIds,
  openFolderIds,
  onToggleSpace,
  onToggleFolder,
  onSelectSpace,
  onSelectList,
  onSpaceMenu,
  onSelectDm,
  onStartDm,
  onCreateSpace,
}: Props) {
  // Local, because creating a Space is a moment inside this screen and nothing above it needs to
  // know it is happening.
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [draft, setDraft] = useState('');
  const commitSpace = () => {
    const name = draft.trim();
    if (name) onCreateSpace(name);
    setDraft('');
    setCreatingSpace(false);
  };
  // tab/onTabChange come from the page rather than useState: this component unmounts every
  // time you open something from it, and a local default meant coming back always landed on the
  // first half regardless of which one you left from.

  // A dot rather than a number: the count is already on every row in the list below, and the only
  // thing this has to say from out here is "there is something in the other half".
  const unreadInOther = dms.reduce((sum, x) => sum + (x.unreadCount || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto pb-28">
      <div className="mx-2 mb-2 flex gap-0.5 rounded-full bg-neutral-800/60 p-0.5">
        {([
          ['spaces', 'My Spaces'],
          ['messages', 'Messages'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              if (id !== tab) hapticTap();
              onTabChange(id);
            }}
            className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold transition cursor-pointer ${
              tab === id ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-400'
            }`}
          >
            {label}
            {id === 'messages' && unreadInOther > 0 && tab !== 'messages' && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" />
            )}
          </button>
        ))}
      </div>

      {tab === 'spaces' ? (
        <div className="space-y-2">
          {/* The overdue/today counts that used to sit here are gone. They led nowhere — tapping
              them did nothing at all, because the only destination they had was the same Home
              screen they were already on. A number that is not a way in is decoration, and this one
              was taking the most valuable strip on the screen. If it comes back it has to arrive
              with a real filtered view behind it. */}
          <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
            <ContextSpaceList
              spaces={spaces}
              openSpaceIds={openSpaceIds}
              openFolderIds={openFolderIds}
              onToggleSpace={onToggleSpace}
              onToggleFolder={onToggleFolder}
              emptyText="Nothing here yet — your private lists live in this half."
              onSelectSpace={onSelectSpace}
              onSelectList={onSelectList}
              onSpaceMenu={onSpaceMenu}
            />
            {creatingSpace ? (
              // Creates the Space right here instead of opening the Spaces tree to do it. Routing this to
              // the tree was the original shortcut — the tree already has a create flow with naming, colour
              // and icon — but from a context screen it reads as the button failing: you tap "New space"
              // and land in a different navigation system with no space created. Reported as "Trykker jeg
              // på New Space, så kommer jeg bare inn på Personal Spaces. Så den funker ikke." Name only
              // here; colour and icon stay the tree's job, reachable by editing the Space afterwards.
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitSpace();
                }}
                className="flex items-center gap-2 px-2 py-1.5"
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  // Blur commits rather than discards: on a phone, dismissing the keyboard is the most
                  // likely way out of this field, and losing a typed name to it would read as the same
                  // "New space does nothing" bug all over again.
                  onBlur={commitSpace}
                  placeholder="Space name"
                  className="flex-1 min-w-0 bg-neutral-800 rounded-lg px-2.5 py-2 text-sm text-app-strong placeholder:text-neutral-500 outline-none"
                />
              </form>
            ) : (
              <button
                onClick={() => {
                  hapticTap();
                  setCreatingSpace(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left text-xs text-neutral-500 hover:bg-neutral-800/60 cursor-pointer transition"
              >
                <span className="font-bold text-base leading-none">+</span> New space
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Direct messages
            </p>
            {dms.length === 0 && (
              <p className="px-2 py-2 text-xs text-neutral-500">No conversations yet.</p>
            )}
            {dms.map((dm) => (
              <button
                key={dm.id}
                onClick={() => onSelectDm(dm.id)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
              >
                <span
                  className="w-7 h-7 rounded-full shrink-0 text-[10px] font-bold flex items-center justify-center text-white"
                  style={{ backgroundColor: dm.color }}
                >
                  {dm.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-200 truncate">{dm.label}</span>
                  {dm.preview && <span className="block text-[11px] text-neutral-500 truncate">{dm.preview}</span>}
                </span>
                {!!dm.unreadCount && (
                  <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {dm.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* People you already share a workspace with but have never spoken to. This is the half of
              "add connections" that can be answered without asking anyone to type a name — and it is
              here rather than in Office because who you talk to is yours, not the company's. */}
          {suggestions.length > 0 && (
            <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Suggested</p>
              {suggestions.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onStartDm(u.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                >
                  <span
                    className="w-7 h-7 rounded-full shrink-0 text-[10px] font-bold flex items-center justify-center text-white"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-200 truncate">{u.name}</span>
                    <span className="block text-[11px] text-neutral-500 truncate">{u.reason}</span>
                  </span>
                  <MessageSquare className="w-4 h-4 text-neutral-600 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {suggestions.length === 0 && dms.length === 0 && (
            <div className="mx-2 rounded-2xl bg-neutral-900 px-3 py-4 elevated text-center">
              <UserPlus className="w-5 h-5 text-neutral-600 mx-auto mb-1.5" />
              <p className="text-xs text-neutral-500">Use the + above to connect with someone.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

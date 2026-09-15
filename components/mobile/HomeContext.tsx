'use client';

import { useState } from 'react';
import { ChevronRight, MessageSquare, UserPlus } from 'lucide-react';
import type { HierarchySpace } from '../../store/useTaskStore';
import { FOLDER_ICON_MAP } from '../FolderTree';
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
  overdueCount: number;
  todayCount: number;
  onSelectSpace: (spaceId: string) => void;
  onSelectDm: (channelId: string) => void;
  onStartDm: (userId: string) => void;
  onOpenOverdue: () => void;
  onCreateSpace: () => void;
};

export default function HomeContext({
  spaces,
  dms,
  suggestions,
  overdueCount,
  todayCount,
  onSelectSpace,
  onSelectDm,
  onStartDm,
  onOpenOverdue,
  onCreateSpace,
}: Props) {
  const [tab, setTab] = useState<HomeTab>('spaces');

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
              setTab(id);
            }}
            className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold transition cursor-pointer ${
              tab === id ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'spaces' ? (
        <div className="space-y-2">
          {/* The one row that crosses every boundary in the app. Everything else on this screen is
              scoped to the personal workspace; these two counts are not, because "what have I let
              slip" is not a question about one workspace. It sits above the lists for the same
              reason — if it were below, it would only be seen by someone already scrolling. */}
          {(overdueCount > 0 || todayCount > 0) && (
            <button
              onClick={onOpenOverdue}
              className="mx-2 w-[calc(100%-1rem)] rounded-2xl bg-neutral-900 px-3 py-2.5 elevated flex items-center gap-3 text-left cursor-pointer"
            >
              {overdueCount > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold leading-none text-red-500">{overdueCount}</span>
                  <span className="text-[11px] text-neutral-400">overdue</span>
                </span>
              )}
              {todayCount > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold leading-none text-app-strong">{todayCount}</span>
                  <span className="text-[11px] text-neutral-400">today</span>
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-neutral-600 ml-auto shrink-0" />
            </button>
          )}

          <div className="mx-2 rounded-2xl bg-neutral-900 px-2 py-2 space-y-0.5 elevated">
            {spaces.length === 0 && (
              <p className="px-2 py-3 text-xs text-neutral-500">
                Nothing here yet — your private lists live in this half.
              </p>
            )}
            {spaces.map((space) => {
              const Icon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
              return (
                <button
                  key={space.id}
                  onClick={() => onSelectSpace(space.id)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: space.color || '#6366f1' }}
                  >
                    {Icon ? (
                      <Icon className="w-4 h-4 text-white" />
                    ) : (
                      <span className="text-white text-xs font-bold">{space.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{space.name}</span>
                  <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                </button>
              );
            })}
            <button
              onClick={onCreateSpace}
              className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left text-xs text-neutral-500 hover:bg-neutral-800/60 cursor-pointer transition"
            >
              <span className="font-bold text-base leading-none">+</span> New space
            </button>
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

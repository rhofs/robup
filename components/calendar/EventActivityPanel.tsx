'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Pencil, CalendarClock, UserCircle } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';

// Small, Event-scoped icon map — Event's own PATCH route (app/api/events/[id]/route.ts) only
// ever generates these three activityKinds, unlike Task's much larger ACTIVITY_ICONS in
// app/page.tsx (status/archived/subtask kinds don't apply to an Event at all).
const EVENT_ACTIVITY_ICONS: Record<string, typeof Pencil> = {
  title: Pencil,
  datesChanged: CalendarClock,
  assigned: UserCircle,
  unassigned: UserCircle,
};

const timeAgo = (dateStr: string) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

// The Event equivalent of app/page.tsx's Task "Activity & Comments" panel (backlog #12) — built
// as its own small component rather than inlined in EventDetailModal.tsx, matching how Doc
// comments (components/collab/DocCommentsPanel.tsx) are also their own file. No "Comment as..."
// picker (a pre-auth artifact Task's own panel still carries) — always the real signed-in
// identity, same deliberate simplification DocCommentsPanel already made for the same reason.
export default function EventActivityPanel({ eventId }: { eventId: string }) {
  const { eventComments, fetchEventComments, addEventComment } = useTaskStore();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    fetchEventComments(eventId);
  }, [eventId, fetchEventComments]);

  const comments = eventComments[eventId] || [];

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addEventComment(eventId, trimmed);
    setDraft('');
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" /> Activity & Comments
      </label>
      <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
        {comments.length === 0 && <p className="text-[11px] text-neutral-500">No activity yet.</p>}
        {comments.map((c) =>
          c.type === 'activity' ? (
            <div key={c.id} className="flex items-center gap-1.5 text-[10px] text-neutral-500 italic">
              {(() => {
                const Icon = c.activityKind ? EVENT_ACTIVITY_ICONS[c.activityKind] : null;
                return Icon ? <Icon className="w-3 h-3 shrink-0" /> : <span className="w-1 h-1 rounded-full bg-neutral-600 shrink-0" />;
              })()}
              <span className="truncate">{c.body}</span>
              <span className="text-neutral-600 ml-auto shrink-0">{timeAgo(c.createdAt)}</span>
            </div>
          ) : (
            <div key={c.id} className="bg-neutral-950/60 border border-neutral-800 rounded p-2">
              <div className="flex items-center gap-1.5 mb-1">
                {c.author ? (
                  <span
                    className="w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: c.author.color }}
                  >
                    {c.author.initials}
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full bg-neutral-700 text-[7px] font-bold flex items-center justify-center text-neutral-300 shrink-0">?</span>
                )}
                <span className="text-[10px] font-semibold text-neutral-300 truncate">{c.author?.name || 'Anonymous'}</span>
                <span className="text-[9px] text-neutral-500 ml-auto shrink-0">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="text-[11px] text-neutral-300 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          )
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Add a comment..."
          className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-xs text-app-strong focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer px-2 py-1.5"
        >
          Send
        </button>
      </div>
    </div>
  );
}

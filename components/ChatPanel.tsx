'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useChatStore, type ChatMessage } from '../store/useChatStore';
import { useSessionStore } from '../store/useSessionStore';
import { dateKey } from '../lib/navUrl';
import { renderChatMessageBody } from '../lib/chatFormat';
import { useChatChannelConnection } from '../lib/collab/useChatChannelConnection';

const COMPOSER_MAX_HEIGHT_PX = 160;

// Flat message feed for whichever channel ChatChannelSidebar (rendered in the main left `<aside>`,
// not here) has selected via useChatStore's shared activeChannelId. Real-time delivery (Phase 2,
// see PLANNING.md's "Planned: Discord/Slack-style chat" section) via useChatChannelConnection —
// the manual refresh button stays as a fallback for a signal missed during a brief disconnect.
// No threads/quotes/reactions/attachments/DMs yet even though the schema already carries fields
// for all of them.

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const dk = dateKey(d);
  if (dk === dateKey(new Date())) return 'Today';
  if (dk === dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A "run" is consecutive messages from the same author, on the same day, each within
// GROUP_WINDOW_MS of the previous one — only the run's first message shows the avatar/name/time
// header, same grouping convention Slack/ClickUp/Discord all use.
type Run = { authorId: string | null; messages: ChatMessage[] };

function groupIntoDays(messages: ChatMessage[]): { label: string; runs: Run[] }[] {
  const days: { label: string; runs: Run[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    let day = days[days.length - 1]?.label === label ? days[days.length - 1] : undefined;
    if (!day) {
      day = { label, runs: [] };
      days.push(day);
    }
    const lastRun = day.runs[day.runs.length - 1];
    const lastMsg = lastRun?.messages[lastRun.messages.length - 1];
    const sameRun = lastRun && lastRun.authorId === m.authorId && lastMsg && new Date(m.createdAt).getTime() - new Date(lastMsg.createdAt).getTime() < GROUP_WINDOW_MS;
    if (sameRun) {
      lastRun.messages.push(m);
    } else {
      day.runs.push({ authorId: m.authorId, messages: [m] });
    }
  }
  return days;
}

export default function ChatPanel({ workspaceId }: { workspaceId: string }) {
  const { channelsByWorkspace, messagesByChannel, activeChannelId, fetchMessages, postMessage } = useChatStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grows with content up to a cap — genuinely needed once multi-line ``` code blocks ``` are a
  // real use case, not just a cosmetic touch (a fixed single row hid everything past the first
  // line while typing).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const channels = channelsByWorkspace[workspaceId] || [];
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const messages = activeChannelId ? messagesByChannel[activeChannelId] || [] : [];
  const days = groupIntoDays(messages);

  useEffect(() => {
    if (activeChannelId) fetchMessages(activeChannelId);
  }, [activeChannelId, fetchMessages]);

  const onRealtimeSignal = useCallback(() => {
    if (activeChannelId) fetchMessages(activeChannelId);
  }, [activeChannelId, fetchMessages]);
  useChatChannelConnection(activeChannelId, onRealtimeSignal);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !activeChannelId || sending) return;
    setSending(true);
    const sent = await postMessage(activeChannelId, { body: trimmed });
    setSending(false);
    if (sent) setDraft('');
  };

  if (!activeChannelId) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-neutral-500">
        Pick a channel from the sidebar, or create a new one.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1 py-3 space-y-4">
        {messages.length === 0 && <p className="text-[11px] text-neutral-500 px-2">No messages yet in #{activeChannel?.name} — say hello.</p>}
        {days.map((day, dayIdx) => (
          <div key={dayIdx} className="space-y-3">
            <div className="flex items-center justify-center">
              <span className="text-[10px] font-medium text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1">
                {day.label}
              </span>
            </div>
            {day.runs.map((run, runIdx) => {
              const first = run.messages[0];
              return (
                <div key={runIdx} className="space-y-0.5">
                  <div className="flex items-start gap-2 px-2">
                    {first.author ? (
                      <span
                        className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: first.author.color }}
                      >
                        {first.author.initials}
                      </span>
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-neutral-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[12px] font-semibold text-neutral-200">
                          {first.author?.name ?? 'Unknown'}
                          {first.authorId === currentUserId ? ' (you)' : ''}
                        </span>
                        <span className="text-[10px] text-neutral-500">{timeLabel(first.createdAt)}</span>
                      </div>
                      <div className="text-[13px] text-neutral-200 break-words leading-snug">{renderChatMessageBody(first.body)}</div>
                    </div>
                  </div>
                  {run.messages.slice(1).map((m) => (
                    <div key={m.id} className="group flex items-start gap-2 px-2">
                      <span className="w-7 shrink-0 text-right text-[9px] text-neutral-600 opacity-0 group-hover:opacity-100 transition pt-0.5">
                        {timeLabel(m.createdAt)}
                      </span>
                      <div className="min-w-0 flex-1 text-[13px] text-neutral-200 break-words leading-snug">{renderChatMessageBody(m.body)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 mt-2 px-2.5 py-2 rounded-xl border border-neutral-800 bg-neutral-900/60 focus-within:border-blue-500/60 transition">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Message...'}
          rows={1}
          style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
          className="flex-1 bg-transparent text-[13px] text-white placeholder:text-neutral-500 resize-none focus:outline-none py-1 overflow-y-auto"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          title="Send"
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white cursor-pointer transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

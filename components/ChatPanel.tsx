'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Reply, Trash2, X, MessagesSquare, Paperclip, SmilePlus, FileText, Download, UploadCloud } from 'lucide-react';
import { useChatStore, type ChatMessage, type ChatAttachment, type ChatReaction, type ChatDMMember } from '../store/useChatStore';
import { useSessionStore } from '../store/useSessionStore';
import { dateKey } from '../lib/navUrl';
import { renderChatMessageBody } from '../lib/chatFormat';
import { useChatChannelConnection } from '../lib/collab/useChatChannelConnection';
import { uploadChatFile } from '../lib/uploadChatFile';
import { formatBytes } from '../lib/formatBytes';
import FloatingPopover from './FloatingPopover';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLongPress } from '../hooks/useLongPress';

const COMPOSER_MAX_HEIGHT_PX = 160;

// Flat message feed for whichever channel is currently selected via useChatStore's shared
// activeChannelId — a channel or DM/group picked from the unified ChatSidebar. Real-time
// delivery (Phase 2, see PLANNING.md's "Planned: Discord/Slack-style chat" section) via
// useChatChannelConnection — the manual refresh button stays as a fallback for a signal missed
// during a brief disconnect.

// Fixed quick-react palette (Phase 7) — no full emoji-picker library, matching the schema's own
// "raw unicode emoji, no custom/shortcode" v1 scope cut. Discord-style small common set rather
// than an open-ended picker.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🙏', '👀'];

const GROUP_WINDOW_MS = 5 * 60 * 1000;
// Client-side mirror of app/api/uploads/image/route.ts's own two allowlists/caps — rejects
// obviously bad picks before ever hitting the network; the route re-validates both independently
// regardless (this is purely a faster/friendlier failure for the composer, not the real gate).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/quicktime',
]);

// Shared by the file-input onChange handler and the drag-and-drop onDrop handler — both end up
// with a plain File and need the exact same validate-then-preview treatment. Exported so
// ChatThreadPanel.tsx's composer can reuse the exact same allowlists/caps instead of maintaining
// its own copy.
export type PickedAttachment = { file: File; kind: 'image' | 'file'; previewUrl: string | null };

export function validatePickedFile(file: File): { kind: 'image' | 'file' } | { error: string } {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) return { error: 'Image is too large (max 8MB)' };
    return { kind: 'image' };
  }
  if (ALLOWED_FILE_TYPES.has(file.type)) {
    if (file.size > MAX_FILE_BYTES) return { error: 'File is too large (max 20MB)' };
    return { kind: 'file' };
  }
  return { error: 'Unsupported file type' };
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const dk = dateKey(d);
  if (dk === dateKey(new Date())) return 'Today';
  if (dk === dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export function timeLabel(iso: string): string {
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

export default function ChatPanel() {
  const { channelsByWorkspace, dms, messagesByChannel, loadedChannelIds, activeChannelId, fetchMessages, postMessage, deleteMessage, setActiveThreadRootId, toggleReaction } =
    useChatStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const isMobile = useIsMobile();
  // Mobile has no hover, so MessageActions (reply/thread/react/delete — normally hidden
  // group-hover:flex) is unreachable there without this: press-and-hold a message reveals it for
  // that one message, tapping the message list anywhere else hides it again.
  const [heldMessageId, setHeldMessageId] = useState<string | null>(null);
  // One shared timer (not a hook-per-row, since the number of rows changes) — same long-press
  // pattern as components/calendar/WeekRow.tsx's day-cell long-press: hold still for 500ms,
  // cancelled if the finger moves enough to read as a scroll instead.
  const messageLongPressTimerRef = useRef<number | null>(null);
  const messageLongPressStartRef = useRef({ x: 0, y: 0 });
  const startMessageLongPress = (id: string) => (e: React.PointerEvent) => {
    if (!isMobile) return;
    messageLongPressStartRef.current = { x: e.clientX, y: e.clientY };
    if (messageLongPressTimerRef.current !== null) window.clearTimeout(messageLongPressTimerRef.current);
    messageLongPressTimerRef.current = window.setTimeout(() => setHeldMessageId(id), 500);
  };
  const moveMessageLongPress = (e: React.PointerEvent) => {
    if (!isMobile || messageLongPressTimerRef.current === null) return;
    const dx = e.clientX - messageLongPressStartRef.current.x;
    const dy = e.clientY - messageLongPressStartRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      window.clearTimeout(messageLongPressTimerRef.current);
      messageLongPressTimerRef.current = null;
    }
  };
  const endMessageLongPress = () => {
    if (messageLongPressTimerRef.current !== null) {
      window.clearTimeout(messageLongPressTimerRef.current);
      messageLongPressTimerRef.current = null;
    }
  };
  // Quote-reply target set by clicking a message's Reply action — cleared once actually sent.
  // Carries a plain title/snippet snapshot at click time (not just an id) purely so the composer
  // chip has something to render immediately without an extra lookup.
  const [replyTarget, setReplyTarget] = useState<{ id: string; authorName: string; body: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Media (Phase 6) + generic files (this pass). Picked but not-yet-sent attachment — shows a
  // local blob-URL preview immediately for images (before any network call), uploaded only once
  // the user actually hits Send, same "don't touch the network until the user commits" convention
  // CollabDocEditor's own image picker uses. previewUrl is null for a non-image file — no useful
  // thumbnail to show, just an icon + filename + size.
  const [pendingAttachment, setPendingAttachment] = useState<PickedAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Drag-and-drop over the whole panel (message list + composer), Discord/Slack-style. A counter,
  // not a boolean — dragenter/dragleave fire on every nested element a dragged file passes over,
  // so a plain boolean flickers off the instant the pointer crosses into a child element instead
  // of only when it actually leaves the whole drop zone.
  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  // Grows with content up to a cap — genuinely needed once multi-line ``` code blocks ``` are a
  // real use case, not just a cosmetic touch (a fixed single row hid everything past the first
  // line while typing).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const activeChannel =
    Object.values(channelsByWorkspace).flat().find((c) => c.id === activeChannelId) ?? dms.find((c) => c.id === activeChannelId);
  // Both channel types now carry `.members` (real channels via GET/POST
  // /api/workspaces/[id]/channels' include, DMs since Phase 3) — a single resolution path for
  // quoted-author display names, no more per-workspace lookup.
  const membersById = new Map((activeChannel?.members ?? []).map((m) => [m.userId, m.user]));
  const isDM = activeChannel?.type === 'dm' || activeChannel?.type === 'group_dm';
  // A DM has no stored name (name: null, always) — rendered here from whichever *other* members
  // are on it, same "relative to the viewer" convention Slack/Discord use for DM titles.
  const dmLabel = isDM
    ? (activeChannel!.members ?? [])
        .map((m) => m.user)
        .filter((u) => u.id !== currentUserId)
        .map((u) => u.name)
        .join(', ') || 'Just you'
    : null;
  const activeChannelLabel = isDM ? dmLabel : activeChannel?.name;
  const messages = activeChannelId ? messagesByChannel[activeChannelId] || [] : [];
  // Has this conversation ever finished loading? Cached messages render instantly on a second
  // visit; the very first open genuinely has nothing to show yet, and the difference matters
  // because "empty" and "not loaded" look identical from `messages.length` alone.
  const hasLoaded = !!activeChannelId && loadedChannelIds.includes(activeChannelId);
  const days = groupIntoDays(messages);
  const myProfile = currentUserId ? membersById.get(currentUserId) ?? null : null;

  useEffect(() => {
    if (activeChannelId) fetchMessages(activeChannelId);
    setReplyTarget(null);
    setPendingAttachment(null);
    setAttachmentError(null);
  }, [activeChannelId, fetchMessages]);

  // Blob URLs are only good for this tab's lifetime — revoke on replace/unmount so a run of
  // picked-then-discarded images doesn't quietly leak memory.
  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    };
  }, [pendingAttachment]);

  const onRealtimeSignal = useCallback(() => {
    if (activeChannelId) fetchMessages(activeChannelId);
  }, [activeChannelId, fetchMessages]);
  const { typingUsers, notifyTyping } = useChatChannelConnection(
    activeChannelId,
    onRealtimeSignal,
    myProfile ? { id: myProfile.id, name: myProfile.name } : null
  );
  // Throttled, not one ping per keystroke — Slack/Discord-style "still actively typing" pings
  // roughly every couple seconds while composing, not a flood. Each recipient's own
  // TYPING_EXPIRY_MS (useChatChannelConnection.ts) clears the indicator if pings actually stop.
  const lastTypingPingRef = useRef(0);
  const handleDraftChange = (value: string) => {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingPingRef.current > 2000) {
      lastTypingPingRef.current = now;
      notifyTyping();
    }
  };

  const processPickedFile = (file: File) => {
    setAttachmentError(null);
    const result = validatePickedFile(file);
    if ('error' in result) {
      setAttachmentError(result.error);
      return;
    }
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, kind: result.kind, previewUrl: result.kind === 'image' ? URL.createObjectURL(file) : null };
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets picking the exact same file again re-fire onChange
    if (file) processPickedFile(file);
  };

  const clearPendingAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    setAttachmentError(null);
  };

  // Drag-and-drop over the whole panel. preventDefault on dragOver is required for onDrop to ever
  // fire at all — without it the browser's default behavior (navigate to/open the dropped file)
  // wins instead. The `types.includes('Files')` check keeps this from lighting up for a dragged
  // text selection or a browser-internal drag (e.g. dragging a tab), which also fire these events.
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processPickedFile(file);
  };

  const handleSend = async () => {
    const trimmed = draft.trim();
    // An attachment-only message (no text) is valid, same as Discord/Slack.
    if ((!trimmed && !pendingAttachment) || !activeChannelId || sending || uploadingAttachment) return;
    setSending(true);
    try {
      let attachment: { url: string; fileName: string; byteSize: number; kind: 'image' | 'file' } | undefined;
      if (pendingAttachment) {
        setUploadingAttachment(true);
        attachment = await uploadChatFile(pendingAttachment.file);
        setUploadingAttachment(false);
      }
      const sent = await postMessage(activeChannelId, { body: trimmed, quotedMessageId: replyTarget?.id, attachment });
      if (sent) {
        setDraft('');
        setReplyTarget(null);
        clearPendingAttachment();
      }
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Upload failed');
      setUploadingAttachment(false);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = (messageId: string) => {
    if (!activeChannelId) return;
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    deleteMessage(activeChannelId, messageId);
  };

  // A quoted original's authorId is resolved live against the active channel's own member list
  // (the same "resolve by id, fall back if gone" convention this app's @-mentions already use) —
  // the *body* is deliberately shown from the frozen quotedBodySnapshot, but the author's display
  // name/color can safely stay live since User rows aren't hard-deleted the way a message is.
  const resolveAuthorName = (authorId: string | null) => (authorId ? membersById.get(authorId)?.name ?? 'Someone' : 'Someone');

  const handleToggleReaction = (messageId: string, emoji: string) => {
    if (!activeChannelId || !myProfile) return;
    toggleReaction(activeChannelId, messageId, emoji, myProfile);
  };

  if (!activeChannelId) {
    // Mobile with nothing picked never actually reaches this branch any more — app/page.tsx
    // renders ChatSidebar inline instead of this component at all in that state (see its own
    // comment). Desktop can still land here (the sidebar is its own always-visible <aside>, so
    // "nothing picked yet" is a real, ordinary state there).
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[12px] text-neutral-500">
        <span>{isMobile ? 'Pick a channel or DM to get started.' : 'Pick a channel from the sidebar, or create a new one.'}</span>
      </div>
    );
  }

  return (
    <div
      // pb-[env(safe-area-inset-bottom)]: an open conversation is now a genuine full-screen mobile
      // destination (the floating bottom nav hides entirely while one's open — see app/page.tsx's
      // MobileBottomNav mount), so this composer is the literal last thing on screen and needs its
      // own safe-area clearance instead of borrowing the nav's. Resolves to 0 wherever there's no
      // inset (desktop, non-notched devices), so it's harmless to always apply.
      // min-w-0: this is a flex child, and a flex item defaults to min-width:auto — it refuses to
      // shrink below its own content, so anything unexpectedly wide inside (a long unbroken link,
      // a wide code block, an attachment) can push the whole column past the viewport instead of
      // being constrained by it. That widens the composer along with everything else, which is the
      // leading suspect behind "må scrolle til siden på ios for å trykke send" — the Send button
      // isn't mispositioned, the entire panel is simply wider than the screen. Same class of bug
      // as the desktop sidebar's missing min-h-0, one axis over.
      className="relative flex flex-col h-full min-w-0 pb-[env(safe-area-inset-bottom)]"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim/85 border-2 border-dashed border-blue-500 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-400">
            <UploadCloud className="w-8 h-8" />
            <span className="text-sm font-medium">Drop to attach</span>
          </div>
        </div>
      )}
      {/* overflow-x-hidden alongside the existing overflow-y-auto: safe to add here specifically
          because this element already establishes a scroll container on one axis (CSS forces the
          other to auto anyway once either is non-visible), so it can't introduce a surprise second
          scrollbar the way it would on the panel root. Stops the message list from being
          sideways-scrollable at all — which on iOS is not just cosmetic: a horizontal drag near the
          screen edge gets interpreted as the browser's back gesture, which pops history and closes
          the conversation. That is very likely the same report as "når jeg scroller havner jeg
          ut". Genuinely wide content keeps its own escape hatch — code blocks carry their own
          overflow-x-auto (lib/chatFormat.tsx), so they scroll within themselves rather than
          widening the page. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-3 space-y-4" onClick={() => setHeldMessageId(null)}>
        {/* Only once we actually know. Previously this rendered during the first load of every
            conversation, telling the user it was empty before the messages had arrived — which is
            most of what "det tar litt tid før chatten vises" was describing: not the wait itself,
            but the app asserting something false while waiting. */}
        {messages.length === 0 && hasLoaded && (
          <p className="text-[11px] text-neutral-500 px-2">
            No messages yet {isDM ? `with ${activeChannelLabel}` : `in #${activeChannelLabel}`} — say hello.
          </p>
        )}
        {days.map((day, dayIdx) => (
          <div key={dayIdx} className="space-y-3">
            {/* A left-aligned label over a full-width hairline, matching the reference the user
                pointed at. The previous centred pill floated in the middle of the column and read
                as a chip rather than as a break in the conversation — a rule that spans the whole
                width is what actually divides one day from the next. */}
            <div className="pt-1">
              <div className="text-[10px] font-medium text-neutral-500 mb-1.5">{day.label}</div>
              <div className="h-px bg-neutral-800" />
            </div>
            {day.runs.map((run, runIdx) => {
              const first = run.messages[0];
              return (
                <div key={runIdx} className="space-y-0.5">
                  <div
                    className={`group relative flex items-start gap-2 px-2 rounded hover:bg-neutral-900/40 ${heldMessageId === first.id ? 'bg-neutral-900/40' : ''}`}
                    onPointerDown={startMessageLongPress(first.id)}
                    onPointerMove={moveMessageLongPress}
                    onPointerUp={endMessageLongPress}
                    onPointerLeave={endMessageLongPress}
                  >
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
                      {first.quotedBodySnapshot && <QuotedPreview authorName={resolveAuthorName(first.quotedAuthorId)} body={first.quotedBodySnapshot} />}
                      {first.body && <div className="text-[13px] text-neutral-200 break-words leading-snug select-text">{renderChatMessageBody(first.body)}</div>}
                      <AttachmentGrid attachments={first.attachments} />
                      <ReactionBar reactions={first.reactions} currentUserId={currentUserId} onToggle={(emoji) => handleToggleReaction(first.id, emoji)} />
                      {first.threadReplyCount > 0 && (
                        <button
                          onClick={() => setActiveThreadRootId(first.id)}
                          className="mt-0.5 flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                        >
                          <MessagesSquare className="w-3 h-3" />
                          {first.threadReplyCount} {first.threadReplyCount === 1 ? 'reply' : 'replies'}
                        </button>
                      )}
                    </div>
                    <MessageActions
                      isOwn={first.authorId === currentUserId}
                      onReply={() => setReplyTarget({ id: first.id, authorName: first.author?.name ?? 'Unknown', body: first.body })}
                      onDelete={() => handleDelete(first.id)}
                      onOpenThread={() => setActiveThreadRootId(first.id)}
                      onReact={(emoji) => handleToggleReaction(first.id, emoji)}
                      forceVisible={heldMessageId === first.id}
                    />
                  </div>
                  {run.messages.slice(1).map((m) => (
                    <div
                      key={m.id}
                      className={`group relative flex items-start gap-2 px-2 rounded hover:bg-neutral-900/40 ${heldMessageId === m.id ? 'bg-neutral-900/40' : ''}`}
                      onPointerDown={startMessageLongPress(m.id)}
                      onPointerMove={moveMessageLongPress}
                      onPointerUp={endMessageLongPress}
                      onPointerLeave={endMessageLongPress}
                    >
                      <span className="w-7 shrink-0 text-right text-[9px] text-neutral-600 opacity-0 group-hover:opacity-100 transition pt-0.5">
                        {timeLabel(m.createdAt)}
                      </span>
                      <div className="min-w-0 flex-1">
                        {m.quotedBodySnapshot && <QuotedPreview authorName={resolveAuthorName(m.quotedAuthorId)} body={m.quotedBodySnapshot} />}
                        {m.body && <div className="text-[13px] text-neutral-200 break-words leading-snug select-text">{renderChatMessageBody(m.body)}</div>}
                        <AttachmentGrid attachments={m.attachments} />
                        <ReactionBar reactions={m.reactions} currentUserId={currentUserId} onToggle={(emoji) => handleToggleReaction(m.id, emoji)} />
                        {m.threadReplyCount > 0 && (
                          <button
                            onClick={() => setActiveThreadRootId(m.id)}
                            className="mt-0.5 flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            <MessagesSquare className="w-3 h-3" />
                            {m.threadReplyCount} {m.threadReplyCount === 1 ? 'reply' : 'replies'}
                          </button>
                        )}
                      </div>
                      <MessageActions
                        isOwn={m.authorId === currentUserId}
                        onReply={() => setReplyTarget({ id: m.id, authorName: m.author?.name ?? 'Unknown', body: m.body })}
                        onDelete={() => handleDelete(m.id)}
                        onOpenThread={() => setActiveThreadRootId(m.id)}
                        onReact={(emoji) => handleToggleReaction(m.id, emoji)}
                        forceVisible={heldMessageId === m.id}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {typingUsers.length > 0 && (
        <div className="px-1 pt-1 text-[11px] text-neutral-500 italic truncate">
          {typingUsers.length === 1
            ? `${typingUsers[0].name} is typing…`
            : typingUsers.length === 2
              ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`
              : `${typingUsers.length} people are typing…`}
        </div>
      )}

      {replyTarget && (
        <div className="flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-t-xl border border-b-0 border-neutral-800 bg-neutral-900/80">
          <Reply className="w-3 h-3 shrink-0 text-neutral-500" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-400">
            Replying to <span className="text-neutral-300 font-medium">{replyTarget.authorName}</span> — {replyTarget.body}
          </span>
          <button onClick={() => setReplyTarget(null)} title="Cancel reply" className="shrink-0 text-neutral-500 hover:text-neutral-200 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {pendingAttachment && (
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 border border-b-0 border-neutral-800 bg-neutral-900/80 ${
            replyTarget ? '' : 'rounded-t-xl mt-2'
          }`}
        >
          {pendingAttachment.previewUrl ? (
            <img src={pendingAttachment.previewUrl} alt="" className="w-9 h-9 rounded object-cover border border-neutral-700 shrink-0" />
          ) : (
            <span className="w-9 h-9 rounded bg-neutral-800 border border-neutral-700 shrink-0 flex items-center justify-center text-neutral-400">
              <FileText className="w-4 h-4" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-400">
            {pendingAttachment.file.name} <span className="text-neutral-600">· {formatBytes(pendingAttachment.file.size)}</span>
          </span>
          <button onClick={clearPendingAttachment} title="Remove attachment" className="shrink-0 text-neutral-500 hover:text-neutral-200 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {attachmentError && <p className="text-[11px] text-red-400 mt-2 px-1">{attachmentError}</p>}
      <div
        className={`flex items-end gap-2 px-2.5 py-2 border border-neutral-800 bg-neutral-900/60 focus-within:border-blue-500/60 transition ${
          replyTarget || pendingAttachment ? 'rounded-b-xl' : 'rounded-xl mt-2'
        }`}
      >
        <input ref={fileInputRef} type="file" onChange={handleFileInputChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file or image"
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/60 cursor-pointer transition"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={activeChannel ? `Message ${isDM ? activeChannelLabel : `#${activeChannel.name}`}` : 'Message...'}
          rows={1}
          style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
          className="flex-1 bg-transparent text-[13px] text-app-strong placeholder:text-neutral-500 resize-none focus:outline-none py-1 overflow-y-auto"
        />
        <button
          onClick={handleSend}
          disabled={(!draft.trim() && !pendingAttachment) || sending || uploadingAttachment}
          title="Send"
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white cursor-pointer transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Rendered below a message's body whenever it carries image attachments — one per message in v1
// (the composer only ever lets you pick one at a time), but this maps over the array since the
// schema itself is a genuine one-to-many relation, so a future multi-attachment composer needs no
// render-side change. An image attachment renders as a capped thumbnail, click-through to the
// full image in a new tab; a non-image "file" attachment renders as a small card (icon, filename,
// size) that downloads on click instead.
export function AttachmentGrid({ attachments }: { attachments: ChatAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {attachments.map((a) =>
        a.kind === 'file' ? (
          <a
            key={a.id}
            href={a.url}
            download={a.fileName ?? undefined}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 transition max-w-[240px]"
          >
            <span className="w-8 h-8 rounded bg-neutral-800 shrink-0 flex items-center justify-center text-neutral-400">
              <FileText className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-neutral-200 truncate">{a.fileName ?? 'File'}</span>
              {a.byteSize != null && <span className="block text-[10px] text-neutral-500">{formatBytes(a.byteSize)}</span>}
            </span>
            <Download className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          </a>
        ) : (
          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.fileName ?? undefined}>
            <img src={a.url} alt={a.fileName ?? ''} className="max-w-[240px] max-h-[240px] rounded-lg border border-neutral-800 object-cover" />
          </a>
        )
      )}
    </div>
  );
}

// Rendered below a message's body/attachments whenever it carries reactions — server sends flat
// (user, emoji) rows, grouped here by emoji for the pill display (same "server sends raw rows,
// client shapes them" split the day/run grouping above uses for messages themselves). A pill
// shows a highlighted border when the caller is one of the reactors; clicking any pill toggles
// the caller's own reaction with that emoji (adds if absent, removes if present — same click
// re-toggles either direction, no separate remove affordance needed).
export function ReactionBar({
  reactions,
  currentUserId,
  onToggle,
}: {
  reactions: ChatReaction[];
  currentUserId: string | null;
  onToggle: (emoji: string) => void;
}) {
  if (reactions.length === 0) return null;
  const groups = new Map<string, ChatReaction[]>();
  for (const r of reactions) {
    const list = groups.get(r.emoji) ?? [];
    list.push(r);
    groups.set(r.emoji, list);
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {[...groups.entries()].map(([emoji, group]) => {
        const mine = group.some((r) => r.userId === currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            title={group.map((r) => r.user.name).join(', ')}
            className={`text-[11px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 cursor-pointer transition ${
              mine ? 'bg-blue-500/20 border-blue-500/60 text-blue-300' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
            }`}
          >
            <span>{emoji}</span>
            <span>{group.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// Rendered above a message's own body whenever it carries a quote snapshot — deliberately reads
// only quotedBodySnapshot/the resolved author name, never the live quotedMessageId lookup, so it
// keeps showing what was actually quoted even after the original message is hard-deleted
// (quotedMessageId itself goes null then, via onDelete: SetNull; the snapshot columns don't).
export function QuotedPreview({ authorName, body }: { authorName: string; body: string }) {
  return (
    <div className="mb-0.5 pl-2 border-l-2 border-neutral-700 text-[11px] text-neutral-500 truncate">
      <span className="font-medium text-neutral-400">{authorName}</span> {body}
    </div>
  );
}

// Hover-reveal action icons, absolutely positioned over the top-right of a message row (both the
// "first in run" and "rest of run" row shapes use this identically). Delete only shows for the
// caller's own messages — the DELETE route itself also enforces this server-side. "Reply" here is
// the inline quote-reply (Phase 4); "Reply in thread" (Phase 5) is a separate, orthogonal action —
// a message can be both a thread reply and a quote-reply at once, per the roadmap's own "done
// when" bar, so these two intentionally aren't merged into one button.
export function MessageActions({
  isOwn,
  onReply,
  onDelete,
  onOpenThread,
  onReact,
  forceVisible,
}: {
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  // Omitted inside ChatThreadPanel itself — a thread reply can't start a *second*-level thread,
  // the schema has no concept of nesting one.
  onOpenThread?: () => void;
  // Optional — omitted when the caller couldn't resolve its own member profile (see ChatPanel's
  // myProfile), which shouldn't happen in practice but degrades to "no react button" rather than
  // a broken click instead of crashing.
  onReact?: (emoji: string) => void;
  // Mobile has no :hover at all — the caller (ChatPanel/ChatThreadPanel) tracks which message is
  // currently "held" via long-press and passes true for that one message only, standing in for
  // the group-hover CSS that never triggers on touch.
  forceVisible?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`absolute right-1 top-1 items-center gap-0.5 bg-neutral-900 border border-neutral-800 rounded shadow-sm px-0.5 py-0.5 ${
        forceVisible ? 'flex' : 'hidden group-hover:flex'
      }`}
    >
      {onReact && (
        <FloatingPopover
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          align="right"
          panelClassName="bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1 flex gap-0.5"
          anchor={
            <button onClick={() => setPickerOpen((o) => !o)} title="Add reaction" className="p-1 rounded text-neutral-500 hover:text-blue-400 hover:bg-neutral-800 cursor-pointer">
              <SmilePlus className="w-3 h-3" />
            </button>
          }
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReact(emoji);
                setPickerOpen(false);
              }}
              className="w-7 h-7 rounded flex items-center justify-center text-base hover:bg-neutral-800 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </FloatingPopover>
      )}
      {onOpenThread && (
        <button onClick={onOpenThread} title="Reply in thread" className="p-1 rounded text-neutral-500 hover:text-blue-400 hover:bg-neutral-800 cursor-pointer">
          <MessagesSquare className="w-3 h-3" />
        </button>
      )}
      <button onClick={onReply} title="Quote reply" className="p-1 rounded text-neutral-500 hover:text-blue-400 hover:bg-neutral-800 cursor-pointer">
        <Reply className="w-3 h-3" />
      </button>
      {isOwn && (
        <button onClick={onDelete} title="Delete" className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 cursor-pointer">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

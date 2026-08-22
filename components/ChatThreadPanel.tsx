'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Reply, X, MessagesSquare, Paperclip, FileText, UploadCloud } from 'lucide-react';
import { useChatStore, type ChatMessage } from '../store/useChatStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderChatMessageBody } from '../lib/chatFormat';
import { useChatChannelConnection } from '../lib/collab/useChatChannelConnection';
import { uploadChatFile } from '../lib/uploadChatFile';
import { formatBytes } from '../lib/formatBytes';
import { timeLabel, QuotedPreview, MessageActions, AttachmentGrid, ReactionBar, validatePickedFile, type PickedAttachment } from './ChatPanel';
import { useIsMobile } from '../hooks/useIsMobile';

const COMPOSER_MAX_HEIGHT_PX = 120;

// Side panel for one thread's replies, opened by clicking a root message's "N replies" affordance
// or its "Reply in thread" hover action in ChatPanel.tsx — that file's own message-row id doubles
// as the thread id, there's no separate Thread model. Reuses ChatPanel's exported row-level
// helpers (timeLabel/QuotedPreview/MessageActions) rather than duplicating them, so a message
// looks identical whether it's rendered in the main feed or in here.
export default function ChatThreadPanel({
  rootMessage,
  onClose,
  fullWidth = false,
}: {
  rootMessage: ChatMessage;
  onClose: () => void;
  // Mobile: replaces the message list entirely (see app/page.tsx and DirectMessagesPage.tsx)
  // rather than squeezing beside it as a fixed w-80 side panel — the same "cropped on a phone
  // screen" shape the task modal's Comments panel had before it got this same treatment.
  fullWidth?: boolean;
}) {
  const { channelsByWorkspace, dms, threadsByRootId, fetchThread, postThreadReply, deleteMessage, toggleReaction } = useChatStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const isMobile = useIsMobile();
  const [heldReplyId, setHeldReplyId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef({ x: 0, y: 0 });
  const startReplyLongPress = (id: string) => (e: React.PointerEvent) => {
    if (!isMobile) return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => setHeldReplyId(id), 500);
  };
  const moveReplyLongPress = (e: React.PointerEvent) => {
    if (!isMobile || longPressTimerRef.current === null) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const endReplyLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  // Both channel types carry `.members` now — same resolution path ChatPanel uses, no more
  // per-workspace lookup.
  const channel =
    Object.values(channelsByWorkspace).flat().find((c) => c.id === rootMessage.channelId) ?? dms.find((c) => c.id === rootMessage.channelId);
  const membersById = new Map((channel?.members ?? []).map((m) => [m.userId, m.user]));
  const resolveAuthorName = (authorId: string | null) => (authorId ? membersById.get(authorId)?.name ?? 'Someone' : 'Someone');
  const myProfile = currentUserId ? membersById.get(currentUserId) ?? null : null;

  const replies = threadsByRootId[rootMessage.id] || [];
  const [replyTarget, setReplyTarget] = useState<{ id: string; authorName: string; body: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PickedAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);

  useEffect(() => {
    fetchThread(rootMessage.id);
    setReplyTarget(null);
    setDraft('');
    setPendingAttachment(null);
    setAttachmentError(null);
  }, [rootMessage.id, fetchThread]);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    };
  }, [pendingAttachment]);

  // Same channel-wide signal the main feed listens to (a thread reply broadcasts through the
  // channel's own room, not a separate one per thread — see the thread route's own comment) — a
  // second live connection from the same tab is a deliberate, accepted duplication (Hocuspocus
  // rooms are built for many simultaneous connections; sharing one across two sibling components
  // would need real plumbing this app doesn't have anywhere else yet).
  const onRealtimeSignal = useCallback(() => {
    fetchThread(rootMessage.id);
  }, [rootMessage.id, fetchThread]);
  useChatChannelConnection(rootMessage.channelId, onRealtimeSignal);

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
    e.target.value = '';
    if (file) processPickedFile(file);
  };

  const clearPendingAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    setAttachmentError(null);
  };

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
    if ((!trimmed && !pendingAttachment) || sending || uploadingAttachment) return;
    setSending(true);
    try {
      let attachment: { url: string; fileName: string; byteSize: number; kind: 'image' | 'file' } | undefined;
      if (pendingAttachment) {
        setUploadingAttachment(true);
        attachment = await uploadChatFile(pendingAttachment.file);
        setUploadingAttachment(false);
      }
      const sent = await postThreadReply(rootMessage.id, rootMessage.channelId, { body: trimmed, quotedMessageId: replyTarget?.id, attachment });
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
    if (!window.confirm('Delete this reply? This cannot be undone.')) return;
    deleteMessage(rootMessage.channelId, messageId, rootMessage.id);
  };

  // The root lives in messagesByChannel (it's a normal main-feed message with threadReplyCount >
  // 0), replies live in threadsByRootId[rootMessage.id] — toggleReaction needs to know which
  // bucket to patch, same threadRootId convention deleteMessage already uses.
  const handleToggleReaction = (messageId: string, emoji: string) => {
    if (!myProfile) return;
    const isRoot = messageId === rootMessage.id;
    toggleReaction(rootMessage.channelId, messageId, emoji, myProfile, isRoot ? undefined : rootMessage.id);
  };

  return (
    <div
      className={
        fullWidth
          ? 'relative flex flex-col h-full w-full'
          : 'relative flex flex-col h-full w-80 shrink-0 border-l border-neutral-800 pl-3'
      }
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/85 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-1.5 text-blue-400">
            <UploadCloud className="w-6 h-6" />
            <span className="text-xs font-medium">Drop to attach</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300">
          <MessagesSquare className="w-3.5 h-3.5" /> Thread
        </span>
        <button onClick={onClose} title="Close thread" className="text-neutral-500 hover:text-neutral-200 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-2" onClick={() => setHeldReplyId(null)}>
        {/* Root message, compact — same shape as a "rest of run" row in the main feed. */}
        <div className="flex items-start gap-2">
          {rootMessage.author ? (
            <span
              className="w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: rootMessage.author.color }}
            >
              {rootMessage.author.initials}
            </span>
          ) : (
            <span className="w-6 h-6 rounded-full bg-neutral-800 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-200">{rootMessage.author?.name ?? 'Unknown'}</span>
              <span className="text-[9px] text-neutral-500">{timeLabel(rootMessage.createdAt)}</span>
            </div>
            {rootMessage.quotedBodySnapshot && (
              <QuotedPreview authorName={resolveAuthorName(rootMessage.quotedAuthorId)} body={rootMessage.quotedBodySnapshot} />
            )}
            {rootMessage.body && <div className="text-[12px] text-neutral-200 break-words leading-snug select-text">{renderChatMessageBody(rootMessage.body)}</div>}
            <AttachmentGrid attachments={rootMessage.attachments} />
            <ReactionBar reactions={rootMessage.reactions} currentUserId={currentUserId} onToggle={(emoji) => handleToggleReaction(rootMessage.id, emoji)} />
          </div>
        </div>

        <div className="border-t border-neutral-800/80" />

        {replies.length === 0 && <p className="text-[11px] text-neutral-500">No replies yet.</p>}
        {replies.map((r) => (
          <div
            key={r.id}
            className={`group relative flex items-start gap-2 rounded hover:bg-neutral-900/40 py-0.5 ${heldReplyId === r.id ? 'bg-neutral-900/40' : ''}`}
            onPointerDown={startReplyLongPress(r.id)}
            onPointerMove={moveReplyLongPress}
            onPointerUp={endReplyLongPress}
            onPointerLeave={endReplyLongPress}
          >
            {r.author ? (
              <span
                className="w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: r.author.color }}
              >
                {r.author.initials}
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-neutral-800 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold text-neutral-200">
                  {r.author?.name ?? 'Unknown'}
                  {r.authorId === currentUserId ? ' (you)' : ''}
                </span>
                <span className="text-[9px] text-neutral-500">{timeLabel(r.createdAt)}</span>
              </div>
              {r.quotedBodySnapshot && <QuotedPreview authorName={resolveAuthorName(r.quotedAuthorId)} body={r.quotedBodySnapshot} />}
              {r.body && <div className="text-[12px] text-neutral-200 break-words leading-snug select-text">{renderChatMessageBody(r.body)}</div>}
              <AttachmentGrid attachments={r.attachments} />
              <ReactionBar reactions={r.reactions} currentUserId={currentUserId} onToggle={(emoji) => handleToggleReaction(r.id, emoji)} />
            </div>
            <MessageActions
              isOwn={r.authorId === currentUserId}
              onReply={() => setReplyTarget({ id: r.id, authorName: r.author?.name ?? 'Unknown', body: r.body })}
              onDelete={() => handleDelete(r.id)}
              onReact={(emoji) => handleToggleReaction(r.id, emoji)}
              forceVisible={heldReplyId === r.id}
            />
          </div>
        ))}
      </div>

      {replyTarget && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-t-lg border border-b-0 border-neutral-800 bg-neutral-900/80">
          <Reply className="w-3 h-3 shrink-0 text-neutral-500" />
          <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-400">
            Replying to <span className="text-neutral-300 font-medium">{replyTarget.authorName}</span> — {replyTarget.body}
          </span>
          <button onClick={() => setReplyTarget(null)} title="Cancel reply" className="shrink-0 text-neutral-500 hover:text-neutral-200 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {pendingAttachment && (
        <div className={`flex items-center gap-2 px-2 py-1.5 border border-b-0 border-neutral-800 bg-neutral-900/80 ${replyTarget ? '' : 'rounded-t-lg mt-2'}`}>
          {pendingAttachment.previewUrl ? (
            <img src={pendingAttachment.previewUrl} alt="" className="w-8 h-8 rounded object-cover border border-neutral-700 shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded bg-neutral-800 border border-neutral-700 shrink-0 flex items-center justify-center text-neutral-400">
              <FileText className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-400">
            {pendingAttachment.file.name} <span className="text-neutral-600">· {formatBytes(pendingAttachment.file.size)}</span>
          </span>
          <button onClick={clearPendingAttachment} title="Remove attachment" className="shrink-0 text-neutral-500 hover:text-neutral-200 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {attachmentError && <p className="text-[10px] text-red-400 mt-1">{attachmentError}</p>}
      <div
        className={`flex items-end gap-2 px-2 py-1.5 border border-neutral-800 bg-neutral-900/60 focus-within:border-blue-500/60 transition ${
          replyTarget || pendingAttachment ? 'rounded-b-lg' : 'rounded-lg mt-2'
        }`}
      >
        <input ref={fileInputRef} type="file" onChange={handleFileInputChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file or image"
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-neutral-500 hover:text-blue-400 hover:bg-neutral-800/60 cursor-pointer transition"
        >
          <Paperclip className="w-3.5 h-3.5" />
        </button>
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
          placeholder="Reply in thread..."
          rows={1}
          style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
          className="flex-1 bg-transparent text-[12px] text-white placeholder:text-neutral-500 resize-none focus:outline-none py-1 overflow-y-auto"
        />
        <button
          onClick={handleSend}
          disabled={(!draft.trim() && !pendingAttachment) || sending || uploadingAttachment}
          title="Send"
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white cursor-pointer transition"
        >
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

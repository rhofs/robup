'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { MessageSquare, Check, RotateCcw, Trash2 } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import { removeCommentMarkFromDoc } from './commentMarkView';

type DocCommentsPanelProps = {
  editor: Editor;
  docId: string;
  expanded: boolean;
  onToggle: () => void;
  activeCommentId: string | null;
  onActiveCommentHandled: () => void;
};

// Same collapsed-icon-then-expand column shape as DocFormatPanel.tsx, stacked next to it — an
// independent accessory panel belonging to the editor itself, not the page-level Docs navigation
// (that distinction is why this lives in components/collab/ alongside DocFormatPanel rather than
// in app/page.tsx next to DocSubpagesPanel).
export default function DocCommentsPanel({ editor, docId, expanded, onToggle, activeCommentId, onActiveCommentHandled }: DocCommentsPanelProps) {
  const { docComments, users, fetchDocComments, addDocComment, resolveDocComment, deleteDocComment } = useTaskStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetchDocComments(docId);
  }, [docId, fetchDocComments]);

  useEffect(() => {
    if (!activeCommentId || !expanded) return;
    const el = threadRefs.current[activeCommentId];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(onActiveCommentHandled, 1200);
    return () => clearTimeout(t);
  }, [activeCommentId, expanded, onActiveCommentHandled]);

  const all = docComments[docId] || [];
  const roots = all.filter((c) => !c.parentId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const repliesFor = (rootId: string) => all.filter((c) => c.parentId === rootId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        title="Comments"
        className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 cursor-pointer relative"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        {roots.some((r) => !r.resolved) && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />}
      </button>
    );
  }

  return (
    <div className="shrink-0 w-64 border-l border-neutral-800 pl-3">
      <button onClick={onToggle} className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300 mb-2 cursor-pointer">
        <MessageSquare className="w-3 h-3" /> Comments
      </button>
      <div className="space-y-3 max-h-[32em] overflow-y-auto">
        {roots.length === 0 && <p className="text-[11px] text-neutral-500">No comments yet — select text and click Comment.</p>}
        {roots.map((root) => (
          <div
            key={root.id}
            ref={(el) => {
              threadRefs.current[root.id] = el;
            }}
            className={`rounded border p-2 space-y-1.5 transition ${
              activeCommentId === root.id ? 'border-blue-500 bg-blue-500/5' : 'border-neutral-800 bg-neutral-900/40'
            } ${root.resolved ? 'opacity-50' : ''}`}
          >
            {root.quotedText && <p className="text-[10px] text-neutral-500 italic border-l-2 border-neutral-700 pl-1.5 truncate">"{root.quotedText}"</p>}
            <CommentRow body={root.body} authorId={root.authorId} createdAt={root.createdAt} users={users} />
            {repliesFor(root.id).map((reply) => (
              <div key={reply.id} className="pl-3 border-l border-neutral-800">
                <CommentRow body={reply.body} authorId={reply.authorId} createdAt={reply.createdAt} users={users} />
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                onClick={() => {
                  resolveDocComment(docId, root.id, !root.resolved);
                  if (!root.resolved) removeCommentMarkFromDoc(editor, root.markId);
                }}
                className="text-[10px] text-neutral-500 hover:text-blue-400 cursor-pointer flex items-center gap-1"
              >
                {root.resolved ? (
                  <>
                    <RotateCcw className="w-2.5 h-2.5" /> Reopen
                  </>
                ) : (
                  <>
                    <Check className="w-2.5 h-2.5" /> Resolve
                  </>
                )}
              </button>
              <button
                onClick={() => deleteDocComment(docId, root.id)}
                className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-2.5 h-2.5" /> Delete
              </button>
            </div>
            <ReplyInput onSubmit={(body) => addDocComment(docId, { body, markId: root.markId, parentId: root.id })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentRow({
  body,
  authorId,
  createdAt,
  users,
}: {
  body: string;
  authorId: string | null;
  createdAt: string;
  users: { id: string; name: string; initials: string; color: string }[];
}) {
  const author = authorId ? users.find((u) => u.id === authorId) : undefined;
  return (
    <div className="flex items-start gap-1.5">
      {author && (
        <span
          title={author.name}
          className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0 mt-0.5"
          style={{ backgroundColor: author.color }}
        >
          {author.initials}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[10px] text-neutral-500">
          {author?.name ?? 'Unknown'} · {new Date(createdAt).toLocaleDateString()}
        </div>
        <p className="text-[11px] text-neutral-200 break-words">{body}</p>
      </div>
    </div>
  );
}

function ReplyInput({ onSubmit }: { onSubmit: (body: string) => void }) {
  const [value, setValue] = useState('');
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
      }}
      placeholder="Reply..."
      className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500"
    />
  );
}

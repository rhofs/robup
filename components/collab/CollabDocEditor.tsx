'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { HocuspocusProvider } from '@hocuspocus/provider';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import { ClientHeading } from './headingExtension';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import HardBreak from '@tiptap/extension-hard-break';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Placeholder from '@tiptap/extension-placeholder';
import { MessageSquare, Link2, X } from 'lucide-react';
import { ClientMentionNode } from './mentionNodeView';
import { ClientSubpagesIndexNode } from './subpagesIndexNodeView';
import { ClientCommentMark } from './commentMarkView';
import { SlashCommand } from './slashCommandExtension';
import { GapCursor } from './gapCursorExtension';
import PresenceBar from './PresenceBar';
import DocFormatPanel from './DocFormatPanel';
import DocCommentsPanel from './DocCommentsPanel';
import { useTaskStore } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { MentionKind } from '../../lib/mentions';

type CollabDocEditorProps = {
  docId: string;
  // Only Space-scoped standalone docs belong to a doc "book" that can grow subpages — omitted at
  // the task-modal Documents-panel call site (task-scoped docs), which simply never shows the
  // slash menu's "New Subpage" item as a result (see slashCommandSuggestion.ts).
  spaceId?: string;
  className?: string;
  placeholder?: string;
  onJump: (kind: MentionKind, id: string) => void;
  // Fired on this editor instance's own focus/blur — used to log one activity-feed entry per
  // edit session, same "one entry per session, not per keystroke" shape the old shared-textarea
  // blur handler had, just scoped to this browser tab's own connection instead of a shared field
  // (see app/page.tsx's commitDocEditActivity for the task-scoped-doc logging that consumes this).
  onEditorFocus?: () => void;
  onEditorBlur?: (text: string) => void;
};

// Rendered only client-side (see the next/dynamic({ssr:false}) wrapper at both app/page.tsx call
// sites) — a HocuspocusProvider needs `window.location` and a real WebSocket, neither available
// during SSR. Replaces the old duplicated <textarea>+Notion-toggle blocks (task-modal Documents
// panel and the standalone Docs-tab editor) with one shared, genuinely live editor.
export default function CollabDocEditor({
  docId,
  spaceId,
  className,
  placeholder,
  onJump,
  onEditorFocus,
  onEditorBlur,
}: CollabDocEditorProps) {
  const users = useTaskStore((s) => s.users);
  const addDocComment = useTaskStore((s) => s.addDocComment);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const currentUser = users.find((u) => u.id === currentUserId);

  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [imageUrlDraft, setImageUrlDraft] = useState<string | null>(null);

  // Provider lifecycle lives in an effect, not useMemo — its constructor opens a real WebSocket,
  // a side effect that isn't safe inside useMemo (React's dev-mode Strict Mode double-invokes
  // useMemo factories to catch exactly this class of impurity, which silently opened two live
  // connections and orphaned one — edits went into a Y.Doc whose connection had already been
  // discarded, so they never reached the server and the debounced persist never fired).
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    const p = new HocuspocusProvider({
      url: `ws://${window.location.hostname}:1234`,
      name: docId,
    });
    setProvider(p);
    return () => {
      p.destroy();
    };
  }, [docId]);

  const editor = useEditor(
    {
      extensions: provider
        ? [
            Document,
            Paragraph,
            Text,
            Bold,
            Italic,
            ClientHeading.configure({ levels: [1, 2] }),
            BulletList,
            OrderedList,
            ListItem,
            HardBreak,
            Underline,
            Strike,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Link.configure({ openOnClick: false }),
            TextStyle,
            Color,
            FontFamily,
            FontSize,
            Highlight.configure({ multicolor: true }),
            Image,
            GapCursor,
            ClientMentionNode.configure({ onJump }),
            ClientSubpagesIndexNode.configure({ onOpenDoc: (id: string) => onJump('doc', id) }),
            ClientCommentMark.configure({
              onCommentClick: (commentId: string) => {
                setActiveCommentId(commentId);
                setCommentsExpanded(true);
              },
            }),
            SlashCommand.configure({ spaceId, docId, onRequestImage: () => setImageUrlDraft('') }),
            Placeholder.configure({ placeholder: placeholder ?? 'Write notes, specs, anything...' }),
            Collaboration.configure({ document: provider.document }),
            CollaborationCaret.configure({
              provider,
              user: { name: currentUser?.name ?? 'Anonym', color: currentUser?.color ?? '#6366F1' },
            }),
          ]
        : [Document, Paragraph, Text],
      editable: !!provider,
      onFocus: () => onEditorFocus?.(),
      onBlur: ({ editor: e }) => onEditorBlur?.(e.getText()),
      immediatelyRender: false,
    },
    [docId, provider, spaceId]
  );

  const submitComment = () => {
    if (!editor || !commentDraft?.trim()) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      setCommentDraft(null);
      return;
    }
    const markId = crypto.randomUUID();
    const quotedText = editor.state.doc.textBetween(from, to, ' ');
    editor.chain().setTextSelection({ from, to }).setMark('comment', { commentId: markId }).run();
    addDocComment(docId, { body: commentDraft.trim(), markId, quotedText });
    setCommentDraft(null);
    setCommentsExpanded(true);
  };

  const submitLink = () => {
    if (!editor) return;
    const url = linkDraft?.trim();
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkDraft(null);
  };

  const submitImage = () => {
    if (!editor) return;
    const url = imageUrlDraft?.trim();
    // A bare `setImage()` can leave the image as the very last node in the doc with nothing
    // after it — Gapcursor technically still lets you click into that trailing gap, but it's a
    // thin, easy-to-miss target (reported as "can't place the cursor above/below a pasted
    // image"). Explicitly inserting a following empty paragraph and landing the cursor in it
    // guarantees a normal, full-width line is always there to keep typing on immediately.
    if (url) {
      editor
        .chain()
        .focus()
        .insertContent([{ type: 'image', attrs: { src: url } }, { type: 'paragraph' }])
        .run();
    }
    setImageUrlDraft(null);
  };

  return (
    <div className={`flex items-start gap-3 ${className ?? ''}`}>
      <div className="flex-1 min-w-0">
        {provider && <PresenceBar provider={provider} />}
        {editor && (
          <BubbleMenu editor={editor} shouldShow={({ from, to }) => from !== to}>
            {commentDraft === null && linkDraft === null ? (
              <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-700 rounded shadow-xl p-1">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCommentDraft('')}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-neutral-200 hover:bg-neutral-800 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Comment
                </button>
                <div className="w-px h-4 bg-neutral-700" />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setLinkDraft(editor.getAttributes('link').href ?? '')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer ${
                    editor.isActive('link') ? 'text-blue-400 bg-neutral-800' : 'text-neutral-200 hover:bg-neutral-800'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" /> Link
                </button>
              </div>
            ) : commentDraft !== null ? (
              <div className="w-56 bg-neutral-900 border border-neutral-700 rounded shadow-xl p-2 space-y-1.5">
                <textarea
                  autoFocus
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                    if (e.key === 'Escape') setCommentDraft(null);
                  }}
                  placeholder="Add a comment..."
                  rows={2}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500 resize-none"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCommentDraft(null)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-300 cursor-pointer px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={submitComment}
                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 cursor-pointer"
                  >
                    Comment
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-64 bg-neutral-900 border border-neutral-700 rounded shadow-xl p-2 space-y-1.5">
                <input
                  autoFocus
                  value={linkDraft ?? ''}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitLink();
                    }
                    if (e.key === 'Escape') setLinkDraft(null);
                  }}
                  placeholder="https://..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-end gap-1.5">
                  {editor.isActive('link') && (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().extendMarkRange('link').unsetLink().run();
                        setLinkDraft(null);
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer px-2 py-1 mr-auto"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setLinkDraft(null)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-300 cursor-pointer px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={submitLink}
                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </BubbleMenu>
        )}
        <div className="collab-doc-editor mt-1.5">
          <EditorContent editor={editor} />
        </div>
      </div>
      {editor && <DocFormatPanel editor={editor} />}
      {editor && (
        <DocCommentsPanel
          editor={editor}
          docId={docId}
          expanded={commentsExpanded}
          onToggle={() => setCommentsExpanded((v) => !v)}
          activeCommentId={activeCommentId}
          onActiveCommentHandled={() => setActiveCommentId(null)}
        />
      )}
      {imageUrlDraft !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs"
          onClick={() => setImageUrlDraft(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Insert Image</h3>
              <button onClick={() => setImageUrlDraft(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input
                autoFocus
                value={imageUrlDraft}
                onChange={(e) => setImageUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitImage();
                  if (e.key === 'Escape') setImageUrlDraft(null);
                }}
                placeholder="Paste an image URL..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button onClick={submitImage} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

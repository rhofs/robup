'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { collabWsUrl } from '../../lib/collab/collabWsUrl';
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
import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Placeholder from '@tiptap/extension-placeholder';
import { MessageSquare, Link2, X, Upload } from 'lucide-react';
import { ClientMentionNode } from './mentionNodeView';
import { ClientSubpagesIndexNode } from './subpagesIndexNodeView';
import { ClientCommentMark } from './commentMarkView';
import { ClientFileAttachmentNode } from './fileAttachmentView';
import { SlashCommand } from './slashCommandExtension';
import { ClientTaskListEmbedNode } from './taskListEmbedView';
import DocBlockGutter from './DocBlockGutter';
import { celebrateCheck } from './celebrateCheck';
import { docSchemaToken } from '../../lib/collab/schema';
import { GapCursor } from './gapCursorExtension';
import PresenceBar from './PresenceBar';
import DocFormatPanel from './DocFormatPanel';
import DocCommentsPanel from './DocCommentsPanel';
import { useTaskStore, type TaskDoc } from '../../store/useTaskStore';
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
  // Right-click menu for a subpage listed in an in-content Subpages table — same handler the
  // sidebar's own Doc rows already use (rename/appearance/color/delete). Omitted at the task-modal
  // Documents-panel call site (task-scoped docs have no Space to scope that menu to anyway).
  onDocContextMenu?: (e: React.MouseEvent, doc: TaskDoc) => void;
  // Fired on this editor instance's own focus/blur — used to log one activity-feed entry per
  // edit session, same "one entry per session, not per keystroke" shape the old shared-textarea
  // blur handler had, just scoped to this browser tab's own connection instead of a shared field
  // (see app/page.tsx's commitDocEditActivity for the task-scoped-doc logging that consumes this).
  onEditorFocus?: () => void;
  onEditorBlur?: (text: string) => void;
  // Reading, not editing: no caret, no selection toolbar, no format or comments panel — the Wiki's
  // book view, and every wiki page for someone who is not a wiki editor. The collab server also
  // opens such a connection read-only, so this is the look, not the lock.
  readOnly?: boolean;
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
  onDocContextMenu,
  onEditorFocus,
  onEditorBlur,
  readOnly = false,
}: CollabDocEditorProps) {
  const users = useTaskStore((s) => s.users);
  const addDocComment = useTaskStore((s) => s.addDocComment);
  const workspaces = useTaskStore((s) => s.workspaces);
  const updateSpaceDoc = useTaskStore((s) => s.updateSpaceDoc);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const currentUser = users.find((u) => u.id === currentUserId);

  // Page-level settings (cover/subtitle/width/last-edited toggle) only ever apply to a real
  // Space-scoped Doc — undefined at the task-modal Documents-panel call site (no spaceId there),
  // which is exactly when DocFormatPanel should skip rendering that section entirely.
  const doc = useMemo(
    () =>
      spaceId
        ? workspaces.flatMap((w) => w.spaces).find((s) => s.id === spaceId)?.spaceDocs.find((d) => d.id === docId)
        : undefined,
    [workspaces, spaceId, docId]
  );

  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [imageUrlDraft, setImageUrlDraft] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Filled after every render with the current uploadAndInsert (below) — the editor's drop/paste
  // handlers are fixed when it is built and call through this.
  const uploadAndInsertRef = useRef<(files: File[], at?: number) => Promise<void>>(async () => {});

  // Provider lifecycle lives in an effect, not useMemo — its constructor opens a real WebSocket,
  // a side effect that isn't safe inside useMemo (React's dev-mode Strict Mode double-invokes
  // useMemo factories to catch exactly this class of impurity, which silently opened two live
  // connections and orphaned one — edits went into a Y.Doc whose connection had already been
  // discarded, so they never reached the server and the debounced persist never fired).
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  // Real connection state, not a guess — production currently has no TLS termination in front of
  // the collab port at all (see collabWsUrl.ts's own top comment), so every edit here silently
  // never reaches the server: nothing is actually saved, it only exists in this tab's in-memory
  // Y.Doc until the component unmounts. 'disconnected' specifically (not 'connecting', which is
  // the normal brief state on first load) drives a visible warning below rather than losing
  // someone's work with zero indication anything was wrong.
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  // Turned away by the collab server for running older code than it (see DOC_SCHEMA_VERSION): this
  // tab could delete blocks it does not know, so it is not let in until it reloads.
  const [outdated, setOutdated] = useState(false);
  const [editorBox, setEditorBox] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setWsStatus('connecting');
    setOutdated(false);
    const p = new HocuspocusProvider({
      url: collabWsUrl(),
      name: docId,
      token: docSchemaToken(),
      onStatus: ({ status }) => setWsStatus(status),
      onAuthenticationFailed: ({ reason }) => {
        if (reason === 'outdated-client') setOutdated(true);
      },
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
            ClientHeading.configure({ levels: [1, 2, 3] }),
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
            CodeBlock,
            Blockquote,
            HorizontalRule,
            TaskList,
            TaskItem.configure({ nested: true }),
            ClientTaskListEmbedNode.configure({ onOpenTask: (id: string) => onJump('task', id), spaceId }),
            GapCursor,
            ClientMentionNode.configure({ onJump }),
            ClientFileAttachmentNode,
            ClientSubpagesIndexNode.configure({ onOpenDoc: (id: string) => onJump('doc', id), onContextMenu: onDocContextMenu }),
            ClientCommentMark.configure({
              onCommentClick: (commentId: string) => {
                setActiveCommentId(commentId);
                setCommentsExpanded(true);
              },
            }),
            SlashCommand.configure({
              spaceId,
              docId,
              onRequestImage: () => {
                setImageUploadError(null);
                setImageUrlDraft('');
              },
              onRequestFile: () => fileInputRef.current?.click(),
            }),
            Placeholder.configure({ placeholder: placeholder ?? 'Write notes, specs, anything...' }),
            Collaboration.configure({ document: provider.document }),
            CollaborationCaret.configure({
              provider,
              user: { name: currentUser?.name ?? 'Anonym', color: currentUser?.color ?? '#6366F1' },
            }),
          ]
        : [Document, Paragraph, Text],
      editable: !!provider && !readOnly,
      onFocus: () => onEditorFocus?.(),
      onBlur: ({ editor: e }) => onEditorBlur?.(e.getText()),
      immediatelyRender: false,
      editorProps: {
        // Files dropped or pasted into the doc are uploaded and placed where they landed: images as
        // images, anything else as a file chip. Through a ref, because these handlers are fixed when
        // the editor is built while the upload function belongs to the current render.
        handleDrop: (view, event, _slice, moved) => {
          const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
          if (moved || files.length === 0 || !view.editable) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY });
          void uploadAndInsertRef.current(files, at?.pos);
          return true;
        },
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (files.length === 0 || !view.editable) return false;
          event.preventDefault();
          void uploadAndInsertRef.current(files);
          return true;
        },
      },
    },
    [docId, provider, spaceId]
  );

  // Links open in a new tab: always while reading (the Wiki, or a page you cannot edit), and with
  // Ctrl/⌘ held while editing — a plain click there has to stay free for putting the caret inside the
  // link's text to change it. Tiptap's own openOnClick is configured once when the editor is built,
  // and this editor switches between reading and editing without being rebuilt, so the rule lives
  // here instead. Only web, mail and phone links: anything else in an href is not followed.
  const openLinkOnClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const reading = readOnly || !editor?.isEditable;
    if (!reading && !(e.metaKey || e.ctrlKey)) return;
    const href = a.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  // A checklist item ticked by this person gets its dust and nudge (celebrateCheck). Listened for on
  // the editor's box, because the checkbox belongs to Tiptap's own TaskItem view, which fires a plain
  // `change` and nothing else. Unticking gets no fanfare.
  useEffect(() => {
    if (!editorBox) return;
    const onChange = (e: Event) => {
      const box = e.target;
      if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox' || !box.checked) return;
      const item = box.closest('li[data-checked]');
      if (item instanceof HTMLElement && editor?.isEditable) celebrateCheck(box, item);
    };
    editorBox.addEventListener('change', onChange);
    return () => editorBox.removeEventListener('change', onChange);
  }, [editorBox, editor]);

  // useEditor only reads `editable` when it builds the editor; switching the wiki between reading and
  // editing must not rebuild it (that would reconnect and flash), so the flag is applied here.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!!provider && !readOnly);
  }, [editor, provider, readOnly]);

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

  // A bare `setImage()` can leave the image as the very last node in the doc with nothing after
  // it — Gapcursor technically still lets you click into that trailing gap, but it's a thin,
  // easy-to-miss target (reported as "can't place the cursor above/below a pasted image").
  // Explicitly inserting a following empty paragraph and landing the cursor in it guarantees a
  // normal, full-width line is always there to keep typing on immediately. Shared by both the
  // pasted-URL path and the uploaded-file path below.
  const insertImageAtCursor = (url: string) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent([{ type: 'image', attrs: { src: url } }, { type: 'paragraph' }])
      .run();
  };

  // Uploads files (from /file, a drop or a paste) and puts each where the caret — or the drop — was.
  // Images become images, as the image modal already makes them; everything else a file chip that
  // keeps the name it was uploaded with. One at a time, in order, so several dropped files land in
  // the order they were picked.
  const uploadAndInsert = async (files: File[], at?: number) => {
    if (!editor) return;
    setFileUploadError(null);
    setFileUploading(true);
    try {
      if (typeof at === 'number') editor.chain().focus().setTextSelection(at).run();
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('context', 'docs');
        const res = await fetch('/api/uploads/image', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${file.name}: ${data.error || 'upload failed'}`);
        if (data.kind === 'image') {
          insertImageAtCursor(data.url);
        } else {
          editor
            .chain()
            .focus()
            .insertContent([
              { type: 'fileAttachment', attrs: { url: data.url, name: file.name, size: file.size, mime: file.type || null } },
              { type: 'text', text: ' ' },
            ])
            .run();
        }
      }
    } catch (err) {
      setFileUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  useEffect(() => {
    uploadAndInsertRef.current = uploadAndInsert;
  });


  const submitImage = () => {
    const url = imageUrlDraft?.trim();
    if (url) insertImageAtCursor(url);
    setImageUrlDraft(null);
  };

  const closeImageModal = () => {
    if (imageUploading) return;
    setImageUrlDraft(null);
    setImageUploadError(null);
  };

  const submitImageFile = async (file: File) => {
    setImageUploadError(null);
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads/image', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      insertImageAtCursor(data.url);
      setImageUrlDraft(null);
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setImageUploading(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  };

  return (
    <div className={`flex items-start gap-3 ${className ?? ''}`}>
      <div className="flex-1 min-w-0">
        {outdated ? (
          <div className="mb-2 px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-[12px] flex items-center gap-2">
            <span className="flex-1">Siqt has been updated. Reload to keep editing this doc.</span>
            <button onClick={() => window.location.reload()} className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-500 text-white text-[12px] font-semibold cursor-pointer">
              Reload
            </button>
          </div>
        ) : wsStatus === 'disconnected' && (
          <div className="mb-2 px-2.5 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            Not connected — changes here aren&apos;t being saved right now. Copy your text somewhere safe before leaving this page.
          </div>
        )}
        {provider && <PresenceBar provider={provider} />}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void uploadAndInsert(files);
          }}
        />
        {(fileUploading || fileUploadError) && (
          <div
            className={`mb-2 px-2.5 py-1.5 rounded border text-[11px] flex items-center gap-1.5 ${
              fileUploadError ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-neutral-700 bg-neutral-800/50 text-neutral-300'
            }`}
          >
            {fileUploadError ? (
              <>
                <span className="flex-1">{fileUploadError}</span>
                <button onClick={() => setFileUploadError(null)} className="cursor-pointer text-red-300 hover:text-red-200">
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              'Uploading…'
            )}
          </div>
        )}
        {editor && !readOnly && (
          <BubbleMenu editor={editor} shouldShow={({ from, to }) => from !== to}>
            {commentDraft === null && linkDraft === null ? (
              <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-1">
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
              <div className="w-56 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-2 space-y-1.5">
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-[11px] text-app-strong focus:outline-none focus:border-blue-500 resize-none"
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
              <div className="w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-2 space-y-1.5">
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-[11px] text-app-strong focus:outline-none focus:border-blue-500"
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
        <div ref={setEditorBox} className="collab-doc-editor mt-1.5" onClick={openLinkOnClick}>
          <EditorContent editor={editor} />
        </div>
        {editor && !readOnly && <DocBlockGutter editor={editor} container={editorBox} />}
      </div>
      {editor && !readOnly && (
        <DocFormatPanel
          editor={editor}
          doc={doc}
          onUpdateDoc={doc && spaceId ? (patch) => updateSpaceDoc(docId, spaceId, patch) : undefined}
        />
      )}
      {editor && !readOnly && (
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 backdrop-blur-xs"
          onClick={closeImageModal}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-app-strong">Insert Image</h3>
              <button onClick={closeImageModal} className="text-neutral-400 hover:text-app-strong cursor-pointer">
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
                  if (e.key === 'Escape') closeImageModal();
                }}
                placeholder="Paste an image URL..."
                disabled={imageUploading}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button
                onClick={submitImage}
                disabled={imageUploading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                Insert
              </button>

              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                <div className="flex-1 h-px bg-neutral-800" />
                or
                <div className="flex-1 h-px bg-neutral-800" />
              </div>

              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) submitImageFile(file);
                }}
              />
              <button
                onClick={() => imageFileInputRef.current?.click()}
                disabled={imageUploading}
                className="w-full flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs py-2 rounded font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                <Upload className="w-3.5 h-3.5" />
                {imageUploading ? 'Uploading...' : 'Upload from your computer'}
              </button>
              {imageUploadError && <p className="text-[10px] text-red-400">{imageUploadError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

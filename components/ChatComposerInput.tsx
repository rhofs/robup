'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Placeholder from '@tiptap/extension-placeholder';
import { ClientMentionNode } from './collab/mentionNodeView';
import { ChatHashMention, chatAtSuggestion } from './collab/chatMentionNode';
import { chatDocToText, chatTextToDoc } from '../lib/collab/chatDoc';
import { runMentionJump } from '../lib/mentionJump';
import type { GroupMentionScope } from '../lib/mentionOptions';

// The chat composer, as a real editor rather than a <textarea>.
//
// A textarea holds a string and draws that string — there is no markup inside it, so a mention could
// only ever appear as its raw `@[Label](task:uuid)` token while you typed. That is tolerable in a
// comment box, which is written once and forgotten, and not in the surface people type in all day.
//
// What it is NOT: a document editor. Document, Paragraph, Text, HardBreak and the mention node, and
// nothing else — no bold, no lists, no headings. Chat messages are plain text with mentions in them,
// and every extension added here is a key binding that has to be reasoned about against Enter-to-send.
export default function ChatComposerInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  getWorkspaceId,
  getGroupMentions,
  maxHeight,
  insertRef,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  placeholder: string;
  getWorkspaceId: () => string | null;
  // Which of @everyone / roles this conversation offers — see lib/chatMentionScope.ts.
  getGroupMentions?: () => GroupMentionScope | null;
  maxHeight: number;
  // Filled with a function that inserts text at the caret, for callers that put characters in from
  // outside the keyboard (the emoji picker). Going through the editor rather than through `value`
  // is what keeps the caret where it was — appending to the string would land every emoji at the
  // end of the message no matter where you were typing.
  insertRef?: React.MutableRefObject<((text: string) => void) | null>;
}) {
  // Read through a ref by the two options below. `useEditor` runs its extension list ONCE, so
  // anything passed by value there is frozen at whatever the first conversation was — which is
  // exactly what happened to the placeholder: every conversation said "Message <the first person you
  // opened>". The workspace getter was written this way from the start for the same reason; the
  // placeholder was not, and it is the same mistake one prop along.
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  // The getters go through refs too. "A getter, not a value" was the intent, but the getter handed to
  // the extensions was itself the one from the first render — a closure over that render's
  // conversation — so every later DM was still scoped to the first. Each render now replaces what the
  // ref points at, and the extensions call through it.
  const getWorkspaceIdRef = useRef(getWorkspaceId);
  getWorkspaceIdRef.current = getWorkspaceId;
  const getGroupMentionsRef = useRef(getGroupMentions);
  getGroupMentionsRef.current = getGroupMentions;
  const scopedWorkspaceId = () => getWorkspaceIdRef.current();
  const scopedGroups = () => getGroupMentionsRef.current?.() ?? null;

  const editor = useEditor({
    // Required by Tiptap in React 18+ SSR: without it the first client render can differ from the
    // server's and React discards the editor's DOM.
    immediatelyRender: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      // The doc editor's own mention node, handed scoped items and its own plugin key. Same node,
      // same renderer, same chip — only what it offers differs.
      ClientMentionNode.configure({ onJump: runMentionJump, suggestion: chatAtSuggestion(scopedWorkspaceId, scopedGroups) }),
      ChatHashMention.configure({ getWorkspaceId: scopedWorkspaceId }),
    ],
    content: chatTextToDoc(value),
    editorProps: {
      attributes: {
        class: 'outline-none text-[15px] md:text-[13px] text-app-strong py-1',
      },
      handleKeyDown: (_view, event) => {
        // Enter sends, Shift+Enter breaks the line — the convention this composer already had, and
        // the reason the extension list above is as short as it is. Returning false while a
        // suggestion dropdown is open would be wrong, but @tiptap/suggestion's own plugin sees the
        // event first and swallows it, so by the time this runs there is no dropdown.
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(chatDocToText(e.getJSON())),
  });

  useEffect(() => {
    if (!insertRef) return;
    insertRef.current = editor ? (text: string) => editor.chain().focus().insertContent(text).run() : null;
    return () => {
      insertRef.current = null;
    };
  }, [editor, insertRef]);

  // Reset when the caller clears or replaces the draft — sending a message, or switching
  // conversation. Guarded against echoing the editor's own updates back into it, which would move
  // the caret to the end on every keystroke.
  useEffect(() => {
    if (!editor) return;
    if (chatDocToText(editor.getJSON()) === value) return;
    editor.commands.setContent(chatTextToDoc(value), { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className="chat-composer flex-1 min-w-0 overflow-y-auto" style={{ maxHeight }}>
      <EditorContent editor={editor} />
    </div>
  );
}

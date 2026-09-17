'use client';

import { useEffect } from 'react';
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
  maxHeight,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  placeholder: string;
  getWorkspaceId: () => string | null;
  maxHeight: number;
}) {
  const editor = useEditor({
    // Required by Tiptap in React 18+ SSR: without it the first client render can differ from the
    // server's and React discards the editor's DOM.
    immediatelyRender: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder }),
      // The doc editor's own mention node, handed scoped items and its own plugin key. Same node,
      // same renderer, same chip — only what it offers differs.
      ClientMentionNode.configure({ onJump: runMentionJump, suggestion: chatAtSuggestion(getWorkspaceId) }),
      ChatHashMention.configure({ getWorkspaceId }),
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

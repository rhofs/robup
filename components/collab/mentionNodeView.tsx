'use client';

import { ReactNodeViewRenderer } from '@tiptap/react';
import { Suggestion } from '@tiptap/suggestion';
import { MentionNode } from '../../lib/collab/mentionNode';
import MentionChip from './MentionChip';
import { mentionSuggestionOptions, type MentionSuggestionExtensionOptions } from './mentionSuggestion';
import type { MentionKind } from '../../lib/mentions';

// Client-only extension of the shared, framework-agnostic MentionNode (lib/collab/mentionNode.ts,
// also used server-side for schema/migration) — adds the React chip rendering and the `@`
// autocomplete plugin, neither of which the server needs. Kept as a separate file so
// lib/collab/mentionNode.ts stays importable from server/collabServer.ts without pulling in React.
export const ClientMentionNode = MentionNode.extend<MentionSuggestionExtensionOptions>({
  addOptions() {
    return {
      onJump: undefined as ((kind: MentionKind, id: string) => void) | undefined,
      suggestion: {},
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionChip);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '@',
        ...mentionSuggestionOptions,
        ...this.options.suggestion,
      }),
    ];
  },
});

'use client';

import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { buildMentionOptions } from '../../lib/mentionOptions';
import { useTaskStore } from '../../store/useTaskStore';
import { mentionSuggestionOptions, type MentionSuggestionItem } from './mentionSuggestion';

// The chat composer's mention triggers.
//
// Deliberately NOT a second copy of the doc editor's mention plugin. An earlier version of this file
// rebuilt the whole suggestion setup — its own renderer, its own command, its own plugin wiring —
// and `@` then did not fire at all, with nothing in the build or the typecheck to say why. Rather
// than keep guessing at the difference, this reuses `mentionSuggestionOptions` verbatim: the exact
// object the doc editor's working `@` runs on. Only the two things that genuinely differ here are
// overridden — which trigger character, and which items it offers.
//
// The node itself is ClientMentionNode (components/collab/mentionNodeView.tsx), unchanged and shared.
// There is one mention node in this app and there should stay one.

function scopedItems(char: '@' | '#', getWorkspaceId: () => string | null) {
  return ({ query }: { query: string }): MentionSuggestionItem[] => {
    const { tasks, users, workspaces } = useTaskStore.getState();
    return buildMentionOptions({
      query,
      sigil: char,
      workspaceId: getWorkspaceId(),
      tasks,
      users,
      workspaces,
    });
  };
}

export type ChatMentionTriggerOptions = {
  // A getter, not a value: this extension is configured once when the editor is created, while the
  // conversation — and so the workspace — changes underneath it every time a different DM is opened.
  getWorkspaceId: () => string | null;
};

// '#' as a task-only shortcut. Its own Extension rather than a second plugin inside the node,
// because @tiptap/suggestion defaults every plugin to the same PluginKey and ProseMirror throws on a
// duplicate — a throw during editor construction, which takes down the whole React tree. Separate
// extensions with explicit keys make that impossible to reintroduce by accident.
export const ChatHashMention = Extension.create<ChatMentionTriggerOptions>({
  name: 'chatHashMention',

  addOptions() {
    return { getWorkspaceId: () => null };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionSuggestionItem>({
        ...mentionSuggestionOptions,
        pluginKey: new PluginKey('chatMentionHash'),
        editor: this.editor,
        char: '#',
        items: scopedItems('#', this.options.getWorkspaceId),
      }),
    ];
  },
});

// The '@' side is the doc editor's own node, handed scoped items and its own key through the
// `suggestion` override it already supports.
export function chatAtSuggestion(getWorkspaceId: () => string | null) {
  return {
    pluginKey: new PluginKey('chatMentionAt'),
    items: scopedItems('@', getWorkspaceId),
  };
}

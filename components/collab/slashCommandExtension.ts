'use client';

import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { createSlashCommandSuggestion } from './slashCommandSuggestion';

// @tiptap/suggestion defaults to an unkeyed (implicitly same-named) plugin when no pluginKey is
// given — harmless with only one Suggestion instance on the editor (the existing '@' mention
// plugin), but crashes with "Adding different instances of a keyed plugin" once a second one
// (this '/' menu) registers alongside it. Needs its own distinct key.
const slashCommandPluginKey = new PluginKey('slashCommand');

export type SlashCommandOptions = {
  spaceId?: string;
  docId: string;
};

// No persistent Node needed — every command runs editor operations immediately (or, for New
// Subpage, inserts the *existing* mention node) rather than leaving its own node type behind, so
// this is a plain Extension registering its own '/'-triggered Suggestion plugin, coexisting
// alongside the '@' mention plugin registered by ClientMentionNode (mentionNodeView.tsx).
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { spaceId: undefined, docId: '' };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        pluginKey: slashCommandPluginKey,
        ...createSlashCommandSuggestion(this.options),
      }),
    ];
  },
});

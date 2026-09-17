'use client';

import { ReactNodeViewRenderer } from '@tiptap/react';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { MentionNode } from '../../lib/collab/mentionNode';
import { buildMentionOptions } from '../../lib/mentionOptions';
import { useTaskStore } from '../../store/useTaskStore';
import MentionChip from './MentionChip';
import MentionSuggestionList, { type MentionSuggestionListRef } from './MentionSuggestionList';
import type { MentionSuggestionItem } from './mentionSuggestion';
import type { MentionKind } from '../../lib/mentions';

// The chat composer's own mention node.
//
// Separate from ClientMentionNode (the doc editor's) for two reasons that are not cosmetic: it needs
// TWO suggestion plugins rather than one — '@' for everything and '#' for tasks — and it needs to be
// scoped to a workspace, which a doc never is because a doc is already inside one.
//
// The store is read through getState() rather than the hook: this runs inside a ProseMirror plugin,
// not a React render, so there is nothing subscribed to re-render.
export type ChatMentionOptions = {
  onJump?: (kind: MentionKind, id: string) => void;
  // Read through a getter, not passed by value. The extension is configured once when the editor is
  // created, while the conversation — and therefore the workspace — changes underneath it every time
  // you open a different DM. A captured value would scope every later mention to whichever
  // conversation happened to be open when the editor was built.
  getWorkspaceId: () => string | null;
};

function renderer(): SuggestionOptions<MentionSuggestionItem>['render'] {
  return () => {
    let component: ReactRenderer<MentionSuggestionListRef, any>;
    let unmount: (() => void) | undefined;
    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionSuggestionList, { props, editor: props.editor });
        unmount = props.mount(component.element as HTMLElement);
      },
      onUpdate: (props) => component.updateProps(props),
      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          unmount?.();
          return true;
        }
        return component.ref?.onKeyDown({ event: props.event }) ?? false;
      },
      onExit: () => {
        unmount?.();
        component.destroy();
      },
    };
  };
}

export const ChatMentionNode = MentionNode.extend<ChatMentionOptions>({
  name: 'mention',

  addOptions() {
    return {
      onJump: undefined,
      getWorkspaceId: () => null,
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionChip);
  },

  addProseMirrorPlugins() {
    const options = this.options;
    // A DISTINCT PluginKey per trigger, and this is not optional: @tiptap/suggestion defaults every
    // plugin it builds to the same `new PluginKey("suggestion")`, and ProseMirror throws
    // "Adding different instances of a keyed plugin" the moment a second one with that key is added.
    // That throw happens while the editor is being constructed, so it takes down the whole React
    // tree rather than degrading — the app rendered the WebView's own "This page couldn't load"
    // screen on opening any conversation.
    const make = (char: '@' | '#') =>
      Suggestion<MentionSuggestionItem>({
        pluginKey: new PluginKey(`chatMention${char}`),
        editor: this.editor,
        char,
        items: ({ query }) => {
          const { tasks, users, workspaces } = useTaskStore.getState();
          return buildMentionOptions({
            query,
            sigil: char,
            workspaceId: options.getWorkspaceId(),
            tasks,
            users,
            workspaces,
          });
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, { type: 'mention', attrs: { kind: props.kind, id: props.id, label: props.label } })
            .insertContent(' ')
            .run();
        },
        render: renderer(),
      });
    return [make('@'), make('#')];
  },
});

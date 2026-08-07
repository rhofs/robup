'use client';

import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { useTaskStore } from '../../store/useTaskStore';
import { scoreMatch } from '../../lib/search';
import type { MentionKind } from '../../lib/mentions';
import MentionSuggestionList, { type MentionSuggestionListRef } from './MentionSuggestionList';

export type MentionSuggestionItem = { kind: MentionKind; id: string; label: string; sub?: string; score: number };

export type MentionSuggestionExtensionOptions = {
  onJump?: (kind: MentionKind, id: string) => void;
  suggestion: Partial<SuggestionOptions<MentionSuggestionItem>>;
};

const MAX_RESULTS = 8;

// Same data sources + scoreMatch scoring as components/MentionTextarea.tsx's dropdown (tasks
// excl. archived, users, standalone Docs across every Space) — reads the store directly
// (getState(), not the hook) since this runs from inside a ProseMirror plugin, not a React render.
function getMentionSuggestionItems(query: string): MentionSuggestionItem[] {
  const { tasks, users, workspaces } = useTaskStore.getState();
  const q = query.toLowerCase();
  const results: MentionSuggestionItem[] = [];
  for (const t of tasks) {
    if (t.archived) continue;
    const score = q ? scoreMatch(t.title, q) : 1;
    if (score !== null) results.push({ kind: 'task', id: t.id, label: t.title, score });
  }
  for (const u of users) {
    const score = q ? scoreMatch(u.name, q) : 1;
    if (score !== null) results.push({ kind: 'user', id: u.id, label: u.name, score });
  }
  for (const ws of workspaces) {
    for (const space of ws.spaces) {
      for (const doc of space.spaceDocs) {
        const label = doc.title || 'Untitled';
        const score = q ? scoreMatch(label, q) : 1;
        if (score !== null) results.push({ kind: 'doc', id: doc.id, label, sub: space.name, score });
      }
    }
  }
  return results.sort((a, b) => a.score - b.score || a.label.length - b.label.length).slice(0, MAX_RESULTS);
}

export const mentionSuggestionOptions: Partial<SuggestionOptions<MentionSuggestionItem>> = {
  items: ({ query }) => getMentionSuggestionItems(query),

  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, { type: 'mention', attrs: { kind: props.kind, id: props.id, label: props.label } })
      .insertContent(' ')
      .run();
  },

  render: () => {
    let component: ReactRenderer<MentionSuggestionListRef, any>;
    let unmount: (() => void) | undefined;

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionSuggestionList, { props, editor: props.editor });
        unmount = props.mount(component.element as HTMLElement);
      },
      onUpdate: (props) => {
        component.updateProps(props);
      },
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
  },
};

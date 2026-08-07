'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ListChecks, FileText, UserCircle } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';
import { resolveMentionEntity, type MentionKind } from '../../lib/mentions';
import type { MentionSuggestionExtensionOptions } from './mentionSuggestion';

const KIND_ICON: Record<MentionKind, typeof ListChecks> = {
  task: ListChecks,
  doc: FileText,
  user: UserCircle,
};

// Same fixed accent-per-kind palette as components/MentionText.tsx, kept in sync deliberately —
// this is the Tiptap NodeView equivalent of that component's chip, reused here instead of duplicated
// because a <textarea>-based renderer can't be mounted inside a ProseMirror node view.
const KIND_COLOR: Record<MentionKind, string> = {
  task: '#618cd1',
  doc: '#349f7c',
  user: '#8d97a5',
};

// Node view for the `mention` node (lib/collab/mentionNode.ts) — live-resolves the current name
// from the store on every render (same convention as MentionText.tsx) and calls the `onJump`
// callback configured on the extension (components/collab/mentionNodeView.tsx) via extension
// options, since a node view has no other route back to CollabDocEditor's own props/closures.
export default function MentionChip({ node, extension }: ReactNodeViewProps) {
  const { tasks, users, workspaces } = useTaskStore();
  const { kind, id, label } = node.attrs as { kind: MentionKind; id: string; label: string };
  const onJump = (extension.options as MentionSuggestionExtensionOptions).onJump;
  const resolved = resolveMentionEntity(kind, id, label, { tasks, users, workspaces });
  const Icon = KIND_ICON[kind];
  const color = kind === 'user' ? users.find((u) => u.id === id)?.color ?? KIND_COLOR.user : KIND_COLOR[kind];

  if (!resolved.found) {
    return (
      <NodeViewWrapper as="span" className="inline">
        <span
          title="No longer exists"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-medium text-neutral-500 bg-neutral-800/60 line-through align-middle"
          contentEditable={false}
        >
          <Icon className="w-3 h-3 shrink-0" />
          {resolved.label}
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          e.stopPropagation();
          onJump?.(kind, id);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-semibold text-white cursor-pointer hover:brightness-110 transition align-middle"
        style={{ backgroundColor: color }}
      >
        <Icon className="w-3 h-3 shrink-0" />
        {resolved.label}
      </button>
    </NodeViewWrapper>
  );
}
